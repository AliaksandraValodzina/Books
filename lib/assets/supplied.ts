/**
 * **Photographs that arrive with the request, checked rather than believed.**
 *
 * There is no bucket yet, so the editor keeps a customer's resized photographs
 * in the tab and posts them with the render. That makes `/api/print` a renderer
 * fed by an untrusted caller, and this module is the whole of the checking.
 *
 * `lib/assets/resolve.ts` states the rule it is built on: an `AssetRef` is an
 * address **and a claim**, and `loadAsset` verifies the digest against the bytes
 * every time, in both stores, because "a renderer that trusts the claim will
 * happily print the wrong photograph". A third store that skipped the check
 * would be the hole in that argument.
 *
 * Three claims arrive, and all three are measured:
 *
 * **The digest.** Cheap, and the one that makes the content-addressed design
 * mean anything. Without it the `sha256` in the fill is decoration.
 *
 * **The mime type.** Because it decides which reader measures the bytes below,
 * and because `dataUri` hands it to `resvg` as the type of the thing it is
 * decoding.
 *
 * **`px` — and this is the one that would otherwise be silent.** `placePhoto`
 * divides by the photograph's declared natural size to work out where a crop
 * lands. A wrong `px` therefore does not fail; it puts the photograph somewhere
 * else in a printed book at the wrong scale, with every other check green. A
 * mismatch is a refusal, not a correction: if the claim and the file disagree,
 * the fill was composed against a different photograph and nobody here knows
 * which one the customer meant.
 */

import type { AssetRef } from "../template/types";
import { readPngSize } from "../render/png";
import { readJpegSize } from "../render/jpeg";
import { sha256 } from "./resolve";

/**
 * The most one photograph may weigh.
 *
 * `lib/editor/photo.ts` resizes to 2400 px on the long edge at JPEG quality
 * 0.82, which is a few hundred kilobytes; this is several times that, so it
 * refuses only what was never produced by the editor. It is a bound on work
 * done before anything is trusted — the point in the request where a caller
 * can still choose the number.
 */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/** Codes are stable and greppable, and what a test asserts on — never the sentence. */
export class SuppliedAssetRejected extends Error {
  constructor(
    readonly code: string,
    readonly digest: string,
    detail: string,
  ) {
    super(`${code} for ${digest.slice(0, 12)}…: ${detail}`);
    this.name = "SuppliedAssetRejected";
  }
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/\r\n]+=*)$/;

/**
 * The bytes of a `data:` URI, with its declared type.
 *
 * Only the three types the format admits, and only base64 — a percent-encoded
 * `data:` URI is legal and is not something the editor produces, so accepting
 * one would be supporting a shape with no caller and no test.
 */
function decode(digest: string, value: unknown): { bytes: Uint8Array; mime: AssetRef["mime"] } {
  if (typeof value !== "string") {
    throw new SuppliedAssetRejected("supplied.notAString", digest, "the value is not a string");
  }
  if (value.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64) {
    throw new SuppliedAssetRejected(
      "supplied.tooLarge",
      digest,
      `${value.length} characters, over the ${MAX_PHOTO_BYTES} byte limit`,
    );
  }
  const match = DATA_URL.exec(value);
  if (!match) {
    throw new SuppliedAssetRejected(
      "supplied.notADataUrl",
      digest,
      "not a base64 data: URI of an image/png, image/jpeg or image/webp",
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(match[2], "base64"));
  } catch {
    throw new SuppliedAssetRejected("supplied.notBase64", digest, "the payload did not decode");
  }
  if (bytes.length === 0) {
    throw new SuppliedAssetRejected("supplied.empty", digest, "the payload decoded to no bytes");
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new SuppliedAssetRejected(
      "supplied.tooLarge",
      digest,
      `${bytes.length} bytes, over the ${MAX_PHOTO_BYTES} byte limit`,
    );
  }
  return { bytes, mime: match[1] as AssetRef["mime"] };
}

/**
 * The pixel size of the bytes, measured.
 *
 * WebP is refused rather than waved through. The format admits it and `resvg`
 * draws it, but there is no reader here for its header — so accepting one would
 * mean accepting an unverified `px`, which is the single claim whose failure is
 * invisible all the way into a printed book. The editor produces JPEG, so
 * nothing real is refused; the day a caller needs WebP, the fix is a reader and
 * not an exemption.
 */
function measure(digest: string, bytes: Uint8Array, mime: AssetRef["mime"]): { width: number; height: number } {
  try {
    if (mime === "image/png") return readPngSize(bytes);
    if (mime === "image/jpeg") return readJpegSize(bytes);
  } catch (cause) {
    throw new SuppliedAssetRejected(
      "supplied.unreadable",
      digest,
      `the bytes do not parse as ${mime}: ${(cause as Error).message}`,
    );
  }
  throw new SuppliedAssetRejected(
    "supplied.unmeasurable",
    digest,
    `${mime} carries no size this server can measure, so its declared px cannot be checked`,
  );
}

/**
 * Every ref in `refs`, resolved to verified bytes.
 *
 * Driven by the refs rather than by what was posted, which is the direction
 * that matters: anything extra in `posted` is ignored instead of being decoded
 * and hashed, so a caller cannot make the server do work by sending
 * photographs the page does not use.
 */
export function verifySupplied(
  refs: AssetRef[],
  posted: Record<string, unknown> | undefined,
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const ref of refs) {
    if (!ref || typeof ref.sha256 !== "string") continue;
    if (out.has(ref.sha256)) continue;

    const supplied = posted?.[ref.sha256];
    if (supplied === undefined) {
      throw new SuppliedAssetRejected(
        "supplied.missing",
        ref.sha256,
        "the fill names this photograph and the request did not carry it",
      );
    }

    const { bytes, mime } = decode(ref.sha256, supplied);

    if (mime !== ref.mime) {
      throw new SuppliedAssetRejected(
        "supplied.mimeMismatch",
        ref.sha256,
        `the fill says ${ref.mime} and the payload says ${mime}`,
      );
    }

    const got = sha256(bytes);
    if (got !== ref.sha256) {
      throw new SuppliedAssetRejected(
        "supplied.digestMismatch",
        ref.sha256,
        `the bytes hash to ${got.slice(0, 12)}…`,
      );
    }

    const size = measure(ref.sha256, bytes, mime);
    const [w, h] = ref.px ?? [0, 0];
    if (size.width !== w || size.height !== h) {
      throw new SuppliedAssetRejected(
        "supplied.sizeMismatch",
        ref.sha256,
        `the fill says ${w}×${h} and the file is ${size.width}×${size.height}; ` +
          "the crop would land somewhere else",
      );
    }

    out.set(ref.sha256, bytes);
  }
  return out;
}
