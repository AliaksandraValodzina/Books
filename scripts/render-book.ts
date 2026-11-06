/**
 * Write the book's evidence, and produce a whole book on demand.
 *
 *     npm run book                       # the committed evidence
 *     npm run book -- --all --out ./out   # the whole 25-page PDF, somewhere else
 *
 * `scripts/render-print.ts` is the same script for the single page and says why
 * a committed artefact beats a dimension in a README. The one difference is
 * **what is committed**, and it is a deliberate limit rather than an oversight:
 *
 * The whole twenty-five page book at 3600 × 3600 is about ten megabytes and half
 * a minute of CPU. Committing one to a public repository, and re-rendering
 * it on every pull request to prove it had not drifted, would cost more than it
 * proves. So the evidence is the **pages that carry content** — the cover, the
 * opening spread's right-hand page with the photograph, the dedication and the
 * signature on it, and one story page — plus a PDF built from exactly those,
 * plus the fully expanded book as JSON. Everything the renderer could get wrong
 * about this book is visible in those files; the other pages are the same
 * `drawn` scene with a different seed.
 *
 * Which pages those are is **asked of the template**, not written down here, so
 * moving a slot moves the evidence with it.
 *
 * `--all` is the captain's path: it writes the real thing wherever they ask,
 * and prints the measured size and time so the cost is a number rather than a
 * surprise.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIRST_BOOK } from "../templates/first-book";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { bookRev } from "../lib/book/rev";
import { pageCount, pageSequence, pageWithSlot } from "../lib/book/derive";
import { SLOT } from "../lib/book/slots";
import { printProblems, renderBookPagePng, renderBookPdf } from "../lib/book/print";

const OUT = path.join(process.cwd(), "data", "bk-first-book-buyer-flow");

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function main() {
  const stamped = bookRev(FIRST_BOOK);
  if (stamped !== FIRST_BOOK.rev) {
    throw new Error(
      `book ${FIRST_BOOK.id} is stamped ${FIRST_BOOK.rev} but hashes to ${stamped}. ` +
        `Set rev to "${stamped}" in templates/first-book.ts.`,
    );
  }

  const problems = printProblems(FIRST_BOOK, FIXTURE_BOOK_FILL);
  if (problems.length) {
    for (const p of problems) console.error(`${p.code}  ${p.where}  ${p.detail}`);
    throw new Error(`${problems.length} problem(s); nothing written`);
  }

  const everything = process.argv.includes("--all");
  const out = arg("out") ?? OUT;
  await mkdir(out, { recursive: true });
  const { width, height } = FIRST_BOOK.page.print.pixels;

  if (everything) {
    const started = Date.now();
    const book = await renderBookPdf(FIRST_BOOK, FIXTURE_BOOK_FILL, {
      onPage: (index, id, total) =>
        console.log(`  ${String(index + 1).padStart(2)}/${total}  ${id}`),
    });
    await writeFile(path.join(out, book.filename), book.pdf);
    console.log(
      `wrote ${book.pages.length} pages at ${width}×${height} ` +
        `(${(book.pdf.length / 1024 / 1024).toFixed(1)} MB) in ${Math.round((Date.now() - started) / 1000)} s ` +
        `to ${path.join(out, book.filename)}`,
    );
    return;
  }

  /**
   * The pages a buyer's content lands on, found by asking the template rather
   * than by knowing the numbers.
   *
   * **Deduplicated and sorted**, which is not tidiness: the photograph, the
   * dedication and the from-line all sit on the opening spread's right-hand
   * page, so asking for each slot's page returns the same index more than once
   * — and without this the committed PDF carried that page twice and the
   * evidence looked like a book with a repeated page in it.
   */
  const sequence = pageSequence(FIRST_BOOK);
  const interesting = [
    ...new Set(
      [
        0,
        pageWithSlot(FIRST_BOOK, SLOT.dedication),
        pageWithSlot(FIRST_BOOK, SLOT.from),
        pageWithSlot(FIRST_BOOK, SLOT.story),
        pageWithSlot(FIRST_BOOK, SLOT.photo),
      ].filter((i) => i >= 0),
    ),
  ].sort((a, b) => a - b);

  await writeFile(
    path.join(out, "the-book-of-you.book.json"),
    JSON.stringify(FIRST_BOOK, null, 2) + "\n",
  );
  await writeFile(
    path.join(out, "the-book-of-you.fill.json"),
    JSON.stringify(FIXTURE_BOOK_FILL, null, 2) + "\n",
  );

  for (const index of interesting) {
    const started = Date.now();
    const page = await renderBookPagePng(FIRST_BOOK, index, FIXTURE_BOOK_FILL);
    await writeFile(path.join(out, `${sequence[index].id}-${width}.png`), page.png);
    console.log(
      `  ${sequence[index].id}  ${page.pixels.width}×${page.pixels.height}  ` +
        `${(page.png.length / 1024 / 1024).toFixed(2)} MB  ${Date.now() - started} ms`,
    );
  }

  // One PDF of exactly those pages, so the container is evidence too: the page
  // count and the MediaBox in the committed file are read back out of the bytes
  // by `test/book-print.test.ts` rather than trusted to this script.
  const started = Date.now();
  const slice = await renderBookPdf(FIRST_BOOK, FIXTURE_BOOK_FILL, {
    pages: interesting,
    onPage: (index, id) => console.log(`  pdf ${index}  ${id}`),
  });
  await writeFile(path.join(out, "the-book-of-you-sample.pdf"), slice.pdf);
  const perPage = (Date.now() - started) / slice.pages.length / 1000;

  console.log(
    `wrote ${slice.pages.length}-page PDF (${(slice.pdf.length / 1024 / 1024).toFixed(1)} MB) to ${out}`,
  );
  console.log(
    `a whole ${pageCount(FIRST_BOOK)}-page book at ${width}×${height} is about ` +
      `${Math.round(perPage * pageCount(FIRST_BOOK))} s and ` +
      `${Math.round((slice.pdf.length / slice.pages.length / 1024 / 1024) * pageCount(FIRST_BOOK))} MB — ` +
      `run \`npm run book -- --all --out <dir>\` for the real thing.`,
  );
}

void main();
