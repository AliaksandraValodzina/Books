/**
 * Serving a content-addressed asset when there is no bucket.
 *
 * This is the local half of `lib/assets/resolve.ts`: with `R2_PUBLIC_BASE_URL`
 * unset, `assetUrl` points the browser here and this hands back the bytes from
 * `fixtures/assets/`. Set the variable and nothing reaches this route at all —
 * the browser goes to R2 directly, which is where a customer's photograph will
 * live.
 *
 * **The key is the content hash**, so the response is immutable by construction
 * and can be cached forever. That is the whole practical dividend of content
 * addressing, and it is the same thing the bucket will do.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../../lib/bytes";
import { ASSET_EXTENSIONS, sha256 } from "../../../../lib/assets/resolve";

export const runtime = "nodejs";

const MIME_BY_EXT = Object.fromEntries(
  Object.entries(ASSET_EXTENSIONS).map(([mime, ext]) => [ext, mime]),
) as Record<string, string>;

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;

  // `<64 hex>.<ext>` and nothing else. A key is a digest, so anything that is
  // not shaped like one is not a key — and refusing on the shape is what keeps
  // a path separator out of the join below.
  const match = /^([0-9a-f]{64})\.([a-z]+)$/.exec(key);
  if (!match || !MIME_BY_EXT[match[2]]) {
    return NextResponse.json({ error: "not an asset key" }, { status: 400 });
  }
  const [, digest, ext] = match;

  let bytes: Uint8Array;
  try {
    // Statically scoped to one subfolder on purpose: a join the bundler
    // cannot see the root of makes it trace the whole project into the output.
    bytes = new Uint8Array(await readFile(path.join(process.cwd(), "fixtures", "assets", `${digest}.${ext}`)));
  } catch {
    return NextResponse.json({ error: "no such asset" }, { status: 404 });
  }

  // Verified here too. The file is named by its digest, which means a wrong
  // file under the right name is exactly the mistake this catches, and it is
  // the mistake that would otherwise print.
  if (sha256(bytes) !== digest) {
    return NextResponse.json({ error: "asset does not match its digest" }, { status: 500 });
  }

  return new NextResponse(new Blob([toArrayBuffer(bytes)]), {
    headers: {
      "content-type": MIME_BY_EXT[ext],
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
