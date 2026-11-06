/**
 * **What is actually asked of Stripe, read off the wire.**
 *
 * There is no `stripe` dependency here, and the dividend is this file: the
 * request body is a pure function of the order, so every claim the shop makes
 * about a sale — the currency, the amount, that an address is collected, that
 * the reference travels with the payment — is checked as a string rather than
 * through a mock of an SDK that would have been asserting about the mock.
 *
 * The two that would cost real money if wrong:
 *
 * **The amount is minor units.** `AUD 59` is `5900`, and an off-by-a-hundred
 * in either direction is a shop that charges 59 cents or 5,900 dollars.
 *
 * **The idempotency key is the order's own fingerprint**, which is what the
 * brief asks for and what makes a double-click one charge rather than two.
 *
 * And one that would cost more than money: **the secret key never appears in
 * anything this module returns**. The repository is public and so are its logs.
 */

import { describe, expect, it } from "vitest";
import { formEncode, formPairs } from "../lib/stripe/form";
import { SHIPS_TO, createSession, minorUnits, sessionParams } from "../lib/stripe/session";
import { EDITIONS, editionOf } from "../lib/book/editions";
import { claim, memoryStore } from "../lib/orders/store";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { orderFingerprint } from "../lib/book/print";

const DAY = new Date("2026-11-07T04:00:00Z");
const KEY = "sk_test_" + "k".repeat(24);

async function order(editionId = "softcover") {
  const { record } = await claim(memoryStore(), FIXTURE_BOOK_FILL, editionId, DAY);
  return record;
}

describe("form encoding, which is the whole of why there is no SDK", () => {
  it("writes nested parameters the way Stripe reads them", () => {
    expect(formPairs({ a: { b: "c" } })).toEqual([["a[b]", "c"]]);
    expect(formPairs({ a: ["x", "y"] })).toEqual([
      ["a[0]", "x"],
      ["a[1]", "y"],
    ]);
    expect(formPairs({ a: [{ b: 1 }] })).toEqual([["a[0][b]", "1"]]);
  });

  it("drops an absent value rather than sending it empty", () => {
    // Stripe treats an empty string as an instruction to clear a field, which
    // is not the same thing as not mentioning it.
    expect(formPairs({ a: undefined, b: "x" })).toEqual([["b", "x"]]);
  });

  it("percent-encodes both halves", () => {
    expect(formEncode({ "a[b]": "x y&z" })).toBe("a%5Bb%5D=x%20y%26z");
  });
});

describe("minor units", () => {
  it("turns whole dollars into cents", () => {
    expect(minorUnits(59)).toBe(5900);
    expect(minorUnits(69)).toBe(6900);
  });
});

describe("the session this shop asks for", () => {
  it("charges the edition's price, in Australian dollars, once", async () => {
    for (const edition of EDITIONS) {
      const record = await order(edition.id);
      const params = sessionParams({
        record,
        edition,
        successUrl: "https://example.test/order/X?session={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://example.test/preview",
      });
      expect(params["line_items[0][price_data][currency]"]).toBe("aud");
      expect(params["line_items[0][price_data][unit_amount]"]).toBe(edition.price.amount * 100);
      expect(params["line_items[0][quantity]"]).toBe(1);
      expect(params.mode).toBe("payment");
    }
  });

  it("adds nothing to the price at the till", async () => {
    // `app/delivery/page.tsx` says the price is the whole of what is paid, and
    // this is that sentence as an assertion: one line item and no shipping
    // charge of any kind.
    const record = await order();
    const body = formEncode(
      sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }),
    );
    expect(body).not.toContain("shipping_options");
    expect(body).not.toContain("line_items%5B1%5D");
  });

  it("collects a shipping address, and only where this shop will post", async () => {
    const record = await order();
    const params = sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" });
    expect(params["shipping_address_collection[allowed_countries]"]).toEqual([...SHIPS_TO]);
    expect(formEncode(params)).toContain("shipping_address_collection%5Ballowed_countries%5D%5B0%5D=AU");
  });

  it("carries the order's reference on the session and on the payment", async () => {
    // So the reference is findable from either side of Stripe's dashboard, and
    // so the webhook can tell which order an event is about.
    const record = await order();
    const params = sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" });
    expect(params["metadata[ref]"]).toBe(record.ref);
    expect(params["payment_intent_data[metadata][ref]"]).toBe(record.ref);
    expect(params.client_reference_id).toBe(record.ref);
    // And the template revision, so a reprint cannot be traced to the wrong book.
    expect(params["metadata[bookRev]"]).toBe(FIXTURE_BOOK_FILL.bookRev);
  });

  it("names the book on the buyer's own statement", async () => {
    // A charge nobody recognises is a chargeback.
    const record = await order();
    const params = sessionParams({ record, edition: editionOf("hardcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" });
    expect(String(params["line_items[0][price_data][product_data][name]"])).toContain(FIXTURE_BOOK_FILL.name);
    expect(String(params["line_items[0][price_data][product_data][name]"])).toContain("Hardcover");
  });

  it("sends the buyer back to a URL carrying the session id", async () => {
    const record = await order();
    const params = sessionParams({
      record,
      edition: editionOf("softcover"),
      successUrl: `https://e.test/order/${record.ref}?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: "https://e.test/preview",
    });
    expect(params.success_url).toContain("{CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://e.test/preview");
  });

  it("asks for no card details, because the card is typed on Stripe's page", async () => {
    const record = await order();
    const body = formEncode(sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }));
    for (const word of ["card_number", "number", "cvc", "exp_month", "payment_method_data"]) {
      expect(body, word).not.toContain(word);
    }
  });
});

/** A `fetch` that records the request and answers whatever it is told to. */
function recorder(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchLike = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() {
        return typeof body === "string" ? body : JSON.stringify(body);
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchLike };
}

describe("creating the session", () => {
  it("posts to Stripe with the fingerprint as the idempotency key", async () => {
    const record = await order();
    const { calls, fetchLike } = recorder(200, { id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });
    const result = await createSession(
      sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }),
      { secretKey: KEY, idempotencyKey: record.fingerprint, fetchLike },
    );

    expect(result).toEqual({ ok: true, id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });
    expect(calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe(orderFingerprint(FIXTURE_BOOK_FILL));
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  it("reports Stripe's own refusal, and never the key with it", async () => {
    const record = await order();
    const { fetchLike } = recorder(402, { error: { message: "Your card was declined." } });
    const result = await createSession(
      sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }),
      { secretKey: KEY, idempotencyKey: record.fingerprint, fetchLike },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.detail).toBe("Your card was declined.");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("refuses a 200 that is not a session, rather than handing back undefined", async () => {
    const record = await order();
    const { fetchLike } = recorder(200, { id: "cs_1" });
    const result = await createSession(
      sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }),
      { secretKey: KEY, idempotencyKey: record.fingerprint, fetchLike },
    );
    expect(result.ok).toBe(false);
  });

  it("survives an answer that is not JSON at all", async () => {
    const record = await order();
    const { fetchLike } = recorder(502, "<html>bad gateway</html>");
    const result = await createSession(
      sessionParams({ record, edition: editionOf("softcover"), successUrl: "https://e.test/s", cancelUrl: "https://e.test/c" }),
      { secretKey: KEY, idempotencyKey: record.fingerprint, fetchLike },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.detail).toContain("bad gateway");
  });
});
