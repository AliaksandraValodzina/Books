/**
 * **The declaration in `lib/render/coverage.ts` is checked against the font
 * files here, and this test is the only reason it can be trusted.**
 *
 * The editor refuses a character the printed book could not carry. That refusal
 * is only correct while the declared coverage matches the TTFs in
 * `public/fonts/`, and nothing else in the codebase would notice if somebody
 * swapped a font file for one with a different `cmap`. So this test re-measures
 * from the bytes every run and prints the replacement string when it disagrees.
 *
 * It then asserts the two facts the editor's refusal rests on — that the faces
 * really do carry Latin and really do not carry Cyrillic or emoji — because a
 * range comparison that happened to pass against two empty sets would prove
 * nothing at all.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codepointsOf, runsOf } from "../lib/render/cmap";
import { FACE_COVERAGE, covers, parseRuns, unsettable } from "../lib/render/coverage";
import { FACES } from "../lib/render/fonts";

const asSpec = (runs: Array<[number, number]>) =>
  runs.map(([a, b]) => (a === b ? a.toString(16) : `${a.toString(16)}-${b.toString(16)}`)).join(" ");

async function measured(key: string): Promise<Set<number>> {
  const file = path.join(process.cwd(), "public", FACES[key].file);
  return codepointsOf(new Uint8Array(await readFile(file)));
}

describe("the declared coverage", () => {
  it("names every registered face", () => {
    expect(Object.keys(FACE_COVERAGE).sort()).toEqual(Object.keys(FACES).sort());
  });

  for (const key of Object.keys(FACES)) {
    it(`matches the glyphs actually in ${FACES[key].file}`, async () => {
      const spec = asSpec(runsOf(await measured(key)));
      // The failure message carries the fix: paste this into FACE_COVERAGE.
      expect(spec, `FACE_COVERAGE.${key} should be:\n${spec}\n`).toBe(
        asSpec(parseRuns(FACE_COVERAGE[key])),
      );
    });

    it(`is not trivially empty for ${key}`, async () => {
      const cps = await measured(key);
      // The comparison above would pass if the parser returned nothing and the
      // declaration were blank. It must not be possible for that to be green.
      expect(cps.size).toBeGreaterThan(300);
      expect(parseRuns(FACE_COVERAGE[key]).length).toBeGreaterThan(10);
    });
  }
});

describe("what the faces on this page can and cannot write", () => {
  const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'&-";

  for (const key of Object.keys(FACES)) {
    it(`${key} writes every character the page's own words use`, () => {
      expect(unsettable(key, LATIN)).toEqual([]);
      expect(unsettable(key, "my")).toEqual([]);
      expect(unsettable(key, "FOREVER")).toEqual([]);
    });

    it(`${key} cannot write Cyrillic, and the editor is told so`, () => {
      // Measured, not assumed. Both vendored faces are Latin-only, which is
      // why a Cyrillic word would look right on screen and print as a gap.
      expect(unsettable(key, "моя")).toEqual(["м", "о", "я"]);
      expect(covers(key, "я".codePointAt(0)!)).toBe(false);
    });

    it(`${key} cannot write an emoji, and reports it as one character`, () => {
      // An astral codepoint must come back as itself. Reporting two unpaired
      // surrogates to a customer is worse than reporting nothing.
      expect(unsettable(key, "😍")).toEqual(["😍"]);
      expect(unsettable(key, "❤")).toEqual(["❤"]);
    });
  }

  it("asks the face the slot actually names", async () => {
    // The two faces are not the same set, so "which face" is a question with
    // consequences. Indie Flower carries Vietnamese that Special Elite has
    // never heard of; Special Elite carries a mu that Indie Flower does not.
    // A check that consulted the wrong face would be wrong in both directions,
    // and this is the pair that proves it consults the right one.
    const hand = await measured("hand");
    const typewriter = await measured("typewriter");
    const viet = "ư".codePointAt(0)!;
    const mu = "μ".codePointAt(0)!;

    expect(hand.has(viet)).toBe(true);
    expect(typewriter.has(viet)).toBe(false);
    expect(typewriter.has(mu)).toBe(true);
    expect(hand.has(mu)).toBe(false);

    expect(covers("hand", viet)).toBe(true);
    expect(covers("typewriter", viet)).toBe(false);
    expect(covers("typewriter", mu)).toBe(true);
    expect(covers("hand", mu)).toBe(false);
  });

  it("falls back to the same face the renderer would set", () => {
    // `familyOf` sends an unknown key to the first registered face. Coverage
    // has to follow it there, or a word would be checked against one face and
    // drawn in another.
    const first = Object.keys(FACES)[0];
    // Agreement on the codepoints the two faces disagree about is the only
    // comparison that can tell "followed the fallback" from "said yes to
    // everything".
    for (const ch of ["μ", "ư", "A", "я", "😍", "€"]) {
      const cp = ch.codePointAt(0)!;
      expect(covers("no-such-face", cp), `fallback disagreed about ${ch}`).toBe(
        covers(first, cp),
      );
    }
    expect(unsettable("no-such-face", "моя")).toEqual(unsettable(first, "моя"));
    // And it is not a blanket yes: nothing in the registry writes Cyrillic.
    expect(covers("no-such-face", "я".codePointAt(0)!)).toBe(false);
  });
});
