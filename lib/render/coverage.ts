/**
 * Which characters each face can actually write — **declared here, checked
 * against the font files by `test/coverage.test.ts`.**
 *
 * This is the one place in the codebase where the browser and the rasteriser
 * genuinely cannot be made to agree by construction, so the disagreement is
 * named and closed here instead.
 *
 * `lib/render/raster.ts` loads `resvg` with `loadSystemFonts: false` — on
 * purpose, because a machine's own fonts are a difference between machines — and
 * hands it the two TTFs in `public/fonts/`. So the rasteriser has **no
 * fallback**: a codepoint those two files do not carry prints as nothing at all.
 * A browser does the opposite. Give it `font-family: "Indie Flower"` and a
 * Cyrillic letter and it quietly substitutes whatever face the device has, and
 * the word looks *fine on screen*.
 *
 * That is the exact failure this product cannot afford: the customer approves a
 * page they can read and a book arrives with a hole in the word. Neither
 * vendored face covers Cyrillic or any emoji — measured, not assumed; see
 * `test/coverage.test.ts` — so the editor has to refuse those characters while
 * the customer is still looking at the page, and say why.
 *
 * It is declared as data rather than read from the TTFs because the editor runs
 * in a browser and must not fetch and parse a megabyte of font to find out
 * whether it can accept a keystroke. `lib/render/cmap.ts` does the reading, the
 * test does the comparing, and a swapped font file fails a test rather than a
 * book. `docs/template-format.md` § The text that did not fit is the same
 * argument applied to length.
 */

import { FACES } from "./fonts";

/**
 * Codepoint runs, inclusive, lowercase hex, space separated, ascending.
 *
 * **Generated from the font files, not written by hand.** `test/coverage.test.ts`
 * regenerates them with `codepointsOf` and asserts equality, and prints the
 * replacement string when they differ. A run is here only if the face maps the
 * codepoint to a real glyph — glyph 0 is `.notdef`, which is the empty box this
 * whole module exists to keep out of a printed word.
 */
export const FACE_COVERAGE: Record<string, string> = {
  hand:
    "0 d 20-7e a0-131 134-17e 18f 192 1a0-1a1 1af-1b0 1e6-1e7 1ea-1eb 1fa-21b " +
    "22a-22d 230-233 237 259 2bc 2c6-2c7 2c9 2d8-2dd 300-304 306-30c 30f 311-312 " +
    "31b 323-324 326-328 32e 331 335-338 1e80-1e85 1e9e 1ea0-1ef9 2013-2014 " +
    "2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2074 20a1 20a3-20a4 " +
    "20a6-20a7 20a9 20ab-20ad 20b1-20b2 20b5 20b9-20ba 20bc-20bd 2116 2122 2212 " +
    "2215 2219 2248 2260 2264-2265 fb01-fb02",
  typewriter:
    "20-7e a0-17e 1fc-1ff 237 2c6-2c7 2d8-2dd 312 315 326 3bc 1e80-1e85 1ef2-1ef3 " +
    "2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 20ac 2122 " +
    "2202 220f 2212 2248 2260 fb01-fb02",
};

export function parseRuns(spec: string): Array<[number, number]> {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const [a, b] = part.split("-");
      const start = parseInt(a, 16);
      return [start, b === undefined ? start : parseInt(b, 16)] as [number, number];
    });
}

const SETS = new Map<string, Array<[number, number]>>();

/**
 * The runs for a face key.
 *
 * An unknown key falls back to the **first registered face, exactly as
 * `familyOf` does**. The two have to agree: a check that consulted one face's
 * coverage while the renderer set the word in another would accept a character
 * that then printed as a box, which is the whole thing being prevented.
 */
function runsFor(fontKey: string): Array<[number, number]> {
  const key = Object.prototype.hasOwnProperty.call(FACES, fontKey)
    ? fontKey
    : Object.keys(FACES)[0];
  let runs = SETS.get(key);
  if (!runs) {
    runs = parseRuns(FACE_COVERAGE[key] ?? "");
    SETS.set(key, runs);
  }
  return runs;
}

/** Can this face write this codepoint, with a real glyph? */
export function covers(fontKey: string, codepoint: number): boolean {
  for (const [start, end] of runsFor(fontKey)) {
    if (codepoint >= start && codepoint <= end) return true;
  }
  return false;
}

/**
 * The distinct characters in `text` this face cannot write, in the order they
 * first appear.
 *
 * Iterated by codepoint rather than by UTF-16 unit, so an astral emoji is
 * reported once as itself and not twice as two unpaired halves — a message
 * saying a customer may not type "\ud83d" is worse than no message.
 *
 * A face with **no declared coverage at all** is treated as covering
 * everything. That reads backwards and is deliberate: an empty declaration
 * means somebody added a face and has not generated its runs yet, and the
 * failure mode of guessing "covers nothing" is an editor that refuses every
 * key a customer presses. The test is what catches the missing declaration;
 * this function is not the place to enforce it.
 */
export function unsettable(fontKey: string, text: string): string[] {
  if (runsFor(fontKey).length === 0) return [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || covers(fontKey, cp) || seen.has(ch)) continue;
    seen.add(ch);
    bad.push(ch);
  }
  return bad;
}
