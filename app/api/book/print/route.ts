/**
 * The book's print file, over HTTP.
 *
 * `app/api/print/route.ts` is the same route for the single page and its
 * docblock holds most of the argument. Two things are different here and both
 * are about a book being twenty-five pages rather than one.
 *
 * **It is a `POST` only.** The single-page route offers a `GET` that renders
 * the hard-coded fixture order, which is the captain's standing check that the
 * pipeline works. A book has `npm run book` for that, which is a better place
 * for a thirty-second render than a request, and a `GET` that rasterised
 * twenty-five pages would be a URL anybody could point a crawler at.
 *
 * **It takes a page range.** `?format=pdf` is the whole book; `?from=&to=`
 * narrows it; `?format=png&page=N` is one page. A book of twenty-five pages at
 * 3600 × 3600 measures about **half a minute of CPU and ten megabytes**, which
 * fits inside a function's wall clock today — but a longer book or a larger
 * page would not, and the range is here so the failure is a deliberate refusal
 * rather than a platform timeout the captain cannot act on.
 *
 * Both refuse rather than render when the order does not validate. A book with
 * an over-long dedication on page two is still a book, and a renderer would
 * happily draw twenty-four of its pages before throwing on the twenty-fifth —
 * which is why the refusal is in front of the file and not left to whoever
 * opens the download.
 */

import { NextResponse } from "next/server";
import { toArrayBuffer } from "../../../../lib/bytes";
import { FIRST_BOOK } from "../../../../templates/first-book";
import { pageCount } from "../../../../lib/book/derive";
import {
  BookNotPrintable,
  printProblems,
  renderBookPagePng,
  renderBookPdf,
} from "../../../../lib/book/print";
import { SuppliedAssetRejected, verifySupplied } from "../../../../lib/assets/supplied";
import type { SuppliedBytes } from "../../../../lib/render/raster";
import type { BookFill } from "../../../../lib/book/types";

// Native code and the filesystem: this cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The most a request body may be.
 *
 * One photograph resized to 2400 px at JPEG quality 0.82 is well under this as
 * base64, and it is comfortably below the 4.5 MB a Vercel function will accept
 * at all — so a request the platform was going to reject is rejected here
 * instead, with a sentence saying why.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * The longest render this route will start.
 *
 * Measured rather than guessed: a page of this book is about a second at
 * 3600 × 3600 on the machine it was built on, and a hosted function is slower.
 * Thirty pages is the point past which a default 300-second budget stops being
 * comfortable. A book longer than this is `npm run book`'s job, and saying so
 * is better than a timeout.
 */
const MAX_PAGES_PER_REQUEST = 30;

function badRequest(error: string, detail?: string, status = 400) {
  return NextResponse.json(detail ? { error, detail } : { error }, { status });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return badRequest("too large", `${declared} bytes, over the ${MAX_BODY_BYTES} byte limit`, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("not JSON");
  }
  if (!body || typeof body !== "object") return badRequest("not an object");

  const { fill, photos } = body as { fill?: unknown; photos?: unknown };
  if (!fill || typeof fill !== "object") return badRequest("no fill");
  const asFill = fill as BookFill;

  // Validated **before** the bytes are decoded and hashed, so a nonsense order
  // does not get a megabyte of work done on its behalf first.
  const problems = printProblems(FIRST_BOOK, asFill);
  if (problems.length) {
    return NextResponse.json({ error: "not printable", problems }, { status: 422 });
  }

  let supplied: SuppliedBytes;
  try {
    supplied = verifySupplied(
      asFill.photo?.asset ? [asFill.photo.asset] : [],
      (photos ?? {}) as Record<string, unknown>,
    );
  } catch (error) {
    if (error instanceof SuppliedAssetRejected) {
      return NextResponse.json(
        { error: "photograph refused", problems: [{ code: error.code, detail: error.message }] },
        { status: 422 },
      );
    }
    throw error;
  }

  const url = new URL(request.url);
  const last = pageCount(FIRST_BOOK) - 1;

  try {
    if (url.searchParams.get("format") === "png") {
      const page = Number(url.searchParams.get("page") ?? "0");
      if (!Number.isInteger(page) || page < 0 || page > last) {
        return badRequest("no such page", `the book has pages 0 to ${last}`, 404);
      }
      const result = await renderBookPagePng(FIRST_BOOK, page, asFill, supplied);
      return file(result.png, "image/png", result.filename);
    }

    const from = clamp(url.searchParams.get("from"), 0, last);
    const to = clamp(url.searchParams.get("to"), last, last);
    if (to - from + 1 > MAX_PAGES_PER_REQUEST) {
      return badRequest(
        "too many pages",
        `${to - from + 1} pages at ${FIRST_BOOK.page.print.pixels.width} px is more than one ` +
          `request can finish. Ask for ${MAX_PAGES_PER_REQUEST} at a time with ?from= and ?to=, ` +
          "or run `npm run book -- --all` where there is no request timeout.",
        413,
      );
    }

    const result = await renderBookPdf(FIRST_BOOK, asFill, { supplied, from, to });
    return file(result.pdf, "application/pdf", result.filename);
  } catch (error) {
    if (error instanceof BookNotPrintable) {
      return NextResponse.json({ error: "not printable", problems: error.problems }, { status: 422 });
    }
    throw error;
  }
}

/**
 * A page index out of the query string, or the fallback.
 *
 * **The absent case is checked before the number is parsed**, because
 * `Number(null)` is `0` and `Number("")` is `0` — so a missing `?to=` would
 * otherwise clamp the whole book to its cover and return a one-page PDF with a
 * 200 and a plausible filename. That is the shape of mistake this product
 * cannot afford: no error anywhere, and a book with twenty-four pages missing.
 */
function clamp(raw: string | null, fallback: number, last: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, 0), last);
}

function file(bytes: Uint8Array, type: string, filename: string) {
  return new NextResponse(new Blob([toArrayBuffer(bytes)]), {
    headers: {
      "content-type": type,
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="${filename}"`,
      // The filename carries the book's revision and the order's own
      // fingerprint, so a cache keyed on the URL alone would be the one place
      // an edited order could still serve the old book.
      "cache-control": "no-store",
    },
  });
}

/** A hand-typed URL is not a blank page. The whole book is a POST. */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      detail:
        "The print file is a POST carrying the order. Rendering a whole book is half a minute " +
        "of CPU, so there is no GET that does it.",
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
