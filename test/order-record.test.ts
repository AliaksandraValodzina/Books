/**
 * **The order record: the one document that has to survive everything.**
 *
 * Three claims are made about it in `lib/orders/record.ts` and each one costs a
 * customer's book if it is wrong:
 *
 * **A reference is derived, not allocated**, which is the whole of how a
 * double-click becomes one order instead of two. So the same order on the same
 * day must compute the same reference, and a different order must not.
 *
 * **Reading is tolerant.** A record read back in a year was written by a build
 * nobody has the source of, and what is being decided is whether a paid-for
 * book can still be printed. A missing optional field must read as its sane
 * absence; a record that is not a record at all must be loudly `null` so the
 * admin page can say so rather than rendering a ghost.
 *
 * **Nothing invents a payment.** Anything that is not exactly `"paid"` is
 * `"awaiting"`, because the safe direction to be wrong in is the one where the
 * captain looks at the order rather than the one where a book is posted free.
 */

import { describe, expect, it } from "vitest";
import {
  REFERENCE_PATTERN,
  addressLines,
  chargedAs,
  isReference,
  readRecord,
  referenceFor,
  summaryOf,
  type OrderRecord,
} from "../lib/orders/record";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { orderFingerprint } from "../lib/book/print";

const fingerprint = orderFingerprint(FIXTURE_BOOK_FILL);
const DAY = new Date("2026-11-07T04:00:00Z");

function record(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    schema: 1,
    ref: referenceFor(fingerprint, DAY),
    fingerprint,
    fill: FIXTURE_BOOK_FILL,
    editionId: "softcover",
    asked: { currency: "AUD", amount: 59 },
    charged: null,
    payment: "awaiting",
    sessionId: null,
    paymentIntentId: null,
    address: null,
    email: null,
    emailed: false,
    dispatch: null,
    createdAt: DAY.toISOString(),
    paidAt: null,
    updatedAt: DAY.toISOString(),
    ...overrides,
  };
}

describe("the reference", () => {
  it("is the same for the same order on the same day, which is what stops a double-click", () => {
    expect(referenceFor(fingerprint, DAY)).toBe(referenceFor(fingerprint, DAY));
    // And not merely because the function is called twice with one object: a
    // different moment of the same day is still the same reference.
    expect(referenceFor(fingerprint, new Date("2026-11-07T23:59:00Z"))).toBe(
      referenceFor(fingerprint, DAY),
    );
  });

  it("is different for a different order", () => {
    const other = orderFingerprint({ ...FIXTURE_BOOK_FILL, name: "Clementine" });
    expect(other).not.toBe(fingerprint);
    expect(referenceFor(other, DAY)).not.toBe(referenceFor(fingerprint, DAY));
  });

  it("is different on a different day, so a repeat order is a new order", () => {
    // Without the day in the hash, the same parent ordering the same book for
    // a second child next month would compute the reference of an order that
    // has already shipped.
    expect(referenceFor(fingerprint, new Date("2026-12-07T04:00:00Z"))).not.toBe(
      referenceFor(fingerprint, DAY),
    );
  });

  it("is short, upper case, and has no character that can be misread aloud", () => {
    const ref = referenceFor(fingerprint, DAY);
    expect(ref).toMatch(REFERENCE_PATTERN);
    expect(ref.length).toBeLessThanOrEqual(12);
    // Crockford's alphabet: nothing that can be heard or read as another
    // character over a telephone.
    expect(ref.slice(3)).not.toMatch(/[ILOU]/);
  });

  it("recognises its own references and nothing else", () => {
    expect(isReference(referenceFor(fingerprint, DAY))).toBe(true);
    expect(isReference(`${referenceFor(fingerprint, DAY)}-2`)).toBe(true);
    for (const bad of ["", "BK-", "bk-ABCDEFG", "BK-ABCDEFGH", "../../etc/passwd", "BK-ILOUABC", 7, null]) {
      expect(isReference(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("reading a record back", () => {
  it("round-trips through JSON unchanged", () => {
    const original = record({ payment: "paid", paidAt: DAY.toISOString(), emailed: true });
    expect(readRecord(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("keeps the fill verbatim, because the fill is what gets printed", () => {
    const back = readRecord(JSON.parse(JSON.stringify(record())));
    expect(back?.fill).toEqual(FIXTURE_BOOK_FILL);
    // Including the template revision, which is the thing that makes a reprint
    // of an old order the same document.
    expect(back?.fill.bookRev).toBe(FIXTURE_BOOK_FILL.bookRev);
  });

  it("is null for anything that is not a record", () => {
    for (const bad of [null, undefined, 7, "x", {}, { schema: 2 }, { schema: 1 }]) {
      expect(readRecord(bad), JSON.stringify(bad)).toBeNull();
    }
    // The individually-fatal omissions, each on its own.
    const good = JSON.parse(JSON.stringify(record()));
    for (const field of ["ref", "fill", "asked", "editionId", "createdAt"]) {
      const broken = { ...good };
      delete broken[field];
      expect(readRecord(broken), `without ${field}`).toBeNull();
    }
  });

  it("would accept the good record, so the refusals above are not a blanket no", () => {
    expect(readRecord(JSON.parse(JSON.stringify(record())))).not.toBeNull();
  });

  it("reads a missing optional field as its sane absence rather than refusing", () => {
    const good = JSON.parse(JSON.stringify(record()));
    for (const field of ["charged", "sessionId", "address", "email", "dispatch", "paidAt", "emailed"]) {
      delete good[field];
    }
    const back = readRecord(good);
    expect(back).not.toBeNull();
    expect(back?.charged).toBeNull();
    expect(back?.address).toBeNull();
    expect(back?.emailed).toBe(false);
  });

  it("never invents a payment", () => {
    for (const value of [undefined, null, "", "PAID", "yes", true, "awaiting", "refunded"]) {
      const back = readRecord({ ...JSON.parse(JSON.stringify(record())), payment: value });
      expect(back?.payment, JSON.stringify(value)).toBe("awaiting");
    }
    expect(readRecord({ ...JSON.parse(JSON.stringify(record())), payment: "paid" })?.payment).toBe("paid");
  });

  it("refuses a price in a currency this shop does not take", () => {
    const back = readRecord({
      ...JSON.parse(JSON.stringify(record())),
      asked: { currency: "USD", amount: 59 },
    });
    expect(back).toBeNull();
  });
});

describe("the list summary", () => {
  const full = record({
    payment: "paid",
    charged: { currency: "aud", minorUnits: 5900 },
    address: { name: "A Buyer", line1: "1 Example St", line2: null, city: "Sydney", state: "NSW", postalCode: "2000", country: "AU" },
    email: "buyer@example.com",
    dispatch: { at: DAY.toISOString(), tracking: "AP123" },
  });

  it("carries what the list shows", () => {
    const summary = summaryOf(full);
    expect(summary.ref).toBe(full.ref);
    expect(summary.name).toBe(FIXTURE_BOOK_FILL.name);
    expect(summary.editionId).toBe("softcover");
    expect(summary.payment).toBe("paid");
    expect(summary.dispatched).toBe(true);
  });

  it("carries nothing a list does not need", () => {
    // A row of a list that contained the dedication, the address or the
    // photograph would leak the whole of every order to anything that could
    // read one line of it.
    const flat = JSON.stringify(summaryOf(full));
    expect(flat).not.toContain("Example St");
    expect(flat).not.toContain("buyer@example.com");
    expect(flat).not.toContain("arrived on a Tuesday");
  });
});

describe("the money, as it is shown", () => {
  it("shows what Stripe actually took, in the units Stripe took it in", () => {
    expect(chargedAs({ currency: "aud", minorUnits: 5900 })).toBe("AUD 59");
    expect(chargedAs({ currency: "aud", minorUnits: 6950 })).toBe("AUD 69.50");
    expect(chargedAs(null)).toBeNull();
  });
});

describe("the address, as a label is printed from it", () => {
  it("drops the lines that are empty rather than printing a blank one", () => {
    expect(
      addressLines({
        name: "A Buyer",
        line1: "1 Example St",
        line2: null,
        city: "Sydney",
        state: "NSW",
        postalCode: "2000",
        country: "AU",
      }),
    ).toEqual(["A Buyer", "1 Example St", "Sydney NSW 2000", "AU"]);
  });

  it("is empty when Stripe has not sent one", () => {
    expect(addressLines(null)).toEqual([]);
  });
});
