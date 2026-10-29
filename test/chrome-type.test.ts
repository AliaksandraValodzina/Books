/**
 * **The page's dressing, where it makes a promise a stylesheet can break.**
 *
 * `data/bk-landing-design-research/report.md` §9 named a palette and a type
 * pairing, and most of that is taste and belongs in nobody's test. Five things
 * in it are not taste — they are claims that go wrong silently, which is the
 * only reason any of them is here:
 *
 * **The accent is the product's own red.** `--accent` is `#B22741` because that
 * is the lipstick kiss in `templates/my-forever.ts`, so the page and the thing
 * it sells share one colour. Two hex literals in two files that have to agree
 * is drift waiting to happen, and the day somebody "tidies" one the page stops
 * matching the artwork in a way no screenshot review catches.
 *
 * **The chrome's faces cannot reach a print file.** `lib/render/fonts.ts` warns
 * that a hand-written `@font-face` list is the drift this product cannot
 * afford, and `globals.css` now has one. The warning is about the *artwork*
 * faces — a word set in a face the rasteriser lacks prints as a gap — so what
 * makes the new rules safe is precisely that no template can name them. That is
 * asserted here rather than asserted in a comment.
 *
 * **A vendored font file that is not there is invisible.** `font-display: swap`
 * means a 404 renders the page in Georgia and looks deliberate. Every `url()`
 * in the stylesheet is resolved against the disk.
 *
 * **Dark mode must not be half-defined.** The references in the report are all
 * light-only, so the dark palette was reasoned rather than measured, and the
 * failure mode is a token that exists in `:root` and not in the dark block —
 * which leaves one colour at its light value on a near-black ground.
 *
 * **The contrast was measured, so it stays measured.** Every foreground/ground
 * pair the page actually uses is checked to WCAG AA here. §9's own `#8A6A3A`
 * for `--caution` is the one value this repository changed, because the tag
 * sits on `--band` where that ochre is 4.17:1; the test is what stops it
 * drifting back.
 *
 * Each block below is paired with an assertion that it can fail — a regex that
 * matches nothing passes whatever the file says, which is the way a test like
 * this rots.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACES, fontFaceCss } from "../lib/render/fonts";
import { MY_FOREVER } from "../templates/my-forever";

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

/** The custom properties of one `{ … }` block, by the selector that opens it. */
function tokensIn(css: string, selector: string, occurrence = 0): Record<string, string> {
  const blocks: string[] = [];
  const needle = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "g");
  for (let m = needle.exec(css); m; m = needle.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push(css.slice(start, i - 1));
  }
  const body = blocks[occurrence] ?? "";
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** The dark block, which is the `:root` nested inside the one media query. */
function darkTokens(): Record<string, string> {
  const at = CSS.indexOf("@media (prefers-color-scheme: dark)");
  expect(at, "there is no dark-mode block at all").toBeGreaterThan(-1);
  return tokensIn(CSS.slice(at), ":root");
}

const light = tokensIn(CSS, ":root");
const dark = darkTokens();

// WCAG 2.1 relative luminance and contrast ratio.
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const COLOUR_TOKENS = [
  "--ground",
  "--surface",
  "--band",
  "--ink",
  "--ink-soft",
  "--rule",
  "--accent",
  "--accent-ink",
  "--caution",
] as const;

describe("the palette was read at all", () => {
  it("parsed nine colour tokens out of the stylesheet", () => {
    // The guard the rest of this file is worthless without: every assertion
    // below is about values pulled out by a regex, and a regex that matched
    // nothing would make all of them vacuously true.
    for (const token of COLOUR_TOKENS) {
      expect(light[token], `${token} is not in :root`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark[token], `${token} is not in the dark block`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("would notice a token that was not there", () => {
    // The paired negative. `tokensIn` returns undefined for a name the block
    // does not carry, so the loop above can genuinely fail.
    expect(light["--not-a-token"]).toBeUndefined();
    expect(tokensIn(CSS, ":not-a-selector")["--ground"]).toBeUndefined();
  });
});

describe("the accent is the kiss in the artwork", () => {
  /** The kiss layer's colour, out of the template rather than out of a comment. */
  const kiss = MY_FOREVER.layers.find((l) => l.id === "kiss");
  const kissColour =
    kiss && kiss.kind === "art" && kiss.art.kind === "kiss" ? kiss.art.colour : undefined;

  it("is the same six hex digits in the stylesheet and in the template", () => {
    expect(kissColour, "the template has no kiss to match").toMatch(/^#[0-9a-f]{6}$/i);
    expect(light["--accent"].toLowerCase()).toBe(kissColour!.toLowerCase());
  });

  it("stays the product's red in dark mode, where only the ink lifts", () => {
    // The fill is the colour of a physical lipstick mark and is not a theme
    // value. The red used as *ink* has to lift, because `#B22741` text on
    // `#17110C` is unreadable — which is the whole reason the two are separate
    // tokens, and the assertion below is what says so.
    expect(dark["--accent"].toLowerCase()).toBe(kissColour!.toLowerCase());
    expect(contrast(light["--accent"], dark["--ground"])).toBeLessThan(3);
    expect(contrast(dark["--accent-ink"], dark["--ground"])).toBeGreaterThanOrEqual(4.5);
  });

  it("would notice the template's kiss changing colour", () => {
    // The paired negative: the claim is only worth making because a different
    // template would make it false.
    expect(kissColour!.toLowerCase()).not.toBe("#000000");
    expect(light["--accent"].toLowerCase()).not.toBe("#000000");
  });
});

describe("the chrome's faces cannot reach a print file", () => {
  const chromeFamilies = [...CSS.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]);

  it("found the @font-face families, so the checks below are not vacuous", () => {
    expect(chromeFamilies).toContain("Fraunces");
    expect(chromeFamilies).toContain("Instrument Sans");
  });

  it("names none of them in the renderer's registry", () => {
    // A `textSlot` names a key in `FACES`, never a CSS family, so a template
    // physically cannot ask for one of these. This asserts the registry has not
    // grown one of them by accident — which is the only way it could happen.
    const registered = Object.values(FACES).map((f) => f.family);
    for (const family of new Set(chromeFamilies)) {
      expect(registered, `${family} is in the renderer's face registry`).not.toContain(family);
    }
  });

  it("keeps the artwork faces coming from that registry and not from here", () => {
    // The other half: the two faces that *do* reach the print file are still
    // generated from the one table the rasteriser reads its file paths from.
    const generated = fontFaceCss();
    expect(generated).toContain("Special Elite");
    expect(generated).toContain("Indie Flower");
    for (const family of new Set(chromeFamilies)) {
      expect(generated, `${family} is in the artwork's @font-face block`).not.toContain(family);
    }
  });

  it("would notice the two sets being merged", () => {
    // The paired negative. If `globals.css` ever declared an artwork face, the
    // loops above would be comparing a family against itself and must fail.
    expect(chromeFamilies).not.toContain("Indie Flower");
    expect(chromeFamilies).not.toContain("Special Elite");
    expect(Object.values(FACES).map((f) => f.family)).toContain("Indie Flower");
  });
});

describe("every vendored font file is on disk", () => {
  const urls = [...CSS.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map((m) => m[1]);

  it("found the url() references", () => {
    expect(urls.length).toBeGreaterThanOrEqual(5);
  });

  it("resolves each one under public/", () => {
    // `font-display: swap` makes a missing file invisible: the page renders in
    // the fallback serif and looks deliberate. Nothing else would catch this.
    for (const url of urls) {
      const file = path.join(ROOT, "public", url.replace(/^\//, ""));
      expect(existsSync(file), `${url} is referenced and not vendored`).toBe(true);
    }
  });

  it("would notice a path that is not there", () => {
    expect(existsSync(path.join(ROOT, "public", "fonts", "chrome", "not-a-face.woff2"))).toBe(false);
  });
});

describe("dark mode is defined, not half-defined", () => {
  it("redefines every colour token the light palette declares", () => {
    // The report's eight references are light-only, so this palette was
    // reasoned. The failure it guards is one token left at its light value on a
    // near-black ground — a cream `--surface` panel in a dark page.
    for (const token of COLOUR_TOKENS) {
      expect(dark[token], `${token} is missing from the dark block`).toBeDefined();
    }
  });

  it("actually inverts, rather than copying the light values", () => {
    // The paired negative: a dark block that redefined every token to its light
    // value would pass the loop above.
    expect(luminance(light["--ground"])).toBeGreaterThan(0.5);
    expect(luminance(dark["--ground"])).toBeLessThan(0.1);
    expect(luminance(light["--ink"])).toBeLessThan(0.1);
    expect(luminance(dark["--ink"])).toBeGreaterThan(0.5);
  });
});

describe("the contrast of every pair the page uses", () => {
  /** Foreground, background, and where it appears. Read off the real markup. */
  const pairs: Array<[fg: string, bg: string, where: string]> = [
    ["--ink", "--ground", "body copy on the page"],
    ["--ink", "--surface", "copy in the editor card"],
    ["--ink-soft", "--ground", "the lede, captions, the footer"],
    ["--ink-soft", "--surface", "the editor's status line"],
    ["--ink-soft", "--band", "the spec labels in the facts table"],
    ["--accent-ink", "--ground", "the price, the eyebrow rule, the print-file link"],
    ["--accent-ink", "--surface", "the print-file link inside the editor card"],
    ["--caution", "--band", "TO CONFIRM in the facts table"],
    ["--caution", "--ground", "TO CONFIRM beside the delivery line and the price"],
  ];

  for (const [fg, bg, where] of pairs) {
    it(`${fg} on ${bg} reaches AA — ${where}`, () => {
      for (const [scheme, tokens] of [
        ["light", light],
        ["dark", dark],
      ] as const) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        expect(
          ratio,
          `${scheme}: ${tokens[fg]} on ${tokens[bg]} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("white on the accent fill reaches AA, which is the CTA's label", () => {
    for (const tokens of [light, dark]) {
      expect(contrast("#ffffff", tokens["--accent"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("would notice a pair that failed", () => {
    // The paired negative, and the specific value this repository changed:
    // §9 names `#8A6A3A` for `--caution`, which is 4.17:1 on `--band` and is
    // why the token here is one step darker. If that ever drifts back, the
    // `--caution` / `--band` case above goes red — this proves it can.
    expect(contrast("#8a6a3a", light["--band"])).toBeLessThan(4.5);
    expect(contrast(light["--caution"], light["--band"])).toBeGreaterThanOrEqual(4.5);
  });
});
