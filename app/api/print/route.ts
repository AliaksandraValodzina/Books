/**
 * The print file, over HTTP.
 *
 * The captain's sentence was "once saved, I want to download it in 3150x3150
 * px size", and this is that download. It is the same `renderPrintPng` the
 * committed evidence under `data/` came out of, so what a browser gets here and
 * what is in the repository are produced by one function and cannot be
 * different pictures.
 *
 * Two ways in, and the difference between them is only *where the photographs
 * come from*:
 *
 * **`GET`** renders the hard-coded fixture order out of `fixtures/assets/`. It
 * is the captain's standing check that the pipeline works and the thing the
 * tests and `npm run print` exercise.
 *
 * **`POST`** renders a fill the editor composed, with the customer's resized
 * photographs **in the request body**. There is no bucket and no credential
 * yet, so the bytes travel with the fill rather than being uploaded first; see
 * `lib/editor/photo.ts` for what the browser does to them and
 * `lib/assets/supplied.ts` for everything this server checks before it draws
 * one. Storage arrives when orders do, and when it does this route changes in
 * one place: it stops being handed bytes.
 *
 * Both refuse rather than render when the fill does not validate. A page with
 * an over-long word on it is still a page, and a renderer will happily draw one
 * — which is why the refusal has to be here, in front of the file, and not left
 * to whoever looks at the download.
 */

import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../lib/bytes";
import { MY_FOREVER } from "../../../templates/my-forever";
import { FIXTURE_FILL } from "../../../fixtures/order";
import { renderPrintPng, type SuppliedBytes } from "../../../lib/render/raster";
import { SuppliedAssetRejected, verifySupplied } from "../../../lib/assets/supplied";
import { blockingProblems, validateFill, validateTemplate } from "../../../lib/template/validate";
import type { PageFill } from "../../../lib/template/types";

// Native code and the filesystem: this cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The most a request body may be.
 *
 * Two photographs resized to 2400 px at JPEG quality 0.82 are well under this
 * as base64. It is also comfortably below the 4.5 MB a Vercel function will
 * accept at all, so a page that was going to be rejected by the platform is
 * rejected here instead — with a sentence saying why, rather than as an opaque
 * platform error the customer cannot act on.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function render(fill: PageFill, supplied?: SuppliedBytes) {
  const problems = [
    ...validateTemplate(MY_FOREVER),
    ...blockingProblems(validateFill(MY_FOREVER, fill)),
  ];
  if (problems.length) {
    return NextResponse.json({ error: "not printable", problems }, { status: 422 });
  }

  const { png, pixels } = await renderPrintPng(MY_FOREVER, fill, supplied);
  return new NextResponse(new Blob([toArrayBuffer(png)]), {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.length),
      "content-disposition": `attachment; filename="${MY_FOREVER.id}-${MY_FOREVER.rev}-${pixels.width}x${pixels.height}.png"`,
      // The revision is in the filename, so a cache that keyed on the URL alone
      // would be the one place an edited template could still serve the old page.
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  return render(FIXTURE_FILL);
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "too large", detail: `${declared} bytes, over the ${MAX_BODY_BYTES} byte limit` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "not an object" }, { status: 400 });
  }

  const { fill, photos } = body as { fill?: unknown; photos?: unknown };
  if (!fill || typeof fill !== "object") {
    return NextResponse.json({ error: "no fill" }, { status: 400 });
  }

  // Validated **before** the bytes are decoded and hashed, so a request with a
  // nonsense fill does not get a megabyte of work done on its behalf first.
  const asFill = fill as PageFill;
  const problems = blockingProblems(validateFill(MY_FOREVER, asFill));
  if (problems.length) {
    return NextResponse.json({ error: "not printable", problems }, { status: 422 });
  }

  let supplied: SuppliedBytes;
  try {
    supplied = verifySupplied(
      Object.values(asFill.photos ?? {}).map((p) => p.asset),
      (photos ?? {}) as Record<string, unknown>,
    );
  } catch (error) {
    if (error instanceof SuppliedAssetRejected) {
      // The code is the stable, greppable part — the same convention
      // `lib/template/validate.ts` uses for a `Problem`.
      return NextResponse.json(
        { error: "photograph refused", problems: [{ code: error.code, detail: error.message }] },
        { status: 422 },
      );
    }
    throw error;
  }

  return render(asFill, supplied);
}
