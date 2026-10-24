/**
 * The print file, over HTTP.
 *
 * The captain's sentence was "once saved, I want to download it in 3150x3150
 * px size", and this is that download. It is the same `renderPrintPng` the
 * committed evidence under `data/` came out of, so what a browser gets here and
 * what is in the repository are produced by one function and cannot be
 * different pictures.
 *
 * It refuses rather than renders when the fill does not validate. A page with
 * an over-long word on it is still a page, and a renderer will happily draw one
 * — which is why the refusal has to be here, in front of the file, and not left
 * to whoever looks at the download.
 */

import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../lib/bytes";
import { MY_FOREVER } from "../../../templates/my-forever";
import { FIXTURE_FILL } from "../../../fixtures/order";
import { renderPrintPng } from "../../../lib/render/raster";
import { blockingProblems, validateFill, validateTemplate } from "../../../lib/template/validate";

// Native code and the filesystem: this cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const problems = [
    ...validateTemplate(MY_FOREVER),
    ...blockingProblems(validateFill(MY_FOREVER, FIXTURE_FILL)),
  ];
  if (problems.length) {
    return NextResponse.json({ error: "not printable", problems }, { status: 422 });
  }

  const { png, pixels } = await renderPrintPng(MY_FOREVER, FIXTURE_FILL);
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
