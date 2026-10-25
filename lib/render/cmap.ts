/**
 * What characters a font file can actually set.
 *
 * **This module exists to keep a declaration honest.** `./coverage.ts` declares,
 * as data, which codepoints each registered face covers, because the editor
 * needs that answer in a browser and must not download and parse a TTF to get
 * it. A declaration nothing checks is a comment, so `test/coverage.test.ts`
 * parses the real font files with the function below and demands the two agree
 * exactly. Replace a TTF and the test goes red rather than the printed book.
 *
 * It is a `cmap` reader and nothing else — no shaping, no metrics, no layout.
 * Pure: bytes in, codepoints out, no `node:` import, so it can be read by a
 * script, a test, or one day a route, and it is never in the client bundle
 * because only those call it.
 *
 * **A codepoint counts as covered only if it maps to a non-zero glyph.** Glyph
 * 0 is `.notdef` — the empty box — and a `cmap` is allowed to point at it. The
 * whole purpose of this measurement is to tell "this face can write that
 * letter" from "this face will print a box there", so the distinction is the
 * entire point and resolving the glyph id is not optional.
 */

export class NotATrueType extends Error {}

function u16(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1];
}

function i16(b: Uint8Array, at: number): number {
  const v = u16(b, at);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

/**
 * Format 4 — the segmented map every Latin face uses for the BMP.
 *
 * The glyph id arithmetic is the specification's, verbatim: an `idRangeOffset`
 * of zero means add `idDelta` modulo 65536, and anything else is an offset into
 * the glyph array *measured from the offset field itself*, which is the part
 * that is easy to get wrong and silent when you do.
 */
function readFormat4(b: Uint8Array, sub: number, into: Set<number>): void {
  const segCountX2 = u16(b, sub + 6);
  const endAt = sub + 14;
  const startAt = endAt + segCountX2 + 2;
  const deltaAt = startAt + segCountX2;
  const rangeAt = deltaAt + segCountX2;

  for (let s = 0; s < segCountX2 / 2; s++) {
    const end = u16(b, endAt + s * 2);
    const start = u16(b, startAt + s * 2);
    if (start > end) continue;
    const delta = i16(b, deltaAt + s * 2);
    const rangeOffset = u16(b, rangeAt + s * 2);

    for (let c = start; c <= end && c !== 0x10000; c++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const at = rangeAt + s * 2 + rangeOffset + (c - start) * 2;
        if (at + 1 >= b.length) continue;
        const raw = u16(b, at);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) into.add(c);
    }
  }
}

/** Format 12 — the sparse map a face with anything above the BMP needs. */
function readFormat12(b: Uint8Array, sub: number, into: Set<number>): void {
  const groups = u32(b, sub + 12);
  for (let g = 0; g < groups; g++) {
    const at = sub + 16 + g * 12;
    const start = u32(b, at);
    const end = u32(b, at + 4);
    const startGlyph = u32(b, at + 8);
    if (end < start || end - start > 0x110000) continue;
    for (let c = start; c <= end; c++) {
      if (startGlyph + (c - start) !== 0) into.add(c);
    }
  }
}

/** Format 6 — a single contiguous run. Rare, cheap to support, so supported. */
function readFormat6(b: Uint8Array, sub: number, into: Set<number>): void {
  const first = u16(b, sub + 6);
  const count = u16(b, sub + 8);
  for (let i = 0; i < count; i++) {
    if (u16(b, sub + 10 + i * 2) !== 0) into.add(first + i);
  }
}

/** Format 0 — the original byte map. */
function readFormat0(b: Uint8Array, sub: number, into: Set<number>): void {
  for (let c = 0; c < 256; c++) {
    if (b[sub + 6 + c] !== 0) into.add(c);
  }
}

/**
 * Every Unicode codepoint the file has a real glyph for.
 *
 * All Unicode subtables are unioned rather than one being picked. A face that
 * states the same coverage twice costs nothing here, and a face whose only
 * useful subtable is the one a chooser would have rejected would otherwise read
 * as having no coverage at all — which, for a check that *refuses* characters,
 * is the failure that annoys a customer for no reason.
 */
export function codepointsOf(bytes: Uint8Array): Set<number> {
  if (bytes.length < 12) throw new NotATrueType("too short to be a font");
  const tables = u16(bytes, 4);
  let cmap: number | null = null;
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16;
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) === "cmap") {
      cmap = u32(bytes, at + 8);
    }
  }
  if (cmap === null) throw new NotATrueType("no cmap table");

  const out = new Set<number>();
  const subtables = u16(bytes, cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(bytes, rec);
    const encoding = u16(bytes, rec + 2);
    // Unicode subtables only. A Macintosh-Roman table maps bytes, not
    // codepoints, and folding it in would claim coverage of whatever those
    // bytes happen to mean in Latin-1.
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;

    const sub = cmap + u32(bytes, rec + 4);
    if (sub + 4 > bytes.length) continue;
    switch (u16(bytes, sub)) {
      case 0:
        readFormat0(bytes, sub, out);
        break;
      case 4:
        readFormat4(bytes, sub, out);
        break;
      case 6:
        readFormat6(bytes, sub, out);
        break;
      case 12:
        readFormat12(bytes, sub, out);
        break;
      default:
        // An unknown subtable format contributes nothing. Guessing would be
        // over-claiming, and over-claiming here prints an empty box.
        break;
    }
  }
  return out;
}

/** Codepoints as sorted `[start, end]` runs — how `./coverage.ts` states them. */
export function runsOf(codepoints: Iterable<number>): Array<[number, number]> {
  const sorted = [...codepoints].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const runs: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const c of sorted.slice(1)) {
    if (c === prev) continue;
    if (c === prev + 1) {
      prev = c;
      continue;
    }
    runs.push([start, prev]);
    start = c;
    prev = c;
  }
  runs.push([start, prev]);
  return runs;
}
