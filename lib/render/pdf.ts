/**
 * **A PDF of a whole book, written by hand.**
 *
 * The captain downloads one file and sends it to a printer. A PDF is the right
 * container for that — it is one object with a page count, a page size in real
 * units and a page order, which a folder of PNGs is not — and this module is
 * about two hundred lines of it rather than a dependency, for three reasons
 * that are all about this specific file:
 *
 * **There is almost nothing to write.** Every page of this book is one
 * full-bleed image at the declared page size. There is no text in the PDF, no
 * font embedding, no transparency group, no outline, no form field — the type
 * is rasterised into the page by `resvg`, which is the whole point of one
 * renderer. A PDF with N image pages is a catalogue, a page tree, and three
 * objects per page.
 *
 * **It keeps the print path dependency-free.** `@resvg/resvg-js` is already a
 * native addon that has to be listed in `serverExternalPackages`; a second
 * binary dependency in the one code path that produces the paid-for artefact is
 * a second thing that can fail to build on a platform nobody tested.
 *
 * **It is checkable.** `./png.ts` and `./cmap.ts` are already hand-written
 * readers of exactly the bytes this product cares about, and this follows them:
 * `readPdfPages` below parses back what `buildPdf` wrote, so the page count and
 * the page size in the committed file are **measured out of the bytes** rather
 * than trusted to the function that claimed them. `docs/print.md`'s *"a claim
 * about a file is not the file"* applies with no change.
 *
 * **What it deliberately does not do.** No ICC profile. A page is `/DeviceRGB`,
 * which every reader and every RIP treats as sRGB — the same convention
 * argument `./png.ts` makes about an untagged PNG, except that there a real
 * `sRGB` chunk costs thirteen bytes and here an `/ICCBased` stream would mean
 * shipping a profile this repository does not have and could not verify. So the
 * **per-page PNG is the colour-exact artefact** and carries the real chunk; the
 * PDF is the convenient one. `docs/print.md` says so in the table rather than
 * leaving somebody to find out.
 */

import { deflateSync } from "node:zlib";

/** One page's pixels, as the rasteriser handed them over. */
export interface PdfPage {
  width: number;
  height: number;
  /** RGBA, row-major, 8 bits per channel — `RenderedImage.pixels`. */
  rgba: Uint8Array;
}

export interface PdfOptions {
  /** The page box in PostScript points, which is the unit a template already uses. */
  mediaBox: { width: number; height: number };
  /** `/Title`. The order's own filename stem, so a file on a desk is identifiable. */
  title: string;
  /** `/Creator`. Never a version string that would change the bytes between builds. */
  creator: string;
}

export class NotOpaque extends Error {}
export class NotAPdf extends Error {}

const ASCII = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/**
 * RGB bytes from RGBA, refusing anything transparent.
 *
 * A PDF image is `/DeviceRGB` and has no alpha channel; dropping one silently
 * would mean compositing against whatever the reader felt like, which for a
 * printed page is white paper showing through the artwork. It cannot happen
 * here — `./raster.ts` renders every page over the template's own opaque
 * background — so an alpha below 255 means that stopped being true, and the
 * right response is to say so rather than to produce a file with a hole in it.
 */
function rgbOf(page: PdfPage): Uint8Array {
  const count = page.width * page.height;
  if (page.rgba.length < count * 4) {
    throw new NotOpaque(`${page.width}×${page.height} needs ${count * 4} bytes, got ${page.rgba.length}`);
  }
  const out = new Uint8Array(count * 3);
  for (let i = 0, o = 0; i < count; i++) {
    const at = i << 2;
    if (page.rgba[at + 3] !== 255) {
      throw new NotOpaque(
        `pixel ${i} has alpha ${page.rgba[at + 3]}; a print page must be fully opaque`,
      );
    }
    out[o++] = page.rgba[at];
    out[o++] = page.rgba[at + 1];
    out[o++] = page.rgba[at + 2];
  }
  return out;
}

/** A PDF string literal, with the three characters that would end it escaped. */
function pdfString(s: string): string {
  return `(${s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

/**
 * The whole book, as one PDF.
 *
 * Object layout, which the cross-reference table below depends on being exactly
 * this: 1 is the catalogue, 2 is the page tree, 3 is the document information,
 * and then **three objects per page** — the page, its content stream, and its
 * image — so page `p` occupies `4 + 3p`, `5 + 3p` and `6 + 3p`.
 *
 * A classic cross-reference *table* rather than a stream, because a table is
 * plain text a human can read in a hex dump and this is the file somebody will
 * be looking at when a print comes back wrong.
 */
export function buildPdf(pages: PdfPage[], opts: PdfOptions): Uint8Array {
  if (pages.length === 0) throw new NotAPdf("a PDF needs at least one page");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let at = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    at += bytes.length;
  };
  const write = (s: string) => push(ASCII(s));
  const begin = (n: number) => {
    offsets[n] = at;
    write(`${n} 0 obj\n`);
  };
  const end = () => write("endobj\n");

  // The header's binary comment tells anything sniffing the file that it is not
  // text, which is what stops a transfer helpfully translating line endings.
  write("%PDF-1.7\n");
  push(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const kid = (p: number) => `${4 + 3 * p} 0 R`;

  begin(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\n");
  end();

  begin(2);
  write(
    `<< /Type /Pages /Count ${pages.length} /Kids [ ${pages.map((_, p) => kid(p)).join(" ")} ] >>\n`,
  );
  end();

  begin(3);
  // No creation date and no producer version: both would change the bytes
  // between two runs of the same book, and `test/book-print.test.ts` pins the
  // output byte for byte exactly as `test/print-size.test.ts` pins the PNG.
  write(`<< /Title ${pdfString(opts.title)} /Creator ${pdfString(opts.creator)} >>\n`);
  end();

  const { width: mw, height: mh } = opts.mediaBox;

  for (const [p, page] of pages.entries()) {
    const pageObj = 4 + 3 * p;
    const contentObj = pageObj + 1;
    const imageObj = pageObj + 2;

    begin(pageObj);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${mw} ${mh} ] ` +
        `/Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\n`,
    );
    end();

    // The image is drawn to fill the whole MediaBox. The unit square is the
    // PDF image space, so the matrix *is* the page size — which is how a 3600
    // px image and an 864 pt page are the same page at 300 DPI without this
    // file ever mentioning a resolution.
    const content = `q ${mw} 0 0 ${mh} 0 0 cm /Im0 Do Q\n`;
    begin(contentObj);
    write(`<< /Length ${content.length} >>\nstream\n${content}endstream\n`);
    end();

    const deflated = new Uint8Array(deflateSync(rgbOf(page), { level: 9 }));
    begin(imageObj);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${deflated.length} >>\nstream\n`,
    );
    push(deflated);
    write("\nendstream\n");
    end();
  }

  const xrefAt = at;
  const count = 4 + 3 * pages.length;
  write(`xref\n0 ${count}\n`);
  write("0000000000 65535 f \n");
  for (let n = 1; n < count; n++) {
    write(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(at);
  let o = 0;
  for (const chunk of chunks) {
    out.set(chunk, o);
    o += chunk.length;
  }
  return out;
}

/**
 * The page count and page box, **read back out of the bytes**.
 *
 * The same discipline as `readPngSize`: a test asserting the page count against
 * the array that was passed in is a test of nothing. This parses the page tree
 * header and the first `/MediaBox`, which is enough to catch the failures that
 * matter — a page that was not written, a box that does not match the template,
 * a file truncated by a response that lied about its length.
 */
export function readPdfPages(bytes: Uint8Array): {
  count: number;
  mediaBox: { width: number; height: number };
} {
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (!head.startsWith("%PDF-")) throw new NotAPdf("no %PDF- header");

  // Latin-1 so a byte is a character: the structure is ASCII and the streams
  // are binary, and this must not try to decode the streams as anything.
  let text = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  const count = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/.exec(text);
  if (!count) throw new NotAPdf("no page tree with a /Count");
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  if (!box) throw new NotAPdf("no /MediaBox");
  if (!text.includes("%%EOF")) throw new NotAPdf("no %%EOF: the file is truncated");

  return {
    count: Number(count[1]),
    mediaBox: { width: Number(box[1]), height: Number(box[2]) },
  };
}
