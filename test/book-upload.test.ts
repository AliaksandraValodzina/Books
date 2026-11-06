/**
 * **The upload contract, enforced.**
 *
 * `docs/look-upload-contract.md` is what the captain is generating artwork
 * against today, and every failure it names is a **quiet** one: a page that is
 * 3599 px renders, a page with an alpha channel renders, a look with
 * twenty-three pages renders twenty-three pages. All four look perfectly fine
 * in a browser and are found on paper, by a customer, after the money is spent.
 *
 * So each rule in that document gets a test here that **breaks it and names the
 * code**. A checker tested only against a good upload passes just as happily
 * when it returns an empty array.
 *
 * The fixtures are built here rather than committed, because a good half of
 * them are files that are hard to produce on purpose — a PNG whose header says
 * it is interlaced, one that claims a profile it does not have — and because
 * twenty-four 3600 px pages times three looks is a gigabyte nobody should put
 * in a public repository to test a header reader.
 */

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { FIRST_BOOK } from "../templates/first-book";
import {
  blockingUploadProblems,
  checkUpload,
  readManifest,
  type Upload,
  type UploadedFile,
} from "../lib/book/upload";
import { readPngHeader, hasAlphaChannel } from "../lib/render/png";

// ---------------------------------------------------------------------------
// The smallest honest PNG, built to order
// ---------------------------------------------------------------------------

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, CRC(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A real PNG of a flat colour, with every IHDR field under the test's control.
 *
 * Real rather than a stub: the checker reads the header out of bytes, so a
 * fixture that was not a decodable PNG would prove that it can report
 * `page.notPng` and nothing else.
 */
function png(options: {
  width?: number;
  height?: number;
  bitDepth?: number;
  colourType?: number;
  interlaced?: boolean;
  iccp?: boolean;
  tint?: number;
} = {}): Uint8Array {
  const width = options.width ?? 3600;
  const height = options.height ?? 3600;
  const colourType = options.colourType ?? 2;
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 1;

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = colourType;
  ihdr[12] = options.interlaced ? 1 : 0;

  // One filter byte plus one row of pixels per scanline. The content does not
  // matter to a header reader; the length does, so a reader that walked the
  // chunks would still find IEND where it expects it.
  const stride = 1 + width * channels;
  const rows = new Uint8Array(stride * Math.min(height, 2));
  rows.fill(options.tint ?? 0xcc);
  for (let y = 0; y < Math.min(height, 2); y++) rows[y * stride] = 0;

  const parts = [SIGNATURE, chunk("IHDR", ihdr)];
  if (options.iccp) {
    // An embedded profile that is not sRGB: a name, a null, a method byte and
    // a deflated payload. Exactly the thing the contract refuses.
    const name = new TextEncoder().encode("Adobe RGB (1998)");
    const body = new Uint8Array(name.length + 2 + 8);
    body.set(name, 0);
    parts.push(chunk("iCCP", body));
  }
  parts.push(chunk("IDAT", new Uint8Array(deflateSync(rows))), chunk("IEND", new Uint8Array()));

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A complete, correct look: twenty-four pages and a cover. */
function goodLook(id: string, tint: number): { look: string; files: UploadedFile[] } {
  const files: UploadedFile[] = [{ name: "cover.png", bytes: png({ tint }) }];
  for (let n = 1; n <= FIRST_BOOK.pages.length; n++) {
    files.push({ name: `page-${String(n).padStart(3, "0")}.png`, bytes: png({ tint: tint + n }) });
  }
  return { look: id, files };
}

function manifest(looks: Array<{ id: string; label?: string; gender?: string }>) {
  return {
    looks: looks.map((l) => ({ id: l.id, label: l.label ?? l.id, gender: l.gender ?? "girl" })),
  };
}

const good: Upload = {
  manifest: manifest([
    { id: "mabel", gender: "girl" },
    { id: "wren", gender: "boy" },
  ]),
  looks: [goodLook("mabel", 0x10), goodLook("wren", 0x80)],
};

const codes = (upload: Upload) => checkUpload(FIRST_BOOK, upload).map((p) => p.code);

/** The upload with one file replaced or removed. */
function edit(
  upload: Upload,
  look: string,
  change: (files: UploadedFile[]) => UploadedFile[],
): Upload {
  return {
    ...upload,
    looks: upload.looks.map((l) => (l.look === look ? { ...l, files: change(l.files) } : l)),
  };
}

// ---------------------------------------------------------------------------

describe("the fixture upload the rest of this file breaks", () => {
  it("is clean", () => {
    expect(checkUpload(FIRST_BOOK, good)).toEqual([]);
  });

  it("really is the size and shape the book declares", () => {
    // The guard on the guard. If the fixture were not actually 3600 px the
    // "wrong size" test below would pass for the wrong reason.
    const header = readPngHeader(good.looks[0].files[0].bytes);
    expect(header).toEqual({
      width: FIRST_BOOK.page.print.pixels.width,
      height: FIRST_BOOK.page.print.pixels.height,
      bitDepth: 8,
      colourType: 2,
      interlaced: false,
    });
    expect(hasAlphaChannel(header.colourType)).toBe(false);
    expect(good.looks[0].files).toHaveLength(FIRST_BOOK.pages.length + 1);
  });
});

describe("the manifest, because gender is not a fact about pixels", () => {
  it("is required", () => {
    expect(codes({ ...good, manifest: null })).toContain("manifest.missing");
    expect(codes({ ...good, manifest: { nope: true } })).toContain("manifest.malformed");
  });

  it("must declare every folder, and every declaration must have a folder", () => {
    expect(codes({ ...good, manifest: manifest([{ id: "mabel" }]) })).toContain(
      "manifest.lookUndeclared",
    );
    expect(
      codes({ ...good, manifest: manifest([{ id: "mabel" }, { id: "wren" }, { id: "otis" }]) }),
    ).toContain("manifest.folderMissing");
  });

  it("must give every look a gender the book offers", () => {
    const { problems } = readManifest({ looks: [{ id: "mabel", label: "Mabel" }] });
    expect(problems.map((p) => p.code)).toContain("manifest.genderMissing");
    expect(
      codes({ ...good, manifest: manifest([{ id: "mabel", gender: "neither" }, { id: "wren" }]) }),
    ).toContain("manifest.genderUnknown");
  });

  it("refuses an id that could not be a folder name", () => {
    const { problems } = readManifest({ looks: [{ id: "Mabel Smith", label: "x", gender: "girl" }] });
    expect(problems.map((p) => p.code)).toContain("manifest.malformed");
  });
});

describe("the files in a look", () => {
  it("refuses a missing cover", () => {
    expect(codes(edit(good, "mabel", (f) => f.filter((x) => x.name !== "cover.png")))).toContain(
      "look.coverMissing",
    );
  });

  it("refuses a gap in the numbering, and says which page", () => {
    const gapped = edit(good, "mabel", (f) => f.filter((x) => x.name !== "page-012.png"));
    const problems = checkUpload(FIRST_BOOK, gapped);
    expect(problems.map((p) => p.code)).toContain("look.pageMissing");
    expect(problems.find((p) => p.code === "look.pageMissing")?.where).toContain("page-012.png");
  });

  it("refuses a page beyond the book's page count", () => {
    expect(
      codes(edit(good, "mabel", (f) => [...f, { name: "page-099.png", bytes: png() }])),
    ).toContain("look.pageUnexpected");
  });

  it("refuses a file that is neither a page nor the cover", () => {
    expect(
      codes(edit(good, "mabel", (f) => [...f, { name: "page-012 copy.png", bytes: png() }])),
    ).toContain("look.fileUnexpected");
  });

  it("refuses the reserved names rather than ignoring them", () => {
    // Ignoring is how somebody finds out months later that the back cover they
    // made was never used.
    expect(codes(edit(good, "mabel", (f) => [...f, { name: "spine.png", bytes: png() }]))).toContain(
      "look.reservedName",
    );
  });

  it("refuses a page count that disagrees with the book", () => {
    const short = edit(good, "mabel", (f) => f.filter((x) => x.name !== "page-024.png"));
    expect(codes(short)).toContain("look.pageCountMismatch");
  });

  it("refuses a look whose page count disagrees with its siblings", () => {
    const short = edit(good, "mabel", (f) => f.filter((x) => x.name !== "page-024.png"));
    expect(codes(short)).toContain("look.pageCountDisagrees");
  });

  it("refuses a folder name that is not a usable look id", () => {
    const odd: Upload = {
      manifest: good.manifest,
      looks: [{ ...good.looks[0], look: "Mabel Smith" }],
    };
    expect(codes(odd)).toContain("look.nameMalformed");
  });
});

describe("the bytes of a page", () => {
  const swap = (bytes: Uint8Array) =>
    edit(good, "mabel", (f) => f.map((x) => (x.name === "page-005.png" ? { ...x, bytes } : x)));

  it("refuses something that is not a PNG whatever it is called", () => {
    expect(codes(swap(new TextEncoder().encode("GIF89a this is not a png")))).toContain(
      "page.notPng",
    );
  });

  it("refuses a page that is not square", () => {
    expect(codes(swap(png({ height: 3599 })))).toContain("page.notSquare");
  });

  it("refuses a square page of the wrong size", () => {
    expect(codes(swap(png({ width: 3000, height: 3000 })))).toContain("page.wrongSize");
  });

  it("refuses an alpha channel, because paper would show through", () => {
    expect(codes(swap(png({ colourType: 6 })))).toContain("page.hasAlpha");
    expect(codes(swap(png({ colourType: 4 })))).toContain("page.hasAlpha");
  });

  it("refuses a bit depth other than eight", () => {
    expect(codes(swap(png({ bitDepth: 16 })))).toContain("page.notEightBit");
  });

  it("refuses an interlaced file", () => {
    expect(codes(swap(png({ interlaced: true })))).toContain("page.interlaced");
  });

  it("refuses an embedded profile that is not sRGB", () => {
    expect(codes(swap(png({ iccp: true })))).toContain("page.notSrgb");
  });

  it("reports two identical pages inside one look", () => {
    const twinned = edit(good, "mabel", (f) =>
      f.map((x) => (x.name === "page-006.png" ? { ...x, bytes: f[5].bytes } : x)),
    );
    expect(codes(twinned)).toContain("page.duplicateWithinLook");
  });

  it("notes a page identical across looks without refusing it", () => {
    // A page with no baby in it legitimately is the same file in every look,
    // and only a person can tell whether this one is.
    const shared = edit(good, "wren", (f) =>
      f.map((x) =>
        x.name === "page-007.png"
          ? { ...x, bytes: good.looks[0].files.find((y) => y.name === "page-007.png")!.bytes }
          : x,
      ),
    );
    const problems = checkUpload(FIRST_BOOK, shared);
    expect(problems.map((p) => p.code)).toContain("page.identicalAcrossLooks");
    expect(blockingUploadProblems(problems)).toEqual([]);
  });
});

describe("what the checker is measured against", () => {
  it("follows the book rather than a constant", () => {
    // Change the book's page count and the checker follows it. A hard-coded 24
    // here would be a second source of truth, and the day the captain's
    // artwork changed length it would be the wrong one.
    const shorter = { ...FIRST_BOOK, pages: FIRST_BOOK.pages.slice(0, 12) };
    expect(checkUpload(shorter, good).map((p) => p.code)).toContain("look.pageUnexpected");

    const bigger = {
      ...FIRST_BOOK,
      page: { ...FIRST_BOOK.page, print: { ...FIRST_BOOK.page.print, pixels: { width: 4000, height: 4000 } } },
    };
    expect(checkUpload(bigger, good).map((p) => p.code)).toContain("page.wrongSize");
  });

  it("reports everything wrong in one pass rather than stopping at the first", () => {
    // The captain is about to go and regenerate artwork; one list is one trip.
    const messy = edit(
      { ...good, manifest: null },
      "mabel",
      (f) => [
        ...f.filter((x) => x.name !== "cover.png" && x.name !== "page-003.png"),
        { name: "notes.txt", bytes: new TextEncoder().encode("hello") },
      ],
    );
    const found = new Set(codes(messy));
    expect(found.has("manifest.missing")).toBe(true);
    expect(found.has("look.coverMissing")).toBe(true);
    expect(found.has("look.pageMissing")).toBe(true);
    expect(found.has("look.fileUnexpected")).toBe(true);
  });
});
