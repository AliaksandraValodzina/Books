/**
 * **The confirmation, on the page and in the email, saying the same five
 * things.**
 *
 * The brief names them: the order reference, what was ordered, the name as it
 * will be printed **large and alone**, the dispatch window, and the 24-hour
 * promise with how to use it. Both surfaces are built from
 * `lib/email/order.ts`, so this file checks the five once in each and checks
 * that neither invents a sixth.
 *
 * **The email matters more than the page.** It is the only thing from this
 * business that every buyer keeps, and it is where a typo is caught in the one
 * window where catching it is free. So it is tested as text, line by line, and
 * the assertions include what it must **not** contain: a discount, a second
 * product, a share link, and the captain's unadvertised reprint rule.
 *
 * The page is rendered with `renderToStaticMarkup`, which is this repository's
 * rule for React — `CLAUDE.md` § React here is glue. Everything stateful is
 * tested where it is pure.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CHANGE_WINDOW_HOURS, DISPATCH_WINDOW, changeSentence, confirmation, emailFor } from "../lib/email/order";
import { EMAIL_REQUIRED, sendEmail } from "../lib/email/send";
import { BRAND, FORMER_NAMES } from "../lib/brand";
import { claim, markPaid, memoryStore } from "../lib/orders/store";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { FIRST_BOOK } from "../templates/first-book";
import { editionOf, priceOf } from "../lib/book/editions";
import type { OrderRecord } from "../lib/orders/record";

const DAY = new Date("2026-11-07T04:00:00Z");
const LATER = new Date("2026-11-07T04:02:00Z");

async function paidOrder(editionId = "hardcover"): Promise<OrderRecord> {
  const store = memoryStore();
  const { record } = await claim(store, FIXTURE_BOOK_FILL, editionId, DAY);
  const result = await markPaid(
    store,
    record.ref,
    {
      sessionId: "cs_test_1",
      paymentIntentId: "pi_test_1",
      charged: { currency: "aud", minorUnits: editionOf(editionId).price.amount * 100 },
      address: {
        name: "A Buyer",
        line1: "1 Example St",
        line2: null,
        city: "Sydney",
        state: "NSW",
        postalCode: "2000",
        country: "AU",
      },
      email: "buyer@example.com",
    },
    LATER,
  );
  return result!.record;
}

describe("what the confirmation says", () => {
  it("is the five things the brief asks for, and takes them from the record", async () => {
    const record = await paidOrder();
    const c = confirmation(record, FIRST_BOOK.name);
    expect(c.ref).toBe(record.ref);
    expect(c.name).toBe(FIXTURE_BOOK_FILL.name);
    expect(c.ordered).toContain(FIRST_BOOK.name);
    expect(c.ordered).toContain("Hardcover");
    expect(c.dispatchWindow).toBe(DISPATCH_WINDOW);
    expect(c.paid).toBe(true);
    expect(c.charged).toBe("AUD 69");
    expect(c.address).toEqual(["A Buyer", "1 Example St", "Sydney NSW 2000", "AU"]);
  });

  it("shows what Stripe took rather than what the price list says", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const paid = await markPaid(
      store,
      record.ref,
      { sessionId: "cs_1", paymentIntentId: null, charged: { currency: "aud", minorUnits: 4900 }, address: null, email: null },
      LATER,
    );
    expect(confirmation(paid!.record, FIRST_BOOK.name).charged).toBe("AUD 49");
  });

  it("knows when the payment has not been confirmed yet", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const c = confirmation(record, FIRST_BOOK.name);
    expect(c.paid).toBe(false);
    expect(c.charged).toBeNull();
  });
});

describe("the 24-hour promise", () => {
  it("says how to use it, not merely that it exists", async () => {
    const sentence = changeSentence("BK-ABCDEFG");
    expect(sentence).toContain(String(CHANGE_WINDOW_HOURS));
    expect(sentence).toContain("BK-ABCDEFG");
    // The "how": an address and a reference to quote.
    expect(sentence).toContain(BRAND.support);
  });

  it("uses the deployment's own address when one is set", () => {
    expect(changeSentence("BK-ABCDEFG", "help@example.test")).toContain("help@example.test");
  });

  it("says we have not printed it yet, because that is why it is possible", () => {
    expect(changeSentence("BK-ABCDEFG").toLowerCase()).toContain("not printed it yet");
  });
});

describe("the email, which is the thing the buyer keeps", () => {
  it("names the reference and the child in the subject, so an inbox search finds it", async () => {
    const record = await paidOrder();
    const email = emailFor({ record, bookName: FIRST_BOOK.name });
    expect(email.subject).toContain(record.ref);
    expect(email.subject).toContain(FIXTURE_BOOK_FILL.name);
    // No exclamation mark and no "thank you for your purchase": a subject
    // line's job here is to be findable.
    expect(email.subject).not.toContain("!");
    expect(email.subject.toLowerCase()).not.toContain("thank you");
  });

  it("puts the name alone on its own line", async () => {
    const record = await paidOrder();
    const lines = emailFor({ record, bookName: FIRST_BOOK.name }).text.split("\n");
    const alone = lines.filter((line) => line.trim() === FIXTURE_BOOK_FILL.name);
    expect(alone).toHaveLength(1);
    // And nothing beside it, because a name inside a sentence gets skimmed.
    expect(alone[0].trim()).toBe(FIXTURE_BOOK_FILL.name);
  });

  it("says all five things", async () => {
    const record = await paidOrder();
    const text = emailFor({ record, bookName: FIRST_BOOK.name, url: "https://e.test/order/x" }).text;
    expect(text).toContain(record.ref);
    expect(text).toContain(FIXTURE_BOOK_FILL.name);
    expect(text).toContain(FIRST_BOOK.name);
    expect(text).toContain(DISPATCH_WINDOW);
    expect(text).toContain(String(CHANGE_WINDOW_HOURS));
    expect(text).toContain("https://e.test/order/x");
    // And where it is going, which a buyer checks more often than anything.
    expect(text).toContain("1 Example St");
  });

  it("is free of marketing, which is the only requirement it really has", async () => {
    const record = await paidOrder();
    const text = emailFor({ record, bookName: FIRST_BOOK.name }).text.toLowerCase();
    for (const noise of [
      "discount",
      "promo",
      "coupon",
      "% off",
      "follow us",
      "share",
      "instagram",
      "newsletter",
      "unsubscribe",
      "shop now",
      "you may also like",
      "refer a friend",
    ]) {
      expect(text, noise).not.toContain(noise);
    }
  });

  it("never mentions the unadvertised reprint rule", async () => {
    // `docs/pricing.md`: nothing that reaches a customer may mention it.
    const record = await paidOrder();
    const text = emailFor({ record, bookName: FIRST_BOOK.name }).text.toLowerCase();
    for (const phrase of ["typo", "your own mistake", "misspell"]) {
      expect(text, phrase).not.toContain(phrase);
    }
  });

  it("never names a shop this is not called any more", async () => {
    const record = await paidOrder();
    const email = emailFor({ record, bookName: FIRST_BOOK.name });
    const all = `${email.subject} ${email.text}`.toLowerCase();
    for (const former of FORMER_NAMES) expect(all, former).not.toContain(former);
    expect(email.text).toContain(BRAND.name);
  });

  it("prices it as it was actually charged", async () => {
    const record = await paidOrder("softcover");
    const text = emailFor({ record, bookName: FIRST_BOOK.name }).text;
    expect(text).toContain(priceOf(editionOf("softcover").price));
  });
});

describe("sending it", () => {
  it("says so honestly when no provider is configured", async () => {
    const result = await sendEmail({ to: "buyer@example.com", email: { subject: "s", text: "t" }, env: {} });
    expect(result).toEqual({ sent: false, reason: "unconfigured", missing: [...EMAIL_REQUIRED] });
  });

  it("posts the plain text and nothing else when it is", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fetchLike = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) };
      return { ok: true, status: 200, async text() { return "{}"; } } as Response;
    }) as unknown as typeof fetch;

    const result = await sendEmail({
      to: "buyer@example.com",
      email: { subject: "Order BK-ABCDEFG", text: "the body" },
      env: { RESEND_API_KEY: "re_a_long_enough_key", ORDER_EMAIL_FROM: "orders@example.test" },
      fetchLike,
    });
    expect(result).toEqual({ sent: true });
    expect(seen!.url).toContain("resend.com");
    expect(seen!.body).toEqual({
      from: "orders@example.test",
      to: ["buyer@example.com"],
      subject: "Order BK-ABCDEFG",
      text: "the body",
    });
    // No HTML part: there is nothing in this message that needs one.
    expect(JSON.stringify(seen!.body)).not.toContain("html");
  });

  it("reports a refusal rather than throwing into the webhook", async () => {
    const fetchLike = (async () =>
      ({ ok: false, status: 422, async text() { return "domain not verified"; } }) as Response) as unknown as typeof fetch;
    const result = await sendEmail({
      to: "buyer@example.com",
      email: { subject: "s", text: "t" },
      env: { RESEND_API_KEY: "re_a_long_enough_key", ORDER_EMAIL_FROM: "orders@example.test" },
      fetchLike,
    });
    expect(result.sent).toBe(false);
    expect(result.sent === false && result.reason).toBe("refused");
  });

  it("never puts the key in what it returns", async () => {
    const key = "re_a_very_secret_key_value";
    const fetchLike = (async () =>
      ({ ok: false, status: 500, async text() { return "boom"; } }) as Response) as unknown as typeof fetch;
    const result = await sendEmail({
      to: "buyer@example.com",
      email: { subject: "s", text: "t" },
      env: { RESEND_API_KEY: key, ORDER_EMAIL_FROM: "orders@example.test" },
      fetchLike,
    });
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it("does not throw when the network does", async () => {
    const fetchLike = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const result = await sendEmail({
      to: "buyer@example.com",
      email: { subject: "s", text: "t" },
      env: { RESEND_API_KEY: "re_a_long_enough_key", ORDER_EMAIL_FROM: "orders@example.test" },
      fetchLike,
    });
    expect(result.sent).toBe(false);
  });

  it("names the service it needs in .env.example", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile("./.env.example", "utf8");
    for (const name of EMAIL_REQUIRED) expect(example).toContain(`${name}=`);
  });
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** The page is a server component reading `process.env`; this renders it. */
async function orderPageMarkup(ref: string, session: string, env: Record<string, string | undefined>) {
  const { default: OrderPage } = await import("../app/order/[ref]/page");
  const names = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const before = new Map(names.map((n) => [n, process.env[n]]));
  for (const name of names) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name]!;
  }
  try {
    const node = await OrderPage({
      params: Promise.resolve({ ref }),
      searchParams: Promise.resolve({ session }),
    });
    return renderToStaticMarkup(node);
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("the order page with no store configured", () => {
  it("says so rather than pretending there is an order", async () => {
    const markup = await orderPageMarkup("BK-7QX4K2P", "cs_test_1", {});
    expect(markup).toContain("Orders are not switched on here");
    expect(markup.toLowerCase()).toContain("nothing has been charged");
    // And never a confirmation of anything.
    for (const lie of ["thank you", "your order is confirmed", "payment received"]) {
      expect(markup.toLowerCase(), lie).not.toContain(lie);
    }
  });
});
