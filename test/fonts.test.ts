/**
 * The faces, and the deployment bug they are one half of.
 *
 * `lib/render/raster.ts` opens the TTFs by path with `loadSystemFonts: false`,
 * so a machine's own fonts can never leak into a print file — and a *missing*
 * file does not throw, it silently produces a page with no type on it. That
 * failure mode is why these assertions exist: it is invisible to a build, it is
 * invisible to a type check, and on Vercel it is the default, because `public/`
 * is not part of a function's filesystem unless `next.config.ts` says so.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACES, familyOf, fontFaceCss, isKnownFace } from "../lib/render/fonts";
import { fontFilesPresent } from "../lib/render/raster";
import { MY_FOREVER } from "../templates/my-forever";

describe("the registry", () => {
  it("has a file on disk for every face", async () => {
    expect(await fontFilesPresent()).toBe(true);
  });

  it("points at real TrueType, not at a stub", async () => {
    for (const face of Object.values(FACES)) {
      const bytes = new Uint8Array(await readFile(path.join(process.cwd(), "public", face.file)));
      expect(bytes.length).toBeGreaterThan(20_000);
      // sfnt version 0x00010000 — a TrueType outline font.
      expect(Array.from(bytes.subarray(0, 4))).toEqual([0, 1, 0, 0]);
    }
  });

  it("ships a licence beside each one", async () => {
    // The repository is public and both faces are licensed, not public domain.
    for (const name of ["SpecialElite-LICENSE.txt", "IndieFlower-OFL.txt"]) {
      const text = await readFile(path.join(process.cwd(), "public", "fonts", name), "utf8");
      expect(text.length).toBeGreaterThan(500);
    }
  });

  it("gives the browser the same families the rasteriser loads", () => {
    const css = fontFaceCss();
    for (const face of Object.values(FACES)) {
      expect(css).toContain(`font-family:"${face.family}"`);
      expect(css).toContain(`url("/${face.file}")`);
    }
  });
});

describe("a face the registry does not have", () => {
  it("falls back to a registered one, never to whatever the machine has", () => {
    // A platform default would differ between the browser and the rasteriser,
    // which is the one difference this indirection exists to prevent. Wrong and
    // identical is recoverable; right-ish and different is not.
    expect(isKnownFace("Comic Sans MS")).toBe(false);
    const fallback = familyOf("Comic Sans MS");
    expect(Object.values(FACES).map((f) => f.family)).toContain(fallback);
  });
});

describe("the page", () => {
  it("names only faces the registry has", () => {
    for (const layer of MY_FOREVER.layers) {
      if (layer.kind === "textSlot") expect(isKnownFace(layer.font)).toBe(true);
    }
  });

  it("uses both of them, so neither is dead weight in the function bundle", () => {
    const used = new Set(
      MY_FOREVER.layers.flatMap((l) => (l.kind === "textSlot" ? [l.font] : [])),
    );
    expect([...used].sort()).toEqual(Object.keys(FACES).sort());
  });
});
