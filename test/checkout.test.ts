/**
 * **Whether this shop can take money, and the one answer it must never give.**
 *
 * The failure being prevented is a *fake success*: a customer who finishes a
 * page, presses the button, and is shown anything resembling a confirmation
 * has been told a lie about a gift they are relying on. `test/funnel.test.tsx`
 * renders the page and asserts the words; this file asserts the decision, over
 * every environment a first deploy actually produces.
 *
 * Most of those are not "set" versus "unset". They are the half-set states — a
 * row saved empty, a name pasted where a key goes, a key with a newline from a
 * copy — and every one of them reads as configured to a naive check and then
 * fails somewhere further in, where the failure looks like a crash rather than
 * a notice.
 */

import { describe, expect, it } from "vitest";
import {
  NOT_CONFIGURED,
  NOT_TAKEN,
  REQUIRED,
  checkoutState,
  copyFor,
  isSet,
  statusFor,
} from "../lib/checkout";
import { STORE_REQUIRED } from "../lib/orders/config";

const LIVE = "sk_live_" + "A".repeat(24);
const TEST = "sk_test_" + "A".repeat(24);

/**
 * **Everything the money path needs, with a plausible value in every row.**
 *
 * Built from `REQUIRED` rather than typed out, so adding a variable to the
 * money path makes every test below exercise it instead of silently leaving
 * one row empty and testing the unconfigured case by accident.
 */
function configured(key = LIVE): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of REQUIRED) env[name] = `value-for-${name.toLowerCase()}`;
  env.STRIPE_SECRET_KEY = key;
  return env;
}

describe("reading the environment", () => {
  it("calls a missing key missing", () => {
    expect(checkoutState({})).toEqual({ kind: "unconfigured", missing: [...REQUIRED] });
    expect(checkoutState({ STRIPE_SECRET_KEY: undefined }).kind).toBe("unconfigured");
  });

  it("refuses a Stripe key with nothing behind it, and says what is behind it", () => {
    // The worse half-configured state, and the reason `REQUIRED` grew: with a
    // key and no webhook secret the card is charged and no event can ever be
    // verified, so nothing may mark the order paid; with a key and no bucket
    // the order is written nowhere and the customer is owed a book nobody can
    // print. Both are money taken for a book that does not get made.
    const state = checkoutState({ STRIPE_SECRET_KEY: LIVE });
    expect(state.kind).toBe("unconfigured");
    const missing = state.kind === "unconfigured" ? state.missing : [];
    expect(missing).toContain("STRIPE_WEBHOOK_SECRET");
    for (const name of STORE_REQUIRED) expect(missing).toContain(name);
    expect(missing).not.toContain("STRIPE_SECRET_KEY");
  });

  it("refuses when only the order store is missing", () => {
    const env = configured();
    for (const name of STORE_REQUIRED) delete env[name];
    const state = checkoutState(env);
    expect(state.kind).toBe("unconfigured");
    expect(state.kind === "unconfigured" && state.missing).toEqual([...STORE_REQUIRED]);
  });

  it("calls a blank or placeholder key missing", () => {
    // Every one of these is a real thing a dashboard row contains after a
    // hurried first deploy, and every one would read as configured to a
    // `if (process.env.X)` check.
    for (const value of ["", " ", "   \n ", "-", "todo", "TODO", "changeme", "sk_test_...", "your_key_here", "STRIPE_SECRET_KEY", "short"]) {
      expect(
        checkoutState({ ...configured(), STRIPE_SECRET_KEY: value }).kind,
        JSON.stringify(value),
      ).toBe("unconfigured");
    }
  });

  it("accepts a fully configured environment, so the refusals are not a blanket no", () => {
    expect(checkoutState(configured(LIVE))).toEqual({ kind: "live" });
    expect(checkoutState(configured(TEST))).toEqual({ kind: "test" });
  });

  it("tolerates the whitespace a copy and paste leaves behind", () => {
    expect(checkoutState(configured(`  ${LIVE}\n`))).toEqual({ kind: "live" });
  });

  it("tells a test key from a live one", () => {
    // A shop whose live button charges nobody is the other way to lie by
    // accident, so the two are different states rather than both "ready".
    expect(checkoutState(configured(TEST)).kind).toBe("test");
    expect(checkoutState(configured(LIVE)).kind).toBe("live");
  });

  it("ignores everything else in the environment", () => {
    const noisy = { PATH: "/usr/bin", NODE_ENV: "production", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(checkoutState(noisy).kind).toBe("unconfigured");
  });

  it("names what is missing, so a deployer knows what to set", () => {
    const state = checkoutState({});
    expect(state.kind === "unconfigured" && state.missing).toEqual([...REQUIRED]);
  });
});

describe("isSet", () => {
  it("is false for anything that is not a usable string", () => {
    for (const value of [undefined, "", "  ", "todo", "sk_live_..."]) {
      expect(isSet(value as string | undefined), JSON.stringify(value)).toBe(false);
    }
  });

  it("is true for a plausible key", () => {
    expect(isSet(LIVE)).toBe(true);
  });
});

describe("what is said and with what status", () => {
  it("never answers a successful status", () => {
    // The machine-readable half of a fake success. Something will eventually
    // read this, and a 200 from a shop that took no money is a wrong answer.
    for (const env of [{}, { STRIPE_SECRET_KEY: TEST }, configured(TEST), configured(LIVE)]) {
      const status = statusFor(checkoutState(env));
      expect(status, `status for ${JSON.stringify(Object.keys(env))}`).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(200);
    }
  });

  it("is 503 when the shop is not open, and 502 when the provider would not play", () => {
    // Not 500: the shop is not broken, it is not open. And 502 for the other
    // case, because a configured shop that cannot reach Stripe has failed
    // genuinely upstream.
    expect(statusFor({ kind: "unconfigured", missing: [] })).toBe(503);
    expect(statusFor({ kind: "test" })).toBe(502);
    expect(statusFor({ kind: "live" })).toBe(502);
  });

  it("says nothing a customer could read as a confirmation", () => {
    for (const state of [{ kind: "unconfigured" as const, missing: [] }, { kind: "test" as const }, { kind: "live" as const }]) {
      const copy = copyFor(state);
      const all = `${copy.heading} ${copy.body} ${copy.honest}`.toLowerCase();
      for (const lie of ["thank you", "confirmed", "payment received", "successfully", "on its way"]) {
        expect(all, `"${lie}" in ${state.kind}`).not.toContain(lie);
      }
      // And it does say the thing that is true.
      expect(all).toContain("charged");
    }
  });

  it("would catch a confirmation if one were written, so that check can fail", () => {
    const pretend = "Thank you — your order is confirmed".toLowerCase();
    expect(pretend).toContain("confirmed");
  });

  it("tells the customer their work is safe, because it is", () => {
    // The draft is in their own browser and nothing on this path has touched
    // it, so this is a fact rather than a reassurance.
    expect(NOT_CONFIGURED.body).toContain("still in this browser");
    expect(NOT_TAKEN.honest).toContain("still in this browser");
  });
});

describe("the variables named here and in .env.example", () => {
  it("agree, so a deployer is not told to set a name nothing reads", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile("./.env.example", "utf8");
    for (const name of REQUIRED) {
      expect(example, `.env.example does not name ${name}`).toContain(`${name}=`);
    }
  });

  it("carries no value for any variable, because the repository is public", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile("./.env.example", "utf8");
    for (const line of example.split("\n")) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      expect(line, `"${line}" carries a value`).toMatch(/^[A-Z0-9_]+=$/);
    }
  });
});
