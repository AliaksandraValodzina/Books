/**
 * **Nothing behind the owner's page is reachable without the secret.**
 *
 * Behind `/admin` is every customer's delivery address, every customer's
 * photograph of their own child, and a print-ready PDF of each. The brief asks
 * for it to be "impossible to reach the list or any file without it", and this
 * file is that sentence in three parts:
 *
 * **It fails closed.** With `ADMIN_SECRET` unset, nobody gets in — which is
 * the opposite of the convention everywhere else in this repository, where an
 * unset variable means a feature politely does nothing. Asserted first because
 * it is the state a first deploy is actually in.
 *
 * **The files refuse too.** A protected page that links to an unprotected
 * download is the usual way a shop leaks its customers, so the print route and
 * the photograph route are called directly, unauthenticated, and must hand
 * back nothing. **And the paired positive**: the same routes with the right
 * secret get past the guard and fail for a different reason, so these are not
 * passing because the routes refuse everybody.
 *
 * **Every admin entry point calls the guard.** The files under `app/admin/`
 * and `app/api/admin/` are read off disk and checked, so the admin page added
 * next year is protected by this test rather than by whoever writes it
 * remembering to be.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COOKIE, allowed, allowedFor, cookieFrom, cookieValueFor } from "../lib/admin/guard";
import { STORE_REQUIRED } from "../lib/orders/config";

const SECRET = "a-long-random-owner-secret-value";

describe("with no ADMIN_SECRET set", () => {
  it("lets nobody in, by any means", () => {
    // Not "a bit open". Nobody.
    for (const attempt of [
      {},
      { cookie: cookieValueFor(SECRET) },
      { cookie: "" },
      { authorization: `Bearer ${SECRET}` },
      { authorization: "Bearer " },
      { cookie: cookieValueFor(""), authorization: "Bearer " },
    ]) {
      const access = allowed({ env: {}, ...attempt });
      expect(access.ok, JSON.stringify(attempt)).toBe(false);
      expect(access.ok === false && access.reason).toBe("unconfigured");
    }
  });

  it("is not opened by a blank or placeholder value either", () => {
    for (const value of ["", " ", "todo", "changeme", "ADMIN_SECRET", "short"]) {
      const access = allowed({ env: { ADMIN_SECRET: value }, authorization: `Bearer ${value}` });
      expect(access.ok, JSON.stringify(value)).toBe(false);
    }
  });
});

describe("with a secret set", () => {
  const env = { ADMIN_SECRET: SECRET };

  it("opens for the cookie it writes", () => {
    expect(allowed({ env, cookie: cookieValueFor(SECRET) }).ok).toBe(true);
  });

  it("opens for the secret as a bearer token, which is how curl gets a file", () => {
    expect(allowed({ env, authorization: `Bearer ${SECRET}` }).ok).toBe(true);
    expect(allowed({ env, authorization: `bearer ${SECRET}` }).ok).toBe(true);
  });

  it("refuses everything else", () => {
    for (const attempt of [
      {},
      { cookie: "" },
      { cookie: SECRET },
      { cookie: cookieValueFor(`${SECRET}x`) },
      { cookie: cookieValueFor(SECRET).slice(0, -1) },
      { authorization: SECRET },
      { authorization: `Bearer ${SECRET}x` },
      { authorization: "Basic abc" },
    ]) {
      const access = allowed({ env, ...attempt });
      expect(access.ok, JSON.stringify(attempt)).toBe(false);
      expect(access.ok === false && access.reason).toBe("denied");
    }
  });

  it("does not put the secret in the cookie", () => {
    // So a cookie lifted from a laptop opens this site and does not hand over
    // a value the owner may well have reused somewhere else.
    const value = cookieValueFor(SECRET);
    expect(value).not.toContain(SECRET);
    expect(value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads one cookie out of a header without a parser", () => {
    expect(cookieFrom(`a=1; ${COOKIE}=xyz; b=2`, COOKIE)).toBe("xyz");
    expect(cookieFrom("a=1", COOKIE)).toBeNull();
    expect(cookieFrom(null, COOKIE)).toBeNull();
  });

  it("asks the same question of a Request", () => {
    const withCookie = new Request("https://e.test/admin", {
      headers: { cookie: `${COOKIE}=${cookieValueFor(SECRET)}` },
    });
    expect(allowedFor(withCookie, env).ok).toBe(true);
    expect(allowedFor(new Request("https://e.test/admin"), env).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The routes, called directly
// ---------------------------------------------------------------------------

/** The routes behind the door, with a reference that is shaped like a real one. */
const REF = "BK-7QX4K2P";

async function routes() {
  return {
    print: (await import("../app/api/admin/print/[ref]/route")).GET,
    photo: (await import("../app/api/admin/photo/[ref]/route")).GET,
    dispatch: (await import("../app/api/admin/dispatch/route")).POST,
  };
}

function withEnv<T>(env: Record<string, string | undefined>, body: () => Promise<T>): Promise<T> {
  const names = ["ADMIN_SECRET", ...STORE_REQUIRED];
  const before = new Map(names.map((n) => [n, process.env[n]]));
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const name of names) if (!(name in env)) delete process.env[name];
  return body().finally(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

describe("the files behind the door", () => {
  it("hand back nothing to a request with no secret", async () => {
    await withEnv({ ADMIN_SECRET: SECRET }, async () => {
      const { print, photo, dispatch } = await routes();
      const params = Promise.resolve({ ref: REF });

      for (const [name, response] of [
        ["the print file", await print(new Request(`https://e.test/api/admin/print/${REF}`), { params })],
        ["the photograph", await photo(new Request(`https://e.test/api/admin/photo/${REF}`), { params })],
        ["dispatch", await dispatch(new Request("https://e.test/api/admin/dispatch", { method: "POST" }))],
      ] as const) {
        expect(response.status, name).toBe(401);
        expect(response.headers.get("content-type"), name).toContain("application/json");
        const text = await response.text();
        // No PDF, no image, and nothing about an order.
        expect(text, name).not.toContain("%PDF");
        expect(text, name).toContain("owner");
      }
    });
  });

  it("hand back nothing with no ADMIN_SECRET configured either", async () => {
    // The state a first deploy is in. An unprotected print file here would be
    // every customer's book, downloadable by anybody who guessed a reference.
    await withEnv({}, async () => {
      const { print, photo } = await routes();
      const params = Promise.resolve({ ref: REF });
      expect((await print(new Request(`https://e.test/api/admin/print/${REF}`), { params })).status).toBe(401);
      expect((await photo(new Request(`https://e.test/api/admin/photo/${REF}`), { params })).status).toBe(401);
    });
  });

  it("hand back nothing to a request with the wrong secret", async () => {
    await withEnv({ ADMIN_SECRET: SECRET }, async () => {
      const { print } = await routes();
      const response = await print(
        new Request(`https://e.test/api/admin/print/${REF}`, {
          headers: { authorization: `Bearer ${SECRET}-nope` },
        }),
        { params: Promise.resolve({ ref: REF }) },
      );
      expect(response.status).toBe(401);
    });
  });

  it("get past the guard with the right secret, so the refusals above are the guard", async () => {
    // The paired positive, and it is what stops this whole describe block from
    // passing because the routes happen to refuse everybody. With the secret
    // right and no store configured the answer is 503 — a different refusal,
    // from the other side of the door.
    await withEnv({ ADMIN_SECRET: SECRET }, async () => {
      const { print, photo } = await routes();
      const headers = { authorization: `Bearer ${SECRET}` };
      const params = Promise.resolve({ ref: REF });
      const printed = await print(new Request(`https://e.test/api/admin/print/${REF}`, { headers }), { params });
      const pictured = await photo(new Request(`https://e.test/api/admin/photo/${REF}`, { headers }), { params });
      expect(printed.status).toBe(503);
      expect(pictured.status).toBe(503);
      expect(await printed.json()).toMatchObject({ detail: "no order store" });
    });
  });

  it("refuse a reference that is not one, so a path cannot be smuggled in", async () => {
    await withEnv({ ADMIN_SECRET: SECRET }, async () => {
      const { print } = await routes();
      const headers = { authorization: `Bearer ${SECRET}` };
      for (const bad of ["../../etc/passwd", "orders/BK-ABCDEFG", "", "BK-ABC"]) {
        const response = await print(new Request("https://e.test/api/admin/print/x", { headers }), {
          params: Promise.resolve({ ref: bad }),
        });
        expect(response.status, bad).toBe(400);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Every entry point, checked structurally
// ---------------------------------------------------------------------------

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const full = path.join(process.cwd(), dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const child = path.join(dir, entry);
    if (statSync(path.join(process.cwd(), child)).isDirectory()) out.push(...filesUnder(child));
    else if (/\.tsx?$/.test(entry)) out.push(child);
  }
  return out;
}

describe("every admin entry point calls the guard", () => {
  const files = [...filesUnder("app/admin"), ...filesUnder("app/api/admin")];

  it("finds the admin files at all, so the check below is not vacuous", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("calls allowed() or allowedFor() in every page and every route", () => {
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      // The shared gate component is the one exception: it is what is rendered
      // *after* a refusal and has nothing to decide.
      if (/_Gate\.tsx$/.test(file)) continue;
      expect(
        /\ballowed(For)?\s*\(/.test(source),
        `${file} is behind /admin and never asks lib/admin/guard.ts whether this request may be here`,
      ).toBe(true);
    }
  });

  it("decides before it reads anything, so no work is done for a stranger", () => {
    // A route that parsed a body or hit a bucket before checking is a route
    // doing an attacker's work for them. The guard call must come first.
    for (const file of files) {
      if (/_Gate\.tsx$/.test(file)) continue;
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      const guardAt = source.search(/\ballowed(For)?\s*\(/);
      for (const later of ["storeFromEnv(", "formData(", "renderBookPdf(", "markDispatched("]) {
        const at = source.indexOf(later);
        if (at < 0) continue;
        expect(guardAt, `${file} reaches ${later} before asking the guard`).toBeLessThan(at);
      }
    }
  });
});
