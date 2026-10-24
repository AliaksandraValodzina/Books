/**
 * Turning an `AssetRef` into bytes, and bytes into something a renderer can
 * reference.
 *
 * **Server only.** It reads the filesystem and the environment; the browser
 * gets `assetUrl` below, which is a string and nothing else.
 *
 * Two stores, looked at in this order:
 *
 * 1. **`fixtures/assets/`** — content-addressed on disk, `<sha256>.<ext>`. This
 *    is where the fixture's photographs live so the test suite and `npm run
 *    print` work with no network, no bucket and no credential. A store the
 *    tests can rely on is not a lesser store; it is the same store with a
 *    different root.
 * 2. **Cloudflare R2**, over the public base URL in `R2_PUBLIC_BASE_URL`. A
 *    customer's uploaded photograph will land here, under its own digest, which
 *    is why the key is the digest and not a filename.
 *
 * **The digest is verified against the bytes, always, in both stores.** An
 * `AssetRef` is an address *and* a claim, and a renderer that trusts the claim
 * will happily print the wrong photograph if an upload ever lands under the
 * wrong key. Checking costs one hash of a file we have already read.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetRef } from "../template/types";

const EXT: Record<AssetRef["mime"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const FIXTURE_ASSET_DIR = path.join(process.cwd(), "fixtures", "assets");

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The public URL for an asset, for the browser and for an `<img>`.
 *
 * With no `R2_PUBLIC_BASE_URL` configured this serves out of `/assets/…`, which
 * `app/api/assets/[hash]/route.ts` answers from the fixture store. That is the
 * correct state until the captain points this at a bucket, and it is the same
 * arrangement Keepnook uses — inert with no origin configured, rather than
 * broken.
 */
export function assetUrl(ref: AssetRef): string {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const key = `${ref.sha256}.${EXT[ref.mime]}`;
  return base ? `${base}/${key}` : `/api/assets/${key}`;
}

export class AssetDigestMismatch extends Error {
  constructor(expected: string, got: string, where: string) {
    super(`asset ${expected.slice(0, 12)}… from ${where} hashes to ${got.slice(0, 12)}…`);
    this.name = "AssetDigestMismatch";
  }
}

export class AssetMissing extends Error {
  constructor(ref: AssetRef) {
    super(
      `no bytes for ${ref.sha256.slice(0, 12)}… (${ref.label ?? "unlabelled"}): not in fixtures/assets and ` +
        (process.env.R2_PUBLIC_BASE_URL ? "not in the bucket" : "no R2_PUBLIC_BASE_URL is set"),
    );
    this.name = "AssetMissing";
  }
}

async function fromFixtures(ref: AssetRef): Promise<Uint8Array | null> {
  try {
    const file = path.join(FIXTURE_ASSET_DIR, `${ref.sha256}.${EXT[ref.mime]}`);
    return new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
}

async function fromBucket(ref: AssetRef): Promise<Uint8Array | null> {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  const res = await fetch(`${base}/${ref.sha256}.${EXT[ref.mime]}`);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadAsset(ref: AssetRef): Promise<Uint8Array> {
  const local = await fromFixtures(ref);
  if (local) {
    const got = sha256(local);
    if (got !== ref.sha256) throw new AssetDigestMismatch(ref.sha256, got, "fixtures");
    return local;
  }
  const remote = await fromBucket(ref);
  if (remote) {
    const got = sha256(remote);
    if (got !== ref.sha256) throw new AssetDigestMismatch(ref.sha256, got, "R2");
    return remote;
  }
  throw new AssetMissing(ref);
}

/**
 * A `data:` URI for the bytes.
 *
 * The print path needs this because the rasteriser has no network and must not
 * have one: a print file that depends on a bucket being reachable at the moment
 * somebody clicks Download is a print file that sometimes comes out with a hole
 * in it.
 */
export function dataUri(bytes: Uint8Array, mime: AssetRef["mime"]): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export { EXT as ASSET_EXTENSIONS };
