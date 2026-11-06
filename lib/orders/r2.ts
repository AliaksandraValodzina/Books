/**
 * **The bucket, over HTTP, signed by hand.**
 *
 * R2 speaks S3, and S3 request signing is **AWS Signature Version 4** — a
 * published, frozen algorithm with official test vectors, which is the reason
 * this file exists instead of a dependency. The alternative is an AWS SDK: a
 * few megabytes of client, credential-provider chains, retry middleware and a
 * region resolver, to make five requests whose shapes are all written out
 * below. This repository already hand-writes a PDF writer, a PNG writer and a
 * JPEG size reader for the same trade, and the trade is better here than in
 * any of those: `test/order-store.test.ts` signs AWS's own documented example
 * request and compares the signature to the one AWS publishes for it, so the
 * hard part is checked against the specification rather than against itself.
 *
 * **What is not checked here is the bucket.** No test in this repository
 * touches a live R2 bucket, because there is no credential in a public
 * repository to touch one with. So what is proven is the signing, the request
 * shaping and the lifecycle above it; what is not proven is that Cloudflare
 * accepts it. The PR says so plainly rather than implying a green suite means
 * a working bucket.
 *
 * ## Two prefixes, one bucket
 *
 * `orders/<ref>.json` is the record. `photos/<sha256>.<ext>` is the buyer's
 * photograph. Both are **private**: nothing here writes a public-read ACL and
 * nothing reads them through `R2_PUBLIC_BASE_URL`, which is the public base
 * the *artwork* is served from. A customer's photograph of their own child is
 * not artwork, and the difference is a design decision rather than an
 * oversight — `lib/orders/store.ts` § Photographs are private.
 */

import { createHash, createHmac } from "node:crypto";
import { ASSET_EXTENSIONS } from "../assets/resolve";
import { ORDER_PREFIX, PHOTO_PREFIX } from "./config";
import { readRecord, type OrderRecord } from "./record";
import type { OrderStore } from "./store";
import type { AssetRef } from "../template/types";

export interface R2Credentials {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** R2 has one region and it is the literal string `auto`. */
const REGION = "auto";
const SERVICE = "s3";

const hex = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("hex");
const sha = (data: string | Uint8Array) => hex(createHash("sha256").update(data).digest());
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * Per RFC 3986, which is **not** what `encodeURIComponent` does.
 *
 * It leaves `!`, `'`, `(`, `)` and `*` alone, and SigV4's canonical request is
 * a string comparison against what the service encoded — so a key with a
 * bracket in it would sign correctly here and be rejected there. No key this
 * code writes contains one; signing them properly costs five characters and
 * removes the question.
 */
function uriEncode(raw: string): string {
  return encodeURIComponent(raw).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A path, encoded segment by segment: the separators are structure, not data. */
function canonicalPath(path: string): string {
  return path.split("/").map(uriEncode).join("/");
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * **The signing key, derived from the secret by four chained HMACs.**
 *
 * Exported because AWS publishes a worked example of exactly this derivation,
 * and `test/order-store.test.ts` checks against it. It is the half of SigV4
 * most likely to be subtly wrong — the literal `"AWS4"` prefix, the order of
 * the four steps, the final `"aws4_request"` — and all of it is unobservable
 * from the outside unless the whole signature is wrong.
 */
export function signingKey(options: {
  secretAccessKey: string;
  dateStamp: string;
  region: string;
  service: string;
}): Buffer {
  const kDate = hmac(`AWS4${options.secretAccessKey}`, options.dateStamp);
  const kRegion = hmac(kDate, options.region);
  const kService = hmac(kRegion, options.service);
  return hmac(kService, "aws4_request");
}

export interface SignatureParts {
  /** AWS's own term. The request reduced to the exact string that gets hashed. */
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
  signedHeaders: string;
  scope: string;
  headers: Record<string, string>;
  canonicalQuery: string;
  path: string;
}

/**
 * **The whole of SigV4, with its intermediate strings exposed.**
 *
 * The intermediates are returned because AWS publishes them for a worked
 * example, and checking against a published canonical request and a published
 * string-to-sign is the difference between testing this code and testing it
 * against itself. The final signature is then an HMAC of one checked value
 * under another, which has nowhere left to hide a mistake.
 *
 * The steps are AWS's own, in AWS's own order, and the names below are the
 * names in their specification so the two can be read side by side.
 */
export function signatureParts(options: {
  method: string;
  /** The path after the host, starting with a slash. Not yet encoded. */
  path: string;
  /** Query parameters, sorted and encoded here. */
  query?: Record<string, string>;
  host: string;
  headers?: Record<string, string>;
  /** The body, or the empty string. Hashed, never logged. */
  body?: Uint8Array | string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  /** Passed in rather than read, so the signature is a pure function of its inputs. */
  now: Date;
}): SignatureParts {
  const region = options.region ?? REGION;
  const service = options.service ?? SERVICE;
  const amzDate = options.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha(options.body ?? "");

  const headers: Record<string, string> = {
    host: options.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${headers[n].trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");

  const query = options.query ?? {};
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const path = canonicalPath(options.path);
  const canonicalRequest = [
    options.method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonicalRequest)].join("\n");
  const signature = hex(
    hmac(signingKey({ secretAccessKey: options.secretAccessKey, dateStamp, region, service }), stringToSign),
  );

  return { canonicalRequest, stringToSign, signature, signedHeaders, scope, headers, canonicalQuery, path };
}

/** One signed request, ready for `fetch`. */
export function signV4(options: Parameters<typeof signatureParts>[0] & { accessKeyId: string }): SignedRequest {
  const parts = signatureParts(options);
  return {
    url: `https://${options.host}${parts.path}${parts.canonicalQuery ? `?${parts.canonicalQuery}` : ""}`,
    method: options.method,
    headers: {
      ...parts.headers,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${parts.scope}, ` +
        `SignedHeaders=${parts.signedHeaders}, Signature=${parts.signature}`,
    },
  };
}

/** Just enough of `fetch` for this file, so a test can hand it a fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: Uint8Array },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;


/**
 * Every `<Key>` in a ListObjectsV2 response.
 *
 * A regular expression over XML is normally a poor idea and is the right trade
 * here, for `test/config.test.ts`'s reason stated about YAML: the alternative
 * is an XML parser whose only consumer is this line, and the shape being read
 * is one element of one well-known response. **Order is not taken from this
 * list** — the records are fetched and sorted by their own `createdAt`,
 * because a bucket's modified time changes when an order is marked dispatched
 * and the captain's list must not reshuffle itself when they do.
 */
export function keysIn(xml: string): string[] {
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  );
}

export function r2Store(credentials: R2Credentials, fetchLike?: FetchLike): OrderStore {
  const host = `${credentials.accountId}.r2.cloudflarestorage.com`;
  const doFetch: FetchLike =
    fetchLike ??
    ((url, init) =>
      fetch(url, {
        method: init.method,
        headers: init.headers,
        // `fetch` will not take a `Uint8Array` view as a body in every
        // runtime's type definitions; the underlying buffer always works.
        body: init.body ? (init.body as unknown as BodyInit) : undefined,
      }));

  async function send(
    method: string,
    key: string,
    body?: Uint8Array | string,
    extra?: { headers?: Record<string, string>; query?: Record<string, string> },
  ) {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const signed = signV4({
      method,
      path: `/${credentials.bucket}${key ? `/${key}` : ""}`,
      query: extra?.query,
      host,
      headers: extra?.headers,
      body: bytes,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      now: new Date(),
    });
    return doFetch(signed.url, { method, headers: signed.headers, body: bytes });
  }

  /**
   * A refusal from the bucket, as an error that says which request failed and
   * **never what it was signed with**. The repository is public and so are its
   * logs; a message carrying a credential is a credential published.
   */
  async function refuse(what: string, response: { status: number; text(): Promise<string> }) {
    const body = await response.text().catch(() => "");
    throw new Error(`R2 refused to ${what}: HTTP ${response.status} ${body.slice(0, 200)}`);
  }

  async function getOne(ref: string): Promise<OrderRecord | null> {
    const response = await send("GET", `${ORDER_PREFIX}${ref}.json`);
    if (response.status === 404) return null;
    if (!response.ok) await refuse(`read order ${ref}`, response);
    try {
      return readRecord(JSON.parse(await response.text()));
    } catch {
      return null;
    }
  }

  return {
    describe: `r2://${credentials.bucket}`,

    get: getOne,

    async put(record: OrderRecord) {
      const response = await send("PUT", `${ORDER_PREFIX}${record.ref}.json`, JSON.stringify(record), {
        headers: { "content-type": "application/json" },
      });
      if (!response.ok) await refuse(`write order ${record.ref}`, response);
    },

    async list(limit: number) {
      const response = await send("GET", "", undefined, {
        query: { "list-type": "2", prefix: ORDER_PREFIX, "max-keys": String(Math.max(limit, 1) * 2) },
      });
      if (!response.ok) await refuse("list orders", response);
      const keys = keysIn(await response.text())
        .filter((k) => k.startsWith(ORDER_PREFIX) && k.endsWith(".json"));
      const refs = keys.map((k) => k.slice(ORDER_PREFIX.length, -".json".length));
      const records: OrderRecord[] = [];
      for (const ref of refs) {
        const one = await getOne(ref);
        if (one) records.push(one);
      }
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },

    async putPhoto(ref: AssetRef, bytes: Uint8Array) {
      const response = await send("PUT", photoKey(ref), bytes, {
        headers: { "content-type": ref.mime },
      });
      if (!response.ok) await refuse("write a photograph", response);
    },

    async getPhoto(ref: AssetRef) {
      const response = await send("GET", photoKey(ref));
      if (response.status === 404) return null;
      if (!response.ok) await refuse("read a photograph", response);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** `photos/<sha256>.<ext>` — the fill's own name for it, under a private prefix. */
export function photoKey(ref: AssetRef): string {
  return `${PHOTO_PREFIX}${ref.sha256}.${ASSET_EXTENSIONS[ref.mime]}`;
}
