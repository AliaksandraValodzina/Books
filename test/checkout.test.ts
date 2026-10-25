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
  NOT_IMPLEMENTED,
  REQUIRED,
  checkoutState,
  copyFor,
  isSet,
  statusFor,
} from "../lib/checkout";

const LIVE = "sk_live_" + "A".repeat(24);
const TEST = "sk_test_" + "A".repeat(24);

describe("reading the environment", () => {
  it("calls a missing key missing", () => {
    expect(checkoutState({})).toEqual({ kind: "unconfigured", missing: ["STRIPE_SECRET_KEY"] });
    expect(checkoutState({ STRIPE_SECRET_KEY: undefined }).kind).toBe("unconfigured");
  });

  it("calls a blank or placeholder key missing", () => {
    // Every one of these is a real thing a dashboard row contains after a
    // hurried first deploy, and every one would read as configured to a
    // `if (process.env.X)` check.
    for (const value of ["", " ", "   \n ", "-", "todo", "TODO", "changeme", "sk_test_...", "your_key_here", "STRIPE_SECRET_KEY", "short"]) {
      expect(checkoutState({ STRIPE_SECRET_KEY: value }).kind, JSON.stringify(value)).toBe(
        "unconfigured",
      );
    }
  });

  it("accepts a real key, so the refusals above are not a blanket no", () => {
    expect(checkoutState({ STRIPE_SECRET_KEY: LIVE })).toEqual({ kind: "live" });
    expect(checkoutState({ STRIPE_SECRET_KEY: TEST })).toEqual({ kind: "test" });
  });

  it("tolerates the whitespace a copy and paste leaves behind", () => {
    expect(checkoutState({ STRIPE_SECRET_KEY: `  ${LIVE}\n` })).toEqual({ kind: "live" });
  });

  it("tells a test key from a live one", () => {
    // A shop whose live button charges nobody is the other way to lie by
    // accident, so the two are different states rather than both "ready".
    expect(checkoutState({ STRIPE_SECRET_KEY: TEST }).kind).toBe("test");
    expect(checkoutState({ STRIPE_SECRET_KEY: LIVE }).kind).toBe("live");
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
    for (const key of [undefined, TEST, LIVE]) {
      const status = statusFor(checkoutState({ STRIPE_SECRET_KEY: key }));
      expect(status, `status for key=${key}`).toBeGreaterThanOrEqual(400);
      expect(status).not.toBe(200);
    }
  });

  it("is 503 when the shop is not open, and 501 when it is unfinished", () => {
    // Not 500: the shop is not broken, it is not open.
    expect(statusFor({ kind: "unconfigured", missing: [] })).toBe(503);
    expect(statusFor({ kind: "test" })).toBe(501);
    expect(statusFor({ kind: "live" })).toBe(501);
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
    expect(NOT_IMPLEMENTED.honest).toContain("still in this browser");
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
