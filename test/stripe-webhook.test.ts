/**
 * **The one gate between "a URL was visited" and "a customer paid".**
 *
 * `app/api/stripe/webhook/route.ts` is the only caller of `markPaid`, so
 * everything about whether this shop ever posts a book for free is decided by
 * the function this file tests. Four ways it could be wrong and each is a
 * separate test, because each is a different way to lose a book:
 *
 * **Accepting a forged body** — anybody who can POST marks any order paid.
 * **Accepting a replayed one** — one captured real event works forever.
 * **Accepting a tampered one** — the amount or the reference is anybody's to
 * change after the fact.
 * **Rejecting a genuine one** — the money arrives and the captain never finds
 * out, which is the failure that looks like nothing happening.
 *
 * `signPayload` is used to produce genuine signatures, which is the same HMAC
 * the verifier computes — so every test that must **fail** matters more than
 * the one that passes, and each of them is here.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TOLERANCE_SECONDS,
  eventType,
  meansPaid,
  parseSignatureHeader,
  readCompletedCheckout,
  signPayload,
  verifySignature,
} from "../lib/stripe/webhook";

const SECRET = "whsec_" + "s".repeat(32);
const NOW = new Date("2026-11-07T04:00:00Z");

const EVENT = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_1",
      client_reference_id: "BK-ABCDEFG",
      payment_status: "paid",
      currency: "aud",
      amount_total: 5900,
      payment_intent: "pi_test_1",
      metadata: { ref: "BK-ABCDEFG" },
      customer_details: { email: "buyer@example.com", name: "A Buyer" },
      collected_information: {
        shipping_details: {
          name: "A Buyer",
          address: {
            line1: "1 Example St",
            line2: null,
            city: "Sydney",
            state: "NSW",
            postal_code: "2000",
            country: "AU",
          },
        },
      },
    },
  },
};

const payload = JSON.stringify(EVENT);

describe("the signature header", () => {
  it("is read however Stripe spaces it", () => {
    expect(parseSignatureHeader("t=123, v1=abc, v0=zz")).toEqual({ t: 123, v1: ["abc"] });
    expect(parseSignatureHeader("t=123,v1=aa,v1=bb")).toEqual({ t: 123, v1: ["aa", "bb"] });
  });

  it("ignores a v1 that is not hex, because it cannot be a digest", () => {
    expect(parseSignatureHeader("t=1,v1=not-hex").v1).toEqual([]);
  });
});

describe("verifying an event", () => {
  it("accepts a genuine one", () => {
    const header = signPayload(payload, SECRET, NOW);
    expect(verifySignature({ payload, header, secret: SECRET, now: NOW })).toEqual({
      ok: true,
      timestamp: Math.floor(NOW.getTime() / 1000),
    });
  });

  it("refuses a body with no signature at all", () => {
    expect(verifySignature({ payload, header: null, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ payload, header: "", secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ payload, header: "t=123", secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ payload, header: "v1=abc", secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("refuses one signed with a different secret", () => {
    const header = signPayload(payload, `${SECRET}x`, NOW);
    const verdict = verifySignature({ payload, header, secret: SECRET, now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.why).toContain("does not match");
  });

  it("refuses a tampered body under a real signature", () => {
    // The attack this stops: capture one genuine event, change the amount or
    // the reference, send it on.
    const header = signPayload(payload, SECRET, NOW);
    const tampered = payload.replace("5900", "1");
    expect(tampered).not.toBe(payload);
    expect(verifySignature({ payload: tampered, header, secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("refuses a body that is byte-different but means the same thing", () => {
    // Which is why the route must hand over `request.text()` and never a
    // re-serialised object: this is what that mistake looks like.
    const header = signPayload(payload, SECRET, NOW);
    const reserialised = JSON.stringify(JSON.parse(payload), null, 2);
    expect(verifySignature({ payload: reserialised, header, secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("refuses a replay outside the window, in either direction", () => {
    const header = signPayload(payload, SECRET, NOW);
    const late = new Date(NOW.getTime() + (TOLERANCE_SECONDS + 1) * 1000);
    const early = new Date(NOW.getTime() - (TOLERANCE_SECONDS + 1) * 1000);
    expect(verifySignature({ payload, header, secret: SECRET, now: late }).ok).toBe(false);
    expect(verifySignature({ payload, header, secret: SECRET, now: early }).ok).toBe(false);
    // And accepts one just inside it, so the window is a window and not a no.
    const justInside = new Date(NOW.getTime() + (TOLERANCE_SECONDS - 1) * 1000);
    expect(verifySignature({ payload, header, secret: SECRET, now: justInside }).ok).toBe(true);
  });

  it("accepts either signature while a secret is being rotated", () => {
    const t = Math.floor(NOW.getTime() / 1000);
    const old = createHmac("sha256", "whsec_old_one_here_padded_out").update(`${t}.${payload}`).digest("hex");
    const current = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
    expect(verifySignature({ payload, header: `t=${t},v1=${old},v1=${current}`, secret: SECRET, now: NOW }).ok).toBe(true);
    // Refusing the pair would take the endpoint down mid-rotation; accepting
    // one that matches nothing would be no verification at all.
    expect(verifySignature({ payload, header: `t=${t},v1=${old}`, secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("refuses a signature of the wrong length rather than throwing", () => {
    const t = Math.floor(NOW.getTime() / 1000);
    expect(verifySignature({ payload, header: `t=${t},v1=ab`, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ payload, header: `t=${t},v1=`, secret: SECRET, now: NOW }).ok).toBe(false);
  });
});

describe("what the event says", () => {
  it("names its own type", () => {
    expect(eventType(EVENT)).toBe("checkout.session.completed");
    expect(eventType({})).toBeNull();
  });

  it("reads the reference, the money, the email and the address", () => {
    const checkout = readCompletedCheckout(EVENT);
    expect(checkout?.ref).toBe("BK-ABCDEFG");
    expect(checkout?.sessionId).toBe("cs_test_1");
    expect(checkout?.paymentIntentId).toBe("pi_test_1");
    expect(checkout?.amountTotal).toBe(5900);
    expect(checkout?.currency).toBe("aud");
    expect(checkout?.email).toBe("buyer@example.com");
    expect(checkout?.address).toEqual({
      name: "A Buyer",
      line1: "1 Example St",
      line2: null,
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: "AU",
    });
  });

  it("reads the address from the older place Stripe used to put it", () => {
    // An account's API version is a dashboard setting nobody here controls, and
    // Stripe moved shipping details under `collected_information`. Both shapes
    // have to work or the address silently vanishes on one of them.
    const old = structuredClone(EVENT) as Record<string, any>;
    old.data.object.shipping_details = old.data.object.collected_information.shipping_details;
    delete old.data.object.collected_information;
    expect(readCompletedCheckout(old)?.address?.line1).toBe("1 Example St");
  });

  it("reads a payment intent given as an object rather than an id", () => {
    const expanded = structuredClone(EVENT) as Record<string, any>;
    expanded.data.object.payment_intent = { id: "pi_expanded" };
    expect(readCompletedCheckout(expanded)?.paymentIntentId).toBe("pi_expanded");
  });

  it("is null rather than a crash for an event with no session in it", () => {
    expect(readCompletedCheckout({})).toBeNull();
    expect(readCompletedCheckout({ data: { object: {} } })).toBeNull();
  });

  it("survives an event with nothing optional on it", () => {
    const bare = { data: { object: { id: "cs_x" } } };
    const checkout = readCompletedCheckout(bare);
    expect(checkout?.sessionId).toBe("cs_x");
    expect(checkout?.ref).toBeNull();
    expect(checkout?.address).toBeNull();
    expect(checkout?.amountTotal).toBeNull();
  });

  it("only calls it paid when Stripe says the money is there", () => {
    expect(meansPaid(readCompletedCheckout(EVENT)!)).toBe(true);
    for (const status of ["unpaid", "no_payment", "", null]) {
      const other = structuredClone(EVENT) as Record<string, any>;
      other.data.object.payment_status = status;
      expect(meansPaid(readCompletedCheckout(other)!), String(status)).toBe(false);
    }
    // The one other value that genuinely means the customer owes nothing.
    const free = structuredClone(EVENT) as Record<string, any>;
    free.data.object.payment_status = "no_payment_required";
    expect(meansPaid(readCompletedCheckout(free)!)).toBe(true);
  });
});
