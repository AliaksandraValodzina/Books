/**
 * The face registry. One key, three answers.
 *
 * A `TextSlotLayer.font` names a key here, never a CSS family. The browser
 * needs a family it has an `@font-face` for; the rasteriser needs a file on
 * disk; the iPad app will one day need something else again. If a template
 * named the CSS family directly, the rasteriser would have to keep a private
 * table mapping it back to a file — and a template could name a face that one
 * renderer has and the other has not, which is a difference that shows up
 * **only in the printed book**.
 *
 * Keepnook's `TextElement.fontSource` exists because two namespaces were
 * allowed to share one string and became indistinguishable forever. This is
 * that lesson taken before the fact.
 *
 * **Files are vendored, not fetched.** `public/fonts/` holds the TTFs, which
 * the browser loads over `@font-face` from the same path the rasteriser reads
 * off disk — one file, two readers. A webfont CDN would mean the print file
 * depended on somebody else's uptime.
 */

export interface Face {
  /** The CSS family the browser is given, and the family name inside the TTF. */
  family: string;
  /** Path under `public/`, which is also the URL the browser fetches. */
  file: string;
  /** For the licence notice in `public/fonts/`. */
  licence: string;
}

export const FACES: Record<string, Face> = {
  typewriter: {
    family: "Special Elite",
    file: "fonts/SpecialElite-Regular.ttf",
    licence: "Apache-2.0",
  },
  hand: {
    family: "Indie Flower",
    file: "fonts/IndieFlower-Regular.ttf",
    licence: "OFL-1.1",
  },
};

/**
 * The family to set a slot in.
 *
 * An unknown key falls back to the first registered face rather than to the
 * platform default. A platform default is whatever the machine happens to have,
 * which means the browser and the rasteriser would disagree — the one thing
 * this module exists to prevent. A fallback that is *wrong* but *the same in
 * both pictures* is recoverable; one that differs between them is not.
 */
export function familyOf(key: string): string {
  return (FACES[key] ?? FACES[Object.keys(FACES)[0]]).family;
}

export function isKnownFace(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(FACES, key);
}

/** The `@font-face` block the screen needs, generated from the same table. */
export function fontFaceCss(): string {
  return Object.values(FACES)
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("/${f.file}") format("truetype");font-display:block;font-weight:400;font-style:normal;}`,
    )
    .join("");
}
