/**
 * **The file the captain downloads and sends to a printer.**
 *
 * One PDF of the whole book at print resolution, and a PNG of any single page
 * as the alternative. Both come out of `renderPrintPixels`/`renderPrintPng`,
 * which come out of `renderPrintSvg`, which comes out of `renderPageSvg` — the
 * same function that drew the preview the buyer approved. There is no second
 * drawing path anywhere in this module and `test/one-renderer.test.ts` is what
 * keeps it that way.
 *
 * **Node only.** It rasterises, which is native code and a filesystem read.
 *
 * ## What this costs, stated rather than discovered
 *
 * A page of this book rasterises to 3600 × 3600 in **two to four seconds** and
 * deflates to about a third of a megabyte, so the whole twenty-five page book is
 * **about half a minute of CPU and of the order of ten megabytes** — measured,
 * not estimated. That is a fact about 3600 px pages and not about this code.
 *
 * Two consequences are designed for rather than hoped about. `npm run book` is
 * the intended way to produce a whole book, because a shell has no request
 * timeout and `data/` is where the evidence belongs. And the HTTP route takes a
 * **page range**, so a hosted function is never asked for more than it can
 * finish — see `app/api/book/print/route.ts`, which says what it limits and
 * why rather than failing at thirty pages with a platform error nobody can act
 * on.
 *
 * ## The filename
 *
 * The brief asks for a name an order can be matched to **without guessing**, so
 * it carries every value that decides what is inside the file: the book, its
 * revision, the look, the cover, the name, the pixel size, and eight hex of the
 * fill's own content hash. Two orders from the same buyer with a different
 * dedication are different files with different names, which is the property a
 * date stamp does not have.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../template/rev";
import { blockingProblems, type Problem } from "../template/validate";
import { renderPrintPixels, renderPrintPng, type PrintResult, type SuppliedBytes } from "../render/raster";
import { buildPdf, type PdfPage } from "../render/pdf";
import { pageCount, pageFillFor, pageSequence, pageTemplateFor } from "./derive";
import { validateBook, validateBookFill } from "./validate";
import type { BookFill, BookTemplate } from "./types";

/** Everything that is wrong with this order, blocking problems only. */
export function printProblems(book: BookTemplate, fill: BookFill): Problem[] {
  return [...validateBook(book), ...blockingProblems(validateBookFill(book, fill))];
}

export class BookNotPrintable extends Error {
  constructor(readonly problems: Problem[]) {
    super(`${problems.length} problem(s): ${problems.map((p) => p.code).join(", ")}`);
    this.name = "BookNotPrintable";
  }
}

/**
 * Eight hex of this order's own content.
 *
 * The same canonicalisation a template's `rev` uses, for the same reason: keys
 * sorted at every depth, so moving a field in the object does not change the
 * fingerprint. It is over the **fill** and not over the pixels, which is what
 * makes it computable before the two minutes of rendering start — and makes two
 * identical orders produce the same filename rather than two.
 */
export function orderFingerprint(fill: BookFill): string {
  return createHash("sha256").update(canonicalJson(fill)).digest("hex").slice(0, 8);
}

/** Safe in a filename, a URL and a shell. Never an address, so it may be lossy. */
function slug(raw: string, max = 24): string {
  const out = raw
    .toLowerCase()
    .normalize("NFKD")
    // Combining marks are **removed**, not turned into separators: NFKD
    // decomposes "Siân" into "Sian" plus a combining tilde, and a rule that
    // replaced every non-alphanumeric with a hyphen would file that order
    // under "sia-n-o-brien". A name is the thing somebody searches the folder
    // for.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return out || "no-name";
}

/**
 * What the download is called.
 *
 * `page` names a single page's file; absent is the whole book. A page is
 * numbered the way the upload contract numbers it — `cover`, then `page-001` —
 * so a file on a desk and a file in the captain's folder are the same word.
 */
export function printFileName(
  book: BookTemplate,
  fill: BookFill,
  ext: "pdf" | "png",
  page?: number,
): string {
  const { width, height } = book.page.print.pixels;
  const which = page === undefined ? "" : `-${pageSequence(book)[page]?.id ?? `page-${page}`}`;
  return (
    `${book.id}-${book.rev}-${slug(fill.lookId, 16)}-${slug(fill.coverId, 16)}-` +
    `${slug(fill.name)}-${orderFingerprint(fill)}${which}-${width}x${height}.${ext}`
  );
}

export interface BookPdfResult {
  pdf: Uint8Array;
  /** The pages actually in the file, as indices into `pageSequence`. */
  pages: number[];
  filename: string;
}

/**
 * The whole book — or a slice of it — as one PDF.
 *
 * `from`/`to` are inclusive indices into `pageSequence`, so `0` is the cover.
 * Absent is the whole book. The slice exists because a hosted function has a
 * wall-clock limit and a whole-book render does not fit inside every one of them;
 * it is **never** a quality decision and the file always carries full-resolution
 * pages.
 *
 * `onPage` is called before each page so a script can print progress. A
 * two-minute command with no output is a command somebody kills.
 */
export async function renderBookPdf(
  book: BookTemplate,
  fill: BookFill,
  options: {
    supplied?: SuppliedBytes;
    from?: number;
    to?: number;
    /**
     * An explicit list of page indices, overriding `from`/`to`.
     *
     * For the committed evidence, which is the three pages a buyer's content
     * lands on and not a contiguous run. The HTTP route never uses it — a range
     * is what a URL can express honestly, and an arbitrary page list in a query
     * string is a way to ask a hosted function for twenty-five renders in a
     * random order.
     */
    pages?: number[];
    onPage?: (index: number, id: string, total: number) => void;
  } = {},
): Promise<BookPdfResult> {
  const problems = printProblems(book, fill);
  if (problems.length) throw new BookNotPrintable(problems);

  const last = pageCount(book) - 1;
  const from = Math.min(Math.max(options.from ?? 0, 0), last);
  const to = Math.min(Math.max(options.to ?? last, from), last);
  const sequence = pageSequence(book);
  const indices =
    options.pages?.filter((i) => Number.isInteger(i) && i >= 0 && i <= last) ??
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (indices.length === 0) throw new BookNotPrintable([
    { code: "print.noPages", where: book.id, detail: "the requested range selects no pages" },
  ]);

  const pages: PdfPage[] = [];
  for (const index of indices) {
    options.onPage?.(index, sequence[index].id, indices.length);
    const template = pageTemplateFor(book, index, { lookId: fill.lookId, coverId: fill.coverId });
    const page = await renderPrintPixels(template, pageFillFor(book, index, fill), options.supplied);
    pages.push({ width: page.width, height: page.height, rgba: page.rgba });
  }

  const filename = printFileName(book, fill, "pdf");
  return {
    pdf: buildPdf(pages, {
      mediaBox: { width: book.page.canvas.width, height: book.page.canvas.height },
      title: filename.replace(/\.pdf$/, ""),
      creator: "books.keepnook.app",
    }),
    pages: indices,
    filename,
  };
}

/**
 * One page, as the PNG the print path already produces.
 *
 * The **colour-exact** artefact: `lib/render/png.ts` stamps a real `sRGB`
 * chunk into it, which the PDF cannot carry without an ICC profile this
 * repository does not have. So this is the alternative the brief asks for and
 * also the one to send a printer who is fussy about colour.
 */
export async function renderBookPagePng(
  book: BookTemplate,
  index: number,
  fill: BookFill,
  supplied?: SuppliedBytes,
): Promise<PrintResult & { filename: string }> {
  const problems = printProblems(book, fill);
  if (problems.length) throw new BookNotPrintable(problems);

  const template = pageTemplateFor(book, index, { lookId: fill.lookId, coverId: fill.coverId });
  const result = await renderPrintPng(template, pageFillFor(book, index, fill), supplied);
  return { ...result, filename: printFileName(book, fill, "png", index) };
}
