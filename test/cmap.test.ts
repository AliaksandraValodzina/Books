/**
 * **The `cmap` reader, pinned against fonts built byte by byte here.**
 *
 * `test/coverage.test.ts` cross-checks the reader against the two real TTFs,
 * and that catches a great deal — but only the code paths those two files
 * happen to use. Indie Flower and Special Elite never take format 4's
 * `idRangeOffset` indirection, so breaking it changed nothing anybody noticed:
 * the declaration regenerated from the broken reader and agreed with itself.
 *
 * That is the shape of bug this file exists for. The reader decides which
 * characters a customer is allowed to type, and the branch that was silent is
 * the one a *different* font will take the day somebody vendors one. So the
 * fonts below are synthetic, minimal, and chosen so that every branch of the
 * reader changes an answer — including the two ways a `cmap` can point a
 * codepoint at `.notdef`, which is the whole distinction the reader exists to
 * make.
 */

import { describe, expect, it } from "vitest";
import { NotATrueType, codepointsOf, runsOf } from "../lib/render/cmap";

function u16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}

function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

/**
 * An sfnt carrying one `cmap` table and nothing else.
 *
 * The reader walks the table directory for the tag and then reads only the
 * `cmap`, so a font with no `glyf`, no `head` and no `name` is enough — and
 * being enough is the point: a fixture that needed a real font would be a real
 * font, with whatever coverage it happened to have.
 */
function fontWith(subtables: Array<{ platform: number; encoding: number; bytes: number[] }>): Uint8Array {
  const dirSize = 4 + subtables.length * 8;
  let at = dirSize;
  const offsets = subtables.map((s) => {
    const here = at;
    at += s.bytes.length;
    return here;
  });
  const cmap = [
    ...u16(0),
    ...u16(subtables.length),
    ...subtables.flatMap((s, i) => [...u16(s.platform), ...u16(s.encoding), ...u32(offsets[i])]),
    ...subtables.flatMap((s) => s.bytes),
  ];
  const header = [
    ...u32(0x00010000),
    ...u16(1), // one table
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...[..."cmap"].map((c) => c.charCodeAt(0)),
    ...u32(0),
    ...u32(12 + 16), // the cmap begins right after the one-entry directory
    ...u32(cmap.length),
  ];
  return Uint8Array.from([...header, ...cmap]);
}

/**
 * A format 4 subtable with four segments, each proving something different:
 *
 * - `A`–`C` by `idDelta` with `idRangeOffset` zero — the common path.
 * - `P`–`R` through the **glyph array**, holding `[5, 0, 7]`, so `Q` maps to
 *   `.notdef` and must not be reported as covered while `P` and `R` are.
 * - `` ` `` by an `idDelta` that lands on glyph 0 — the other way to `.notdef`.
 * - `U+FFFF`, the terminator every format 4 table is required to end with,
 *   which also resolves to glyph 0 and must contribute nothing.
 */
function format4(): number[] {
  const segs = [
    { start: 0x41, end: 0x43, delta: 10, range: 0 },
    { start: 0x50, end: 0x52, delta: 0, range: 6 },
    { start: 0x60, end: 0x60, delta: -0x60 & 0xffff, range: 0 },
    { start: 0xffff, end: 0xffff, delta: 1, range: 0 },
  ];
  const glyphArray = [...u16(5), ...u16(0), ...u16(7)];
  const body = [
    ...u16(4),
    ...u16(14 + segs.length * 8 + glyphArray.length),
    ...u16(0),
    ...u16(segs.length * 2),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...segs.flatMap((s) => u16(s.end)),
    ...u16(0), // reservedPad
    ...segs.flatMap((s) => u16(s.start)),
    ...segs.flatMap((s) => u16(s.delta)),
    ...segs.flatMap((s) => u16(s.range)),
    ...glyphArray,
  ];
  return body;
}

const UNICODE = { platform: 3, encoding: 1 };

describe("the cmap reader", () => {
  it("reads format 4 through idDelta and through the glyph array", () => {
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes: format4() }]));
    expect([...cps].sort((a, b) => a - b)).toEqual([0x41, 0x42, 0x43, 0x50, 0x52]);
  });

  it("does not report a codepoint the glyph array sends to .notdef", () => {
    // `Q` is in the segment and in the table, and maps to glyph 0. Reporting it
    // would let a customer type a character that prints as an empty box.
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes: format4() }]));
    expect(cps.has(0x51)).toBe(false);
    expect(cps.has(0x50)).toBe(true);
    expect(cps.has(0x52)).toBe(true);
  });

  it("does not report a codepoint idDelta sends to .notdef", () => {
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes: format4() }]));
    expect(cps.has(0x60)).toBe(false);
  });

  it("does not report the format 4 terminator as a character", () => {
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes: format4() }]));
    expect(cps.has(0xffff)).toBe(false);
  });

  it("reads format 12, including above the BMP", () => {
    const groups = [
      { start: 0x1f600, end: 0x1f601, glyph: 4 },
      { start: 0x2764, end: 0x2764, glyph: 9 },
    ];
    const bytes = [
      ...u16(12),
      ...u16(0),
      ...u32(16 + groups.length * 12),
      ...u32(0),
      ...u32(groups.length),
      ...groups.flatMap((g) => [...u32(g.start), ...u32(g.end), ...u32(g.glyph)]),
    ];
    const cps = codepointsOf(fontWith([{ platform: 3, encoding: 10, bytes }]));
    expect([...cps].sort((a, b) => a - b)).toEqual([0x2764, 0x1f600, 0x1f601]);
  });

  it("reads format 6 and skips its zero glyphs", () => {
    const glyphs = [3, 0, 8];
    const bytes = [...u16(6), ...u16(10 + glyphs.length * 2), ...u16(0), ...u16(0x61), ...u16(glyphs.length), ...glyphs.flatMap(u16)];
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes }]));
    expect([...cps].sort((a, b) => a - b)).toEqual([0x61, 0x63]);
  });

  it("reads format 0 and skips its zero glyphs", () => {
    const table = new Array(256).fill(0);
    table[0x41] = 7;
    table[0x42] = 0;
    const bytes = [...u16(0), ...u16(262), ...u16(0), ...table];
    const cps = codepointsOf(fontWith([{ platform: 0, encoding: 3, bytes }]));
    expect([...cps]).toEqual([0x41]);
  });

  it("unions every Unicode subtable rather than picking one", () => {
    const six = [...u16(6), ...u16(14), ...u16(0), ...u16(0x61), ...u16(2), ...u16(3), ...u16(4)];
    const cps = codepointsOf(
      fontWith([
        { ...UNICODE, bytes: format4() },
        { platform: 0, encoding: 4, bytes: six },
      ]),
    );
    expect(cps.has(0x41)).toBe(true);
    expect(cps.has(0x61)).toBe(true);
    expect(cps.has(0x62)).toBe(true);
  });

  it("ignores a subtable that maps bytes rather than codepoints", () => {
    // Platform 1 is Macintosh-Roman: its indices are bytes in a legacy
    // encoding, and folding them in would claim coverage of whatever those
    // bytes mean in Latin-1 — characters the face may well not have.
    const mac = [...u16(6), ...u16(12), ...u16(0), ...u16(0xe9), ...u16(1), ...u16(5)];
    const cps = codepointsOf(
      fontWith([
        { ...UNICODE, bytes: format4() },
        { platform: 1, encoding: 0, bytes: mac },
      ]),
    );
    expect(cps.has(0xe9)).toBe(false);
    expect(cps.has(0x41)).toBe(true);
  });

  it("claims nothing from a subtable format it does not know", () => {
    // Over-claiming here is what prints an empty box, so an unknown format
    // must contribute no coverage at all rather than a guess.
    const future = [...u16(13), ...u16(8), ...u16(0), ...u16(0)];
    const cps = codepointsOf(fontWith([{ ...UNICODE, bytes: future }]));
    expect(cps.size).toBe(0);
  });

  it("refuses bytes that are not a font", () => {
    expect(() => codepointsOf(Uint8Array.from([1, 2, 3]))).toThrow(NotATrueType);
    // A well-formed sfnt with no cmap is a font this check cannot be made
    // against, and guessing "covers everything" would print boxes.
    const noCmap = Uint8Array.from([
      ...u32(0x00010000), ...u16(1), ...u16(0), ...u16(0), ...u16(0),
      ...[..."glyf"].map((c) => c.charCodeAt(0)), ...u32(0), ...u32(28), ...u32(0),
    ]);
    expect(() => codepointsOf(noCmap)).toThrow(/no cmap/);
  });
});

describe("runsOf", () => {
  it("collapses a contiguous set into one run", () => {
    expect(runsOf([3, 4, 5])).toEqual([[3, 5]]);
  });

  it("splits on a gap and sorts first", () => {
    expect(runsOf([9, 3, 4, 7])).toEqual([
      [3, 4],
      [7, 7],
      [9, 9],
    ]);
  });

  it("is empty for an empty set, rather than a run of nothing", () => {
    expect(runsOf([])).toEqual([]);
  });

  it("tolerates a repeated codepoint", () => {
    expect(runsOf([5, 5, 6])).toEqual([[5, 6]]);
  });
});
