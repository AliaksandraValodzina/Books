/**
 * **"My Forever" — page one, as data.**
 *
 * A square page: a brown polka-dot cloth ground, a white card taped to it at
 * the top with a strip of translucent tape, two heart-shaped windows one above
 * the other, the word the customer chooses beside the upper heart and a second
 * one below the lower, and a lipstick kiss in the bottom corner.
 *
 * **Every mark on it is made by `lib/render/decoration.ts` from the numbers
 * below.** Nothing is traced, nothing is sampled and no file is lifted: the
 * cloth is a two-dot tile and a crossed weave, the tape is a seeded tear walk
 * with a gloss band, the kiss is a cupid's bow and nine creases, and the heart
 * is five cubics in `lib/template/geometry.ts`. The *idiom* — a taped card,
 * hearts, a kiss, polka dots — is a scrapbook convention and belongs to nobody.
 * The execution is ours because there is no file anywhere in it.
 *
 * This module is TypeScript rather than JSON for one reason: the compiler
 * checks it against `PageTemplate`, so a template with a misspelt field cannot
 * be committed. It is *data* in every other sense — no logic, no imports but
 * the type — and `npm run print` writes the JSON beside the print file to prove
 * it survives the round trip.
 */

import type { PageTemplate } from "../lib/template/types";

export const MY_FOREVER: PageTemplate = {
  schema: 1,
  id: "my-forever",
  rev: "6cada7f0",
  name: "My Forever",
  canvas: {
    unit: "pt",
    // 756 pt = 10.5 inches. With `print.pixels` at 3150 that is exactly 300 DPI,
    // derived rather than declared — see the note on `Pt` in lib/template/types.ts.
    width: 756,
    height: 756,
    /**
     * **A protective assumption, not a measurement.** Printify states a print
     * area per product in its Product Creator and that stated size is what you
     * supply; what it does not publish outside the Creator is how much of it is
     * bleed. 0.125 in and 0.25 in are both standard and photo books tend to the
     * larger, so the larger is declared here: it moves the trim guide *inwards*,
     * which keeps content further from any real cut line rather than nearer it.
     * The moment somebody opens the Creator's template this becomes one number.
     * `docs/print.md` carries the evidence and the open question.
     */
    bleed: 18,
    /** A further 0.25 in. Nothing a customer can see crosses it. */
    safe: 18,
    background: "#6B4A33",
  },
  print: {
    pixels: { width: 3150, height: 3150 },
    colourSpace: "srgb",
    encoding: "png",
  },
  layers: [
    {
      id: "cloth",
      kind: "art",
      // Full artboard, corner to corner: the ground is what bleed is for, and a
      // ground that stopped at the trim would show as a white hairline on a cut
      // that landed a millimetre out.
      frame: { x: 0, y: 0, width: 756, height: 756 },
      art: {
        kind: "polkaCloth",
        background: "#6B4A33",
        dot: "#F2E4D3",
        radius: 7,
        pitch: 34,
        weave: { colour: "#24150C", width: 0.9, pitch: 2.4, opacity: 0.08 },
      },
    },
    {
      id: "card",
      kind: "shape",
      frame: { x: 96, y: 118, width: 564, height: 560 },
      // A degree and a bit off square. A card taped on by hand is never level,
      // and the eye reads the difference long before it notices the angle.
      rotation: -1.2,
      shape: {
        kind: "rect",
        radius: 4,
        fill: "#FBF6EC",
        stroke: { colour: "#E4D9C6", width: 1 },
        shadow: { colour: "#1E1008", blur: 9, dx: 0, dy: 7 },
      },
    },
    {
      id: "tape",
      kind: "art",
      // Straddling the card's top edge, which is the only position that reads
      // as "taped to the cloth" rather than "a sticker on the card".
      frame: { x: 300, y: 92, width: 158, height: 54 },
      rotation: -4.5,
      art: { kind: "tape", colour: "#DCD0AE", opacity: 0.66, tear: 4.5, seed: 7391 },
    },
    {
      id: "heart-upper",
      kind: "photoSlot",
      slot: "photoTop",
      frame: { x: 140, y: 152, width: 236, height: 208 },
      rotation: -3.5,
      mask: { kind: "heart", cleft: 0.26 },
      stroke: { colour: "#FFFFFF", width: 3 },
      placeholder: { fill: "#F0E7D8" },
      prompt: "The two of you",
    },
    {
      id: "word-my",
      kind: "textSlot",
      slot: "wordTop",
      // To the right of the upper heart, written on the card in pen.
      frame: { x: 404, y: 222, width: 176, height: 116 },
      rotation: -5,
      font: "hand",
      size: 92,
      baseline: 86,
      colour: "#4A2E22",
      align: "start",
      maxChars: 8,
    },
    {
      id: "heart-lower",
      kind: "photoSlot",
      slot: "photoBottom",
      frame: { x: 222, y: 374, width: 248, height: 220 },
      rotation: 3,
      mask: { kind: "heart", cleft: 0.26 },
      stroke: { colour: "#FFFFFF", width: 3 },
      placeholder: { fill: "#F0E7D8" },
      prompt: "Somewhere you went",
    },
    {
      id: "word-forever",
      kind: "textSlot",
      slot: "wordBottom",
      // Centred under the lower heart, set in the typewriter face with the
      // letters opened up — the way a label on a scrapbook page is.
      frame: { x: 150, y: 604, width: 392, height: 62 },
      rotation: 0.8,
      font: "typewriter",
      size: 50,
      baseline: 44,
      colour: "#3A241A",
      align: "middle",
      letterSpacing: 6,
      transform: "uppercase",
      maxChars: 12,
    },
    {
      id: "kiss",
      kind: "art",
      frame: { x: 522, y: 568, width: 116, height: 94 },
      rotation: -14,
      art: { kind: "kiss", colour: "#B22741", creases: 9, seed: 4211 },
    },
  ],
};

export default MY_FOREVER;
