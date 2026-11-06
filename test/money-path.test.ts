/**
 * **The money path end to end, and the two answers it must never give.**
 *
 * **It must never take money it cannot record.** So with the environment
 * half-configured the till refuses, says nothing has been charged, and names
 * the rows that are empty. There is no local pretend-success path and this
 * file is what keeps it that way: the route is called with no keys at all,
 * which is the state every developer and every first deploy is in.
 *
 * **Nothing but a verified webhook may mark an order paid.** That is asserted
 * from the other direction too: a forged event, a tampered event, a replayed
 * event and an event for an order this shop never wrote down all leave the
 * order exactly as it was. `lib/orders/receive.ts` exists so that these can be
 * asked with a real store behind them rather than only at the HTTP edge.
 */

import { describe, expect, it } from "vitest";
import { POST as checkoutPost, GET as checkoutGet } from "../app/api/checkout/route";
import { POST as webhookPost, GET as webhookGet } from "../app/api/stripe/webhook/route";
import { receiveStripeEvent } from "../lib/orders/receive";
import { claim, memoryStore } from "../lib/orders/store";
import { signPayload, TOLERANCE_SECONDS } from "../lib/stripe/webhook";
import { REQUIRED } from "../lib/checkout";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { readFile } from "node:fs/promises";

const SECRET = "whsec_" + "s".repeat(32);
const DAY = new Date("2026-11-07T04:00:00Z");
const LATER = new Date("2026-11-07T04:02:00Z");

/** Every variable in the money path cleared, which is a fresh deploy. */
function withNoKeys<T>(body: () => Promise<T>): Promise<T> {
  const before = new Map(REQUIRED.map((n) => [n, process.env[n]]));
  for (const name of REQUIRED) delete process.env[name];
  return body().finally(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

async function photos() {
  const asset = FIXTURE_BOOK_FILL.photo!.asset;
  const bytes = await readFile(`fixtures/assets/${asset.sha256}.png`);
  return { [asset.sha256]: `data:image/png;base64,${bytes.toString("base64")}` };
}

function order(body: unknown) {
  return new Request("https://e.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("the till with nothing configured", () => {
  it("refuses with 503 and says nothing has been charged", async () => {
    const response = await withNoKeys(() =>
      checkoutPost(order({ fill: FIXTURE_BOOK_FILL, editionId: "softcover", photos: {} })),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.state).toBe("unconfigured");
    expect(String(body.detail).toLowerCase()).toContain("nothing has been charged");
    // And no URL to send anybody anywhere: there is no session.
    expect(body.url).toBeUndefined();
  });

  it("names every row a deployer has to fill, and carries no value for any", async () => {
    const response = await withNoKeys(() =>
      checkoutPost(order({ fill: FIXTURE_BOOK_FILL, editionId: "softcover", photos: {} })),
    );
    const body = await response.json();
    expect(body.missing).toEqual([...REQUIRED]);
    // A response that echoed a key would publish it: the repository is public
    // and so are its logs.
    expect(JSON.stringify(body)).not.toMatch(/sk_(test|live)_/);
  });

  it("says nothing a customer could read as a confirmation", async () => {
    const supplied = await photos();
    const response = await withNoKeys(() =>
      checkoutPost(order({ fill: FIXTURE_BOOK_FILL, editionId: "softcover", photos: supplied })),
    );
    const text = JSON.stringify(await response.json()).toLowerCase();
    for (const lie of ["thank you", "confirmed", "payment received", "on its way", "successfully"]) {
      expect(text, lie).not.toContain(lie);
    }
  });

  it("sends a browser form to the page that explains it, as a GET", async () => {
    const response = await withNoKeys(() =>
      checkoutPost(
        new Request("https://e.test/api/checkout", {
          method: "POST",
          headers: { accept: "text/html" },
          body: "{}",
        }),
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/checkout");
  });

  it("answers a hand-typed URL rather than a blank page", async () => {
    const response = await withNoKeys(() => checkoutGet());
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(String((await response.json()).detail)).toContain("Nothing has been charged");
  });
});

describe("the webhook endpoint with nothing configured", () => {
  it("answers 503 rather than pretending to have handled an event", async () => {
    const response = await withNoKeys(() =>
      webhookPost(new Request("https://e.test/api/stripe/webhook", { method: "POST", body: "{}" })),
    );
    expect(response.status).toBe(503);
  });

  it("has no GET", async () => {
    const response = await webhookGet();
    expect(response.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// What it takes to mark an order paid
// ---------------------------------------------------------------------------

function completedEvent(ref: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        currency: "aud",
        amount_total: 5900,
        payment_intent: "pi_test_1",
        metadata: { ref },
        customer_details: { email: "buyer@example.com", name: "A Buyer" },
        collected_information: {
          shipping_details: {
            name: "A Buyer",
            address: { line1: "1 Example St", city: "Sydney", state: "NSW", postal_code: "2000", country: "AU" },
          },
        },
        ...overrides,
      },
    },
  });
}

async function awaiting() {
  const store = memoryStore();
  const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
  return { store, record };
}

describe("only a verified event marks an order paid", () => {
  it("marks it paid when the signature is genuine", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store,
    });

    expect(receipt).toMatchObject({ ok: true, status: 200, ref: record.ref, paid: true });
    const after = await store.get(record.ref);
    expect(after?.payment).toBe("paid");
    expect(after?.charged).toEqual({ currency: "aud", minorUnits: 5900 });
    expect(after?.address?.city).toBe("Sydney");
    expect(after?.email).toBe("buyer@example.com");
    expect(after?.paidAt).toBe(LATER.toISOString());
  });

  it("leaves it alone for a forged signature", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    for (const header of [
      null,
      "",
      "t=1,v1=deadbeef",
      signPayload(payload, "whsec_a_different_secret_entirely", LATER),
    ]) {
      const receipt = await receiveStripeEvent({ payload, header, secret: SECRET, now: LATER, store });
      expect(receipt.ok, String(header)).toBe(false);
      expect(receipt.ok === false && receipt.status).toBe(400);
      expect((await store.get(record.ref))?.payment, String(header)).toBe("awaiting");
    }
  });

  it("leaves it alone for a body tampered with after signing", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    const header = signPayload(payload, SECRET, LATER);
    const tampered = payload.replace("5900", "100");
    const receipt = await receiveStripeEvent({ payload: tampered, header, secret: SECRET, now: LATER, store });
    expect(receipt.ok).toBe(false);
    expect((await store.get(record.ref))?.payment).toBe("awaiting");
  });

  it("leaves it alone for a replay from outside the window", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    const header = signPayload(payload, SECRET, LATER);
    const muchLater = new Date(LATER.getTime() + (TOLERANCE_SECONDS + 60) * 1000);
    const receipt = await receiveStripeEvent({ payload, header, secret: SECRET, now: muchLater, store });
    expect(receipt.ok).toBe(false);
    expect((await store.get(record.ref))?.payment).toBe("awaiting");
  });

  it("leaves it alone when Stripe says the money is not there", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref, { payment_status: "unpaid" });
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store,
    });
    // Acknowledged — there is nothing for Stripe to retry — and not paid.
    expect(receipt).toMatchObject({ ok: true, status: 200, paid: false });
    expect((await store.get(record.ref))?.payment).toBe("awaiting");
  });

  it("answers 404 for an order this shop never wrote down", async () => {
    const { store } = await awaiting();
    const payload = completedEvent("BK-ZZZZZZZ");
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store,
    });
    expect(receipt).toMatchObject({ ok: false, status: 404 });
  });

  it("acknowledges an event type it does not handle, and changes nothing", async () => {
    const { store, record } = await awaiting();
    const payload = JSON.stringify({ type: "payment_intent.created", data: { object: { id: "pi_1" } } });
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store,
    });
    expect(receipt).toMatchObject({ ok: true, status: 200, ignored: "payment_intent.created", paid: false });
    expect((await store.get(record.ref))?.payment).toBe("awaiting");
  });

  it("answers 503 with no store, so Stripe retries rather than giving up", async () => {
    const payload = completedEvent("BK-7QX4K2P");
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store: null,
    });
    expect(receipt).toMatchObject({ ok: false, status: 503 });
  });
});

describe("Stripe's retries", () => {
  it("send the confirmation once, and acknowledge the rest", async () => {
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    const header = signPayload(payload, SECRET, LATER);
    const sent: string[] = [];
    const deliver = async (r: { ref: string }) => {
      sent.push(r.ref);
      return true;
    };

    const first = await receiveStripeEvent({ payload, header, secret: SECRET, now: LATER, store, deliver });
    const second = await receiveStripeEvent({ payload, header, secret: SECRET, now: LATER, store, deliver });

    expect(first).toMatchObject({ paid: true, emailed: true });
    expect(second).toMatchObject({ paid: true, already: true });
    expect(sent).toEqual([record.ref]);
    expect((await store.get(record.ref))?.emailed).toBe(true);
  });

  it("still succeed when the email provider does not", async () => {
    // The money arrived. An email failure must not turn that into a retried
    // event and eventually an order that looks abandoned.
    const { store, record } = await awaiting();
    const payload = completedEvent(record.ref);
    const receipt = await receiveStripeEvent({
      payload,
      header: signPayload(payload, SECRET, LATER),
      secret: SECRET,
      now: LATER,
      store,
      deliver: async () => {
        throw new Error("provider down");
      },
    });
    expect(receipt).toMatchObject({ ok: true, status: 200, paid: true, emailed: false });
    const after = await store.get(record.ref);
    expect(after?.payment).toBe("paid");
    // And the captain can see that it did not go.
    expect(after?.emailed).toBe(false);
  });
});
