/**
 * The parts of the drawing that are easier to read than to photograph.
 *
 * Rotation, alignment and the baseline are all things the byte-identity check
 * in `print-size.test.ts` notices and cannot explain: it reports *that* the
 * page changed, never *what* changed. These assertions say what, so a failure
 * points at a line instead of at a hash.
 */

import { describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPageSvg, textAnchorPoint } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import type { TextSlotLayer } from "../lib/template/types";

const svg = () => renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl });

const slot = (id: string) => MY_FOREVER.layers.find((l) => l.id === id)!;

describe("a turned layer", () => {
  it("is turned about its own centre", () => {
    const card = slot("card");
    const cx = card.frame.x + card.frame.width / 2;
    const cy = card.frame.y + card.frame.height / 2;
    expect(svg()).toContain(`rotate(${card.rotation} ${cx} ${cy})`);
  });

  it("is turned by every angle the template states", () => {
    const out = svg();
    for (const layer of MY_FOREVER.layers) {
      if (!layer.rotation) continue;
      expect(out).toContain(`rotate(${layer.rotation} `);
    }
  });

  it("costs nothing when it is not turned", () => {
    const cloth = slot("cloth");
    expect(cloth.rotation).toBeUndefined();
    expect(svg()).not.toContain("rotate(0 ");
  });
});

describe("where a word hangs from", () => {
  const base: TextSlotLayer = {
    id: "probe",
    kind: "textSlot",
    slot: "probe",
    frame: { x: 100, y: 200, width: 300, height: 80 },
    font: "typewriter",
    size: 40,
    colour: "#000000",
    maxChars: 10,
  };

  it("is the left edge by default", () => {
    expect(textAnchorPoint(base)).toEqual({ x: 100, y: 240 });
  });

  it("is the centre when the slot is centred", () => {
    expect(textAnchorPoint({ ...base, align: "middle" }).x).toBe(250);
  });

  it("is the right edge when the slot is right-aligned", () => {
    expect(textAnchorPoint({ ...base, align: "end" }).x).toBe(400);
  });

  it("uses the declared baseline rather than guessing at the face", () => {
    expect(textAnchorPoint({ ...base, baseline: 12 }).y).toBe(212);
  });

  it("puts FOREVER on the centre line of its own slot", () => {
    const forever = slot("word-forever") as TextSlotLayer;
    expect(forever.align).toBe("middle");
    const at = textAnchorPoint(forever);
    expect(at.x).toBe(forever.frame.x + forever.frame.width / 2);
    expect(svg()).toContain(`text-anchor="middle"`);
  });
});

describe("the output", () => {
  it("escapes what a customer typed", () => {
    const mischief = renderPageSvg(
      MY_FOREVER,
      { ...FIXTURE_FILL, texts: { ...FIXTURE_FILL.texts, wordTop: `</text><script/>` } },
      { href: assetUrl },
    );
    expect(mischief).not.toContain("<script");
    expect(mischief).toContain("&lt;/text&gt;");
  });

  it("draws nothing for a slot the fill has no word for", () => {
    const none = renderPageSvg(MY_FOREVER, { ...FIXTURE_FILL, texts: {} }, { href: assetUrl });
    expect(none).not.toContain("<text ");
  });

  it("draws a dashed hint for a window with no photograph", () => {
    const none = renderPageSvg(MY_FOREVER, { ...FIXTURE_FILL, photos: {} }, { href: assetUrl });
    expect(none).toContain("stroke-dasharray");
    expect(none).not.toContain("<image ");
  });

  it("clips every window to its own mask", () => {
    const out = svg();
    // Two heart windows, each with its own clip path and each using it.
    expect(out.match(/<clipPath id="l\d+-clip">/g)?.length).toBe(2);
    expect(out.match(/clip-path="url\(#l\d+-clip\)"/g)?.length).toBe(2);
  });
});
