/**
 * The print file is 3150 × 3150, and that is read out of the bytes.
 *
 * The captain confirmed the number against Printify, so it is the one fact in
 * this product that is load-bearing all the way to a physical object. A config
 * value claiming it would go on claiming it long after the renderer stopped
 * producing it, which is why every assertion here opens the PNG.
 *
 * `docs/print.md` carries what was and was not established about bleed, and why
 * the artboard is not enlarged.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPrintPng } from "../lib/render/raster";
import { NotAPng, pngChunkTypes, readPngSize, withSrgbChunk } from "../lib/render/png";

const COMMITTED = path.join(
  process.cwd(),
  "data",
  "bk-spine-template-and-print",
  "my-forever-print-3150.png",
);

describe("the committed print file", () => {
  it("is exactly 3150 × 3150, measured from its own header", async () => {
    const bytes = new Uint8Array(await readFile(COMMITTED));
    expect(readPngSize(bytes)).toEqual({ width: 3150, height: 3150 });
  });

  it("is stamped sRGB, immediately after the header", async () => {
    const bytes = new Uint8Array(await readFile(COMMITTED));
    const types = pngChunkTypes(bytes);
    expect(types[0]).toBe("IHDR");
    expect(types[1]).toBe("sRGB");
    expect(types).toContain("gAMA");
    // Both must precede the first pixel data, or a decoder is entitled to
    // ignore them. The specification says so; this is that sentence as a test.
    expect(types.indexOf("sRGB")).toBeLessThan(types.indexOf("IDAT"));
  });

  it("is what the renderer produces today, byte for byte", async () => {
    // Seeded jitter and nothing else random: a render that drifted would mean
    // the committed evidence had stopped being evidence of anything.
    const committed = new Uint8Array(await readFile(COMMITTED));
    const { png } = await renderPrintPng(MY_FOREVER, FIXTURE_FILL);
    expect(Buffer.from(png).equals(Buffer.from(committed))).toBe(true);
  });
});

describe("a fresh render", () => {
  it("comes out at the size the template asks for, read back from the bytes", async () => {
    const { png, pixels } = await renderPrintPng(MY_FOREVER, FIXTURE_FILL);
    expect(pixels).toEqual({ width: 3150, height: 3150 });
    expect(readPngSize(png)).toEqual(pixels);
  });

  it("is stamped sRGB too, not only the file that happens to be committed", async () => {
    // Asserting the colour space on the committed bytes alone would go on
    // passing after the renderer stopped stamping it — the file would simply be
    // stale. Found by deleting the stamp and watching only the byte-identity
    // test go red.
    const { png } = await renderPrintPng(MY_FOREVER, FIXTURE_FILL);
    const types = pngChunkTypes(png);
    expect(types[1]).toBe("sRGB");
    expect(types.indexOf("sRGB")).toBeLessThan(types.indexOf("IDAT"));
  });

  it("follows the template rather than the constant, when the template changes", async () => {
    // The proof that nothing above is reading 3150 from a hard-coded place: ask
    // for a different size and the bytes say the different size. Half scale,
    // because the assertion is about the plumbing and not about the picture.
    const half = {
      ...MY_FOREVER,
      print: { ...MY_FOREVER.print, pixels: { width: 1575, height: 1575 } },
    };
    const { png } = await renderPrintPng(half, FIXTURE_FILL);
    expect(readPngSize(png)).toEqual({ width: 1575, height: 1575 });
  });
});

describe("the measurement itself can fail", () => {
  it("rejects bytes that are not a PNG", () => {
    expect(() => readPngSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(NotAPng);
  });

  it("rejects a PNG whose first chunk is not the header", async () => {
    const bytes = new Uint8Array(await readFile(COMMITTED));
    const tampered = bytes.slice();
    tampered[12] = "X".charCodeAt(0); // IHDR -> XHDR
    expect(() => readPngSize(tampered)).toThrow(NotAPng);
  });

  it("notices when the size is wrong, rather than reporting what was asked for", async () => {
    const bytes = new Uint8Array(await readFile(COMMITTED));
    const tampered = bytes.slice();
    new DataView(tampered.buffer).setUint32(16, 3149); // one pixel narrow
    expect(readPngSize(tampered)).toEqual({ width: 3149, height: 3150 });
    expect(readPngSize(tampered)).not.toEqual({ width: 3150, height: 3150 });
  });

  it("does not stamp sRGB twice", async () => {
    const bytes = new Uint8Array(await readFile(COMMITTED));
    const again = withSrgbChunk(bytes);
    expect(again).toBe(bytes);
    expect(pngChunkTypes(again).filter((t) => t === "sRGB")).toHaveLength(1);
  });
});
