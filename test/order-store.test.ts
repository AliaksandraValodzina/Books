/**
 * **The store, and the two halves of it that can be checked without a bucket.**
 *
 * No test here touches a live R2 bucket, because there is no credential in a
 * public repository to touch one with. What is checked is everything that is
 * decided in this codebase:
 *
 * **The signing.** AWS Signature Version 4 is a published, frozen algorithm
 * with a worked example in AWS's own documentation, and the hard half of it —
 * reducing a request to the exact string that gets hashed — is checked against
 * that example's **published** canonical request and the **published**
 * SHA-256 of it. A 256-bit match on a hand-built string is not a coincidence.
 * The other half, the four-HMAC key derivation, is checked against a second
 * deliberately literal transcription of the specification written here, so a
 * typo in one is caught by the other. The final signature hex is not pinned to
 * a published value and the PR says so rather than implying a green suite
 * means a working bucket.
 *
 * **The lifecycle.** `claim`, `markPaid` and `markDispatched` are the rules of
 * this shop, and `memoryStore` is the whole of what they need to be tested
 * properly: a double-click writes one order, only a payment marks one paid,
 * and an unpaid order cannot be dispatched.
 */

import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  keysIn,
  photoKey,
  r2Store,
  signV4,
  signatureParts,
  signingKey,
  type FetchLike,
} from "../lib/orders/r2";
import {
  attachSession,
  claim,
  markDispatched,
  markEmailed,
  markPaid,
  memoryStore,
  photoFor,
  storeFromEnv,
  summaries,
} from "../lib/orders/store";
import { STORE_REQUIRED } from "../lib/orders/config";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { orderFingerprint } from "../lib/book/print";
import { referenceFor } from "../lib/orders/record";

// ---------------------------------------------------------------------------
// Signature Version 4
// ---------------------------------------------------------------------------

/** AWS's own worked example: `GET /test.txt` from `examplebucket`. */
const EXAMPLE = {
  secret: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  host: "examplebucket.s3.amazonaws.com",
  now: new Date("2013-05-24T00:00:00Z"),
};

/**
 * The canonical request AWS publishes for that example, exactly.
 *
 * Reproducing this string is the part of SigV4 that is either precisely right
 * or completely wrong: the header order, the trailing newline after the
 * headers, the empty query line, the lower-cased names, the hash of an empty
 * body.
 */
const PUBLISHED_CANONICAL_REQUEST = [
  "GET",
  "/test.txt",
  "",
  "host:examplebucket.s3.amazonaws.com",
  "range:bytes=0-9",
  "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "x-amz-date:20130524T000000Z",
  "",
  "host;range;x-amz-content-sha256;x-amz-date",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
].join("\n");

/** And the SHA-256 of it, as AWS publishes it beside the request. */
const PUBLISHED_CANONICAL_HASH = "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972";

describe("signing a request the way S3 expects", () => {
  const parts = signatureParts({
    method: "GET",
    path: "/test.txt",
    host: EXAMPLE.host,
    headers: { range: "bytes=0-9" },
    secretAccessKey: EXAMPLE.secret,
    region: "us-east-1",
    service: "s3",
    now: EXAMPLE.now,
  });

  it("builds the canonical request AWS publishes, character for character", () => {
    expect(parts.canonicalRequest).toBe(PUBLISHED_CANONICAL_REQUEST);
  });

  it("hashes it to the value AWS publishes", () => {
    // The independent check: a 256-bit published digest of the string above.
    expect(createHash("sha256").update(parts.canonicalRequest).digest("hex")).toBe(
      PUBLISHED_CANONICAL_HASH,
    );
  });

  it("would notice a changed canonical request, so the two checks above can fail", () => {
    const tampered = signatureParts({
      method: "GET",
      path: "/test.txt",
      host: EXAMPLE.host,
      // One header different, which is all it takes.
      headers: { range: "bytes=0-10" },
      secretAccessKey: EXAMPLE.secret,
      region: "us-east-1",
      service: "s3",
      now: EXAMPLE.now,
    });
    expect(tampered.canonicalRequest).not.toBe(PUBLISHED_CANONICAL_REQUEST);
    expect(createHash("sha256").update(tampered.canonicalRequest).digest("hex")).not.toBe(
      PUBLISHED_CANONICAL_HASH,
    );
  });

  it("builds the string to sign out of the scope and that hash, and nothing else", () => {
    expect(parts.stringToSign).toBe(
      ["AWS4-HMAC-SHA256", "20130524T000000Z", "20130524/us-east-1/s3/aws4_request", PUBLISHED_CANONICAL_HASH].join("\n"),
    );
  });

  it("derives the signing key by the four HMACs the specification names", () => {
    // Written out again here, deliberately literally, so that a typo in
    // `signingKey` — a missing "AWS4", a swapped step, the wrong terminator —
    // is caught by a second transcription rather than by a bucket in
    // production.
    const h = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
    const expected = h(h(h(h(`AWS4${EXAMPLE.secret}`, "20130524"), "us-east-1"), "s3"), "aws4_request");
    expect(
      signingKey({ secretAccessKey: EXAMPLE.secret, dateStamp: "20130524", region: "us-east-1", service: "s3" }),
    ).toEqual(expected);
    // And the signature is that key over that string, with nothing in between.
    expect(parts.signature).toBe(h(expected, parts.stringToSign).toString("hex"));
  });

  it("depends on the secret, which is the entire point of a signature", () => {
    const other = signatureParts({
      method: "GET",
      path: "/test.txt",
      host: EXAMPLE.host,
      headers: { range: "bytes=0-9" },
      secretAccessKey: `${EXAMPLE.secret}x`,
      region: "us-east-1",
      service: "s3",
      now: EXAMPLE.now,
    });
    expect(other.signature).not.toBe(parts.signature);
    // The string being signed is identical: only the key differs.
    expect(other.stringToSign).toBe(parts.stringToSign);
  });

  it("names the credential, the scope and the signed headers in the authorization header", () => {
    const signed = signV4({
      method: "GET",
      path: "/test.txt",
      host: EXAMPLE.host,
      headers: { range: "bytes=0-9" },
      secretAccessKey: EXAMPLE.secret,
      accessKeyId: EXAMPLE.accessKeyId,
      region: "us-east-1",
      service: "s3",
      now: EXAMPLE.now,
    });
    expect(signed.headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${EXAMPLE.accessKeyId}/20130524/us-east-1/s3/aws4_request, ` +
        `SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=${parts.signature}`,
    );
    // And never the secret itself, anywhere in the request it produces.
    expect(JSON.stringify(signed)).not.toContain(EXAMPLE.secret);
  });

  it("sorts and encodes a query string, because the canonical form is sorted", () => {
    const parts2 = signatureParts({
      method: "GET",
      path: "/bucket",
      query: { prefix: "orders/", "list-type": "2", "max-keys": "10" },
      host: EXAMPLE.host,
      secretAccessKey: EXAMPLE.secret,
      now: EXAMPLE.now,
    });
    expect(parts2.canonicalQuery).toBe("list-type=2&max-keys=10&prefix=orders%2F");
  });

  it("hashes the body, so a changed body is a broken signature", () => {
    const one = signatureParts({ method: "PUT", path: "/b/k", host: EXAMPLE.host, body: "a", secretAccessKey: EXAMPLE.secret, now: EXAMPLE.now });
    const two = signatureParts({ method: "PUT", path: "/b/k", host: EXAMPLE.host, body: "b", secretAccessKey: EXAMPLE.secret, now: EXAMPLE.now });
    expect(one.signature).not.toBe(two.signature);
    expect(one.headers["x-amz-content-sha256"]).toBe(createHash("sha256").update("a").digest("hex"));
  });
});

// ---------------------------------------------------------------------------
// What the bucket is actually asked for
// ---------------------------------------------------------------------------

/** A `fetch` that records what it was asked and answers whatever it is told to. */
function recorder(answers: Array<{ status: number; body?: string; bytes?: Uint8Array }>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: Uint8Array }> = [];
  let i = 0;
  const fetchLike: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const answer = answers[Math.min(i++, answers.length - 1)];
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      async text() {
        return answer.body ?? "";
      },
      async arrayBuffer() {
        const bytes = answer.bytes ?? new Uint8Array();
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      },
    };
  };
  return { calls, fetchLike };
}

const CREDS = {
  accountId: "acc1d",
  bucket: "books-orders",
  accessKeyId: "AKIAEXAMPLEEXAMPLE",
  secretAccessKey: "secret-not-a-real-one-at-all",
};

describe("the requests the R2 store makes", () => {
  it("writes an order as JSON under orders/, signed, at the account's own host", async () => {
    const { calls, fetchLike } = recorder([{ status: 200 }]);
    const store = r2Store(CREDS, fetchLike);
    const { record } = await claim(memoryStore(), FIXTURE_BOOK_FILL, "softcover", new Date("2026-11-07T04:00:00Z"));
    await store.put(record);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(
      `https://${CREDS.accountId}.r2.cloudflarestorage.com/${CREDS.bucket}/orders/${record.ref}.json`,
    );
    expect(calls[0].headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    // The secret never leaves the signer.
    expect(JSON.stringify(calls[0].headers)).not.toContain(CREDS.secretAccessKey);
  });

  it("puts a photograph under a private prefix and never asks for public read", async () => {
    const { calls, fetchLike } = recorder([{ status: 200 }]);
    const store = r2Store(CREDS, fetchLike);
    const asset = FIXTURE_BOOK_FILL.photo!.asset;
    await store.putPhoto(asset, new Uint8Array([1, 2, 3]));

    expect(calls[0].url).toContain(`/photos/${asset.sha256}.png`);
    // `lib/orders/store.ts` § Photographs are private: no ACL header of any
    // kind, so nothing here can make a customer's photograph world-readable.
    const flat = JSON.stringify(calls[0].headers).toLowerCase();
    expect(flat).not.toContain("acl");
    expect(flat).not.toContain("public-read");
  });

  it("answers null for a missing order rather than throwing", async () => {
    const { fetchLike } = recorder([{ status: 404 }]);
    expect(await r2Store(CREDS, fetchLike).get("BK-ABCDEFG")).toBeNull();
  });

  it("says which request failed, and never what it was signed with", async () => {
    const { fetchLike } = recorder([{ status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }]);
    await expect(r2Store(CREDS, fetchLike).get("BK-ABCDEFG")).rejects.toThrow(/AccessDenied/);
    await expect(r2Store(CREDS, fetchLike).get("BK-ABCDEFG")).rejects.not.toThrow(
      new RegExp(CREDS.secretAccessKey),
    );
  });

  it("reads the keys out of a ListObjectsV2 answer", () => {
    const xml =
      "<ListBucketResult><Contents><Key>orders/BK-ABCDEFG.json</Key></Contents>" +
      "<Contents><Key>orders/BK-HJKMNPQ.json</Key></Contents>" +
      "<Contents><Key>photos/deadbeef.png</Key></Contents></ListBucketResult>";
    expect(keysIn(xml)).toEqual(["orders/BK-ABCDEFG.json", "orders/BK-HJKMNPQ.json", "photos/deadbeef.png"]);
  });

  it("keys a photograph by the content hash the fill already names it by", () => {
    const asset = FIXTURE_BOOK_FILL.photo!.asset;
    expect(photoKey(asset)).toBe(`photos/${asset.sha256}.png`);
  });
});

describe("whether this environment has a store at all", () => {
  it("is unconfigured with nothing set, and names every row", () => {
    const state = storeFromEnv({});
    expect(state.kind).toBe("unconfigured");
    expect(state.kind === "unconfigured" && state.missing).toEqual([...STORE_REQUIRED]);
  });

  it("never falls back to something that does not survive a redeploy", () => {
    // The failure being prevented: a buyer's card is charged, the webhook
    // writes the order into a map, the instance is recycled, and the order is
    // gone. An in-memory fallback would be that, silently.
    const state = storeFromEnv({ R2_ACCOUNT_ID: "account-id-here" });
    expect(state.kind).toBe("unconfigured");
  });

  it("is ready when every row is filled", () => {
    const env: Record<string, string> = {};
    for (const name of STORE_REQUIRED) env[name] = `value-for-${name.toLowerCase()}`;
    const state = storeFromEnv(env);
    expect(state.kind).toBe("ready");
    expect(state.kind === "ready" && state.store.describe).toContain("r2://");
  });
});

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

const DAY = new Date("2026-11-07T04:00:00Z");
const LATER = new Date("2026-11-07T04:05:00Z");

describe("claiming an order", () => {
  it("writes one, with the listed price and nothing paid", async () => {
    const store = memoryStore();
    const { record, fresh } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    expect(fresh).toBe(true);
    expect(record.payment).toBe("awaiting");
    expect(record.charged).toBeNull();
    expect(record.asked).toEqual({ currency: "AUD", amount: 59 });
    expect(record.fingerprint).toBe(orderFingerprint(FIXTURE_BOOK_FILL));
    expect(record.ref).toBe(referenceFor(record.fingerprint, DAY));
    expect(store.size).toBe(1);
  });

  it("prices the upgrade as the upgrade", async () => {
    const { record } = await claim(memoryStore(), FIXTURE_BOOK_FILL, "hardcover", DAY);
    expect(record.asked).toEqual({ currency: "AUD", amount: 69 });
  });

  it("is one order however many times the button is pressed", async () => {
    const store = memoryStore();
    const first = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const second = await claim(store, FIXTURE_BOOK_FILL, "softcover", LATER);
    expect(second.fresh).toBe(false);
    expect(second.record.ref).toBe(first.record.ref);
    expect(second.record.createdAt).toBe(first.record.createdAt);
    expect(store.size).toBe(1);
  });

  it("is a different order for a different book", async () => {
    const store = memoryStore();
    await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const other = await claim(store, { ...FIXTURE_BOOK_FILL, name: "Clementine" }, "softcover", DAY);
    expect(other.fresh).toBe(true);
    expect(store.size).toBe(2);
  });

  it("never overwrites an order that has been paid for", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    await markPaid(store, record.ref, { sessionId: "cs_1", paymentIntentId: "pi_1", charged: { currency: "aud", minorUnits: 5900 }, address: null, email: "a@example.com" }, LATER);

    const again = await claim(store, FIXTURE_BOOK_FILL, "softcover", LATER);
    expect(again.fresh).toBe(false);
    expect(again.record.payment).toBe("paid");
    expect(again.record.charged).toEqual({ currency: "aud", minorUnits: 5900 });
    expect(store.size).toBe(1);
  });
});

describe("marking an order paid", () => {
  it("is the only thing that writes a payment, and it writes what Stripe said", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "hardcover", DAY);
    expect(record.payment).toBe("awaiting");

    const result = await markPaid(
      store,
      record.ref,
      {
        sessionId: "cs_test_1",
        paymentIntentId: "pi_test_1",
        // Deliberately NOT the listed price: what is recorded is what was
        // charged, not what the price list says it should have been.
        charged: { currency: "aud", minorUnits: 1234 },
        address: { name: "A Buyer", line1: "1 Example St", line2: null, city: "Sydney", state: "NSW", postalCode: "2000", country: "AU" },
        email: "buyer@example.com",
      },
      LATER,
    );
    expect(result?.already).toBe(false);
    expect(result?.record.payment).toBe("paid");
    expect(result?.record.charged).toEqual({ currency: "aud", minorUnits: 1234 });
    expect(result?.record.asked).toEqual({ currency: "AUD", amount: 69 });
    expect(result?.record.paidAt).toBe(LATER.toISOString());
    expect(result?.record.address?.city).toBe("Sydney");
  });

  it("is idempotent, because Stripe retries", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const facts = { sessionId: "cs_1", paymentIntentId: "pi_1", charged: { currency: "aud", minorUnits: 5900 }, address: null, email: "a@example.com" };
    await markPaid(store, record.ref, facts, LATER);
    const second = await markPaid(store, record.ref, { ...facts, charged: { currency: "aud", minorUnits: 1 } }, new Date("2026-11-09T00:00:00Z"));

    expect(second?.already).toBe(true);
    // In particular `paidAt` does not move: the 24-hour window is measured
    // from when the money arrived, not from the last retry.
    expect(second?.record.paidAt).toBe(LATER.toISOString());
    expect(second?.record.charged).toEqual({ currency: "aud", minorUnits: 5900 });
  });

  it("is null for an order this shop never wrote down", async () => {
    expect(
      await markPaid(memoryStore(), "BK-ABCDEFG", { sessionId: "cs_1", paymentIntentId: null, charged: null, address: null, email: null }, LATER),
    ).toBeNull();
  });

  it("records whether the confirmation actually went", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    expect((await store.get(record.ref))?.emailed).toBe(false);
    await markEmailed(store, record.ref);
    expect((await store.get(record.ref))?.emailed).toBe(true);
  });
});

describe("dispatching", () => {
  it("refuses an order nobody has paid for", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const result = await markDispatched(store, record.ref, "AP123", LATER);
    expect(result.ok).toBe(false);
    expect((await store.get(record.ref))?.dispatch).toBeNull();
  });

  it("records the note against a paid order", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    await markPaid(store, record.ref, { sessionId: "cs_1", paymentIntentId: null, charged: null, address: null, email: null }, LATER);
    const result = await markDispatched(store, record.ref, "  AP123456789AU  ", LATER);
    expect(result.ok).toBe(true);
    expect((await store.get(record.ref))?.dispatch).toEqual({ at: LATER.toISOString(), tracking: "AP123456789AU" });
  });

  it("refuses an order that does not exist", async () => {
    expect((await markDispatched(memoryStore(), "BK-ABCDEFG", "x", LATER)).ok).toBe(false);
  });
});

describe("the list the captain reads", () => {
  it("is newest first, by the order's own date and not by when it was touched", async () => {
    const store = memoryStore();
    const a = await claim(store, FIXTURE_BOOK_FILL, "softcover", new Date("2026-11-01T00:00:00Z"));
    const b = await claim(store, { ...FIXTURE_BOOK_FILL, name: "Clementine" }, "softcover", new Date("2026-11-05T00:00:00Z"));
    // The older one is modified last, which a bucket's own modified time would
    // put at the top.
    await attachSession(store, a.record, "cs_late", new Date("2026-11-09T00:00:00Z"));

    const rows = await summaries(store, 10);
    expect(rows.map((r) => r.ref)).toEqual([b.record.ref, a.record.ref]);
  });

  it("stops at the limit it is given", async () => {
    const store = memoryStore();
    for (const name of ["Ada", "Bea", "Cal"]) {
      await claim(store, { ...FIXTURE_BOOK_FILL, name }, "softcover", DAY);
    }
    expect(await summaries(store, 2)).toHaveLength(2);
  });
});

describe("the photograph, back out of the store", () => {
  it("comes back when it is there", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    const asset = FIXTURE_BOOK_FILL.photo!.asset;
    const { readFile } = await import("node:fs/promises");
    const bytes = new Uint8Array(await readFile(`fixtures/assets/${asset.sha256}.png`));
    await store.putPhoto(asset, bytes);

    const supplied = await photoFor(store, record);
    expect(supplied.get(asset.sha256)).toEqual(bytes);
  });

  it("is empty when the store has not got it, rather than pretending", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    expect((await photoFor(store, record)).size).toBe(0);
  });

  it("throws rather than printing the wrong object under the right name", async () => {
    const store = memoryStore();
    const { record } = await claim(store, FIXTURE_BOOK_FILL, "softcover", DAY);
    await store.putPhoto(FIXTURE_BOOK_FILL.photo!.asset, new Uint8Array([9, 9, 9]));
    await expect(photoFor(store, record)).rejects.toThrow(/does not match its digest/);
  });
});
