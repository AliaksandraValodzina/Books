/**
 * **Where an order is kept, and the reasoning for the choice.**
 *
 * The requirement is one sentence — *the simplest thing that survives a
 * redeploy* — and it rules out the obvious answer immediately: a Vercel
 * function's filesystem is read-only outside `/tmp`, and `/tmp` is per
 * instance and gone on the next deploy. An order written there is an order
 * that exists until somebody pushes a commit.
 *
 * Four candidates were considered and the PR states them; the two that matter
 * here are:
 *
 * **Stripe's own session metadata.** Genuinely tempting: no new
 * infrastructure at all, Stripe keeps it forever, and sessions list
 * newest-first for free. It fails on one fact — a `BookFill` names the
 * buyer's photograph by content hash and **the bytes have to live somewhere**,
 * because without them the print file cannot be re-made. Stripe will not hold
 * a megabyte of JPEG. So a bucket is needed regardless, and a bucket that
 * holds the photograph can hold the order next to it.
 *
 * **A Marketplace Postgres.** The right answer for a shop with reporting,
 * refunds and a second table. Today it is a provisioned database, a
 * connection pool and a migration story for single-digit orders a day, and
 * `.env.example`'s standing arrangement is "inert rather than broken" — a
 * database is the opposite of inert.
 *
 * **So: the R2 bucket the project had already chosen.** `.env.example` named
 * `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
 * before this task existed, under a comment saying *"writing to the bucket —
 * needed by upload, which is a later task"* and *"storage arrives when orders
 * do."* Orders have arrived. One object per order, one object per
 * photograph, no schema to migrate, and nothing new to provision.
 *
 * ## The seam
 *
 * Everything above is one file, `./r2.ts`, behind the interface below —
 * because the interesting half of this module is the order *lifecycle*
 * (`claim`, `markPaid`, `markDispatched`) and that half must be testable
 * without a bucket. `memoryStore()` is the whole of what a test needs, and
 * swapping R2 for Vercel Blob or for Postgres later is one file and no
 * changes above this line.
 *
 * ## Photographs are private
 *
 * `lib/assets/resolve.ts` reads template artwork out of a **public** base URL,
 * which is right for artwork: it is the same twenty-four pictures for every
 * buyer. A customer's photograph of their own baby is not that. It goes under
 * a key only this server's credentials can read and comes back through a
 * signed request, digest-checked on the way, and is handed to the renderer as
 * `supplied` bytes — so it is never a public URL and never an `href` a browser
 * resolves. `app/privacy/page.tsx` says that in the words a parent reads.
 */

import { missingFrom, value } from "../env";
import { sha256 } from "../assets/resolve";
import { orderFingerprint } from "../book/print";
import { editionOf } from "../book/editions";
import type { BookFill } from "../book/types";
import type { AssetRef } from "../template/types";
import { readRecord, referenceFor, summaryOf, type OrderRecord, type OrderSummary } from "./record";
import { r2Store } from "./r2";
import { STORE_REQUIRED } from "./config";

/** Every variable the order store needs — `./config.ts` says why it lives there. */
export { STORE_REQUIRED } from "./config";

/**
 * The store, as everything above this line sees it.
 *
 * Deliberately tiny. Five operations is the whole of what a shop that takes an
 * order, confirms it, lists it and prints it actually does, and every
 * operation this interface does not have is a feature nobody has asked for
 * that a future implementation would have to provide.
 */
export interface OrderStore {
  /** How the admin page names where it is reading from. Never a credential. */
  readonly describe: string;
  get(ref: string): Promise<OrderRecord | null>;
  put(record: OrderRecord): Promise<void>;
  /** Newest first, by the record's own `createdAt` and never by a modified time. */
  list(limit: number): Promise<OrderRecord[]>;
  /** Keyed by content hash, exactly as the fill names it. */
  putPhoto(ref: AssetRef, bytes: Uint8Array): Promise<void>;
  getPhoto(ref: AssetRef): Promise<Uint8Array | null>;
}

export type StoreState =
  | { kind: "ready"; store: OrderStore }
  | { kind: "unconfigured"; missing: string[] };

/**
 * The store this environment describes, or the names of what is missing.
 *
 * **There is no fallback to something that does not survive a redeploy.** An
 * in-memory store that quietly accepted orders would be the exact fake success
 * `lib/checkout.ts` exists to prevent, one layer deeper and much harder to
 * notice: the buyer's card is charged, the webhook writes to a map, the
 * instance is recycled and the order is gone. So with nothing configured this
 * says so, the checkout refuses, and `memoryStore` is reachable only from a
 * test that asks for it by name.
 */
export function storeFromEnv(env: Record<string, string | undefined>): StoreState {
  const missing = missingFrom(env, STORE_REQUIRED);
  if (missing.length) return { kind: "unconfigured", missing };
  return {
    kind: "ready",
    store: r2Store({
      accountId: value(env, "R2_ACCOUNT_ID")!,
      bucket: value(env, "R2_BUCKET")!,
      accessKeyId: value(env, "R2_ACCESS_KEY_ID")!,
      secretAccessKey: value(env, "R2_SECRET_ACCESS_KEY")!,
    }),
  };
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

/**
 * **One order per order, derived rather than locked.**
 *
 * The brief's requirement is that a double-click cannot create two orders, and
 * it names `orderFingerprint` as the idempotency key. That key stops *Stripe*
 * charging twice. This stops *this side* writing twice, by the same means:
 * `referenceFor` turns the fingerprint and the day into the reference, so the
 * second press computes the first press's reference, finds the record already
 * there, and hands it back unchanged.
 *
 * Three outcomes, and the third is the one worth reading:
 *
 * - nothing there → write it and return `{ fresh: true }`
 * - the same order there → return it, `{ fresh: false }`, and the caller
 *   reuses its session rather than making a second one
 * - **the same reference, a different order** → forty bits of hash have
 *   collided, which happens once in a billion orders and must still not put
 *   one buyer's book under another buyer's reference. The suffixed references
 *   `-2` … `-9` exist for exactly this and `REFERENCE_PATTERN` admits them.
 *
 * An order that has already been **paid** is never overwritten, whatever the
 * fingerprint says. A paid record is the only document proving a customer is
 * owed a book.
 */
export async function claim(
  store: OrderStore,
  fill: BookFill,
  editionId: string,
  now: Date,
): Promise<{ record: OrderRecord; fresh: boolean }> {
  const fingerprint = orderFingerprint(fill);
  const base = referenceFor(fingerprint, now);
  const stamp = now.toISOString();

  for (const suffix of ["", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "-9"]) {
    const ref = `${base}${suffix}`;
    const existing = await store.get(ref);
    if (existing) {
      // The same order, whether it has been paid for or not: hand back what is
      // there. A second press reuses the first press's session, and a paid
      // record is never rewritten — it is the only document proving a customer
      // is owed a book.
      if (existing.fingerprint === fingerprint) return { record: existing, fresh: false };
      continue;
    }
    const record: OrderRecord = {
      schema: 1,
      ref,
      fingerprint,
      fill,
      editionId,
      asked: editionOf(editionId).price,
      charged: null,
      payment: "awaiting",
      sessionId: null,
      paymentIntentId: null,
      address: null,
      email: null,
      emailed: false,
      dispatch: null,
      createdAt: stamp,
      paidAt: null,
      updatedAt: stamp,
    };
    await store.put(record);
    return { record, fresh: true };
  }
  throw new Error(`nine references collided for ${base}; this cannot happen by accident`);
}

/** The session this order was sent to the till under, recorded before the buyer leaves. */
export async function attachSession(
  store: OrderStore,
  record: OrderRecord,
  sessionId: string,
  now: Date,
): Promise<OrderRecord> {
  const next: OrderRecord = { ...record, sessionId, updatedAt: now.toISOString() };
  await store.put(next);
  return next;
}

export interface PaymentFacts {
  sessionId: string;
  paymentIntentId: string | null;
  charged: OrderRecord["charged"];
  address: OrderRecord["address"];
  email: string | null;
}

/**
 * **The only function that writes `payment: "paid"`, and the only caller is
 * the verified webhook.**
 *
 * It is idempotent because Stripe retries: a second delivery of the same event
 * finds the order already paid and changes nothing, in particular not
 * `paidAt`, so the 24-hour window is measured from when the money actually
 * arrived rather than from the last retry.
 */
export async function markPaid(
  store: OrderStore,
  ref: string,
  facts: PaymentFacts,
  now: Date,
): Promise<{ record: OrderRecord; already: boolean } | null> {
  const existing = await store.get(ref);
  if (!existing) return null;
  if (existing.payment === "paid") return { record: existing, already: true };
  const record: OrderRecord = {
    ...existing,
    payment: "paid",
    sessionId: facts.sessionId,
    paymentIntentId: facts.paymentIntentId,
    charged: facts.charged,
    address: facts.address,
    email: facts.email,
    paidAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await store.put(record);
  return { record, already: false };
}

/** The confirmation email actually went. Recorded so the captain can tell. */
export async function markEmailed(store: OrderStore, ref: string): Promise<void> {
  const existing = await store.get(ref);
  if (!existing || existing.emailed) return;
  await store.put({ ...existing, emailed: true });
}

/**
 * Dispatched, with whatever the captain wrote down.
 *
 * **An unpaid order cannot be dispatched.** Not because the captain would do
 * it, but because the admin page is the one place where a mis-click is a book
 * posted for nothing, and the refusal costs a line.
 */
export async function markDispatched(
  store: OrderStore,
  ref: string,
  tracking: string,
  now: Date,
): Promise<{ ok: true; record: OrderRecord } | { ok: false; why: string }> {
  const existing = await store.get(ref);
  if (!existing) return { ok: false, why: "no such order" };
  if (existing.payment !== "paid") return { ok: false, why: "that order has not been paid for" };
  const record: OrderRecord = {
    ...existing,
    dispatch: { at: now.toISOString(), tracking: tracking.trim().slice(0, 120) },
    updatedAt: now.toISOString(),
  };
  await store.put(record);
  return { ok: true, record };
}

/** Newest first, as the summaries the list page shows. */
export async function summaries(store: OrderStore, limit: number): Promise<OrderSummary[]> {
  return (await store.list(limit)).map(summaryOf);
}

/**
 * The buyer's photograph, back out of the store and checked against its hash.
 *
 * The same check `loadAsset` makes for artwork and for the same reason: the
 * object is named by its digest, so a wrong object under the right name is
 * exactly the mistake this catches, and it is the mistake that would otherwise
 * print somebody else's baby.
 */
export async function photoFor(store: OrderStore, record: OrderRecord): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const ref = record.fill.photo?.asset;
  if (!ref) return out;
  const bytes = await store.getPhoto(ref);
  if (!bytes) return out;
  if (sha256(bytes) !== ref.sha256) {
    throw new Error(`the stored photograph for ${record.ref} does not match its digest`);
  }
  out.set(ref.sha256, bytes);
  return out;
}

// ---------------------------------------------------------------------------
// The store a test uses
// ---------------------------------------------------------------------------

/**
 * **A store in a `Map`, for tests and for nothing else.**
 *
 * It is exported by name and never returned by `storeFromEnv`, which is the
 * difference between a test double and a silent fallback that loses a paid
 * order on the next deploy.
 */
export function memoryStore(): OrderStore & { readonly size: number } {
  const records = new Map<string, string>();
  const photos = new Map<string, Uint8Array>();
  return {
    describe: "a Map in this process — nothing here survives anything",
    get size() {
      return records.size;
    },
    async get(ref: string) {
      const raw = records.get(ref);
      // Round-tripped through JSON exactly as the real store does, so a test
      // cannot pass by handing back the same object it put in.
      return raw ? readRecord(JSON.parse(raw)) : null;
    },
    async put(record: OrderRecord) {
      records.set(record.ref, JSON.stringify(record));
    },
    async list(limit: number) {
      return [...records.values()]
        .map((raw) => readRecord(JSON.parse(raw)))
        .filter((r): r is OrderRecord => r !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
    async putPhoto(ref: AssetRef, bytes: Uint8Array) {
      photos.set(ref.sha256, bytes);
    },
    async getPhoto(ref: AssetRef) {
      return photos.get(ref.sha256) ?? null;
    },
  };
}
