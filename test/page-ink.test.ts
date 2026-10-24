/**
 * **Did the page actually get drawn?**
 *
 * Every assertion in this file is paired with the same assertion against a
 * render that is missing the thing being asserted. That pairing is the whole
 * design: a content test is only worth having if it can be shown to fail, and
 * the cheapest honest way to show it is to take the layer out and watch it go
 * red. A test that merely passes proves nothing about the renderer; a test that
 * passes *and* fails on the mutation proves it is looking at the right pixels.
 *
 * Written in page units against `REGION` in `./pixels.ts`, so a statement here
 * reads as a statement about the page rather than about arithmetic.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPrintPng } from "../lib/render/raster";
import {
  INK,
  REGION,
  distinctColours,
  isColour,
  hexAt,
  meanLuma,
  raster,
  shareOf,
  without,
  type Raster,
} from "./pixels";
import type { PageTemplate } from "../lib/template/types";

/** Rendered once at half scale: the questions are about regions, not sharpness. */
const HALF: PageTemplate = {
  ...MY_FOREVER,
  print: { ...MY_FOREVER.print, pixels: { width: 1575, height: 1575 } },
};

async function render(template: PageTemplate): Promise<Raster> {
  const { png } = await renderPrintPng(template, FIXTURE_FILL);
  return raster(png, template);
}

let page: Raster;
beforeAll(async () => {
  page = await render(HALF);
});

describe("the cloth", () => {
  it("is brown, and has cream dots on it", () => {
    expect(shareOf(page, REGION.clothCorner, INK.cloth, 18)).toBeGreaterThan(0.4);
    expect(shareOf(page, REGION.clothCorner, INK.dot, 18)).toBeGreaterThan(0.08);
  });

  it("has no dots when the cloth layer is gone", async () => {
    const bare = await render(without(HALF, "cloth"));
    expect(shareOf(bare, REGION.clothCorner, INK.dot, 18)).toBeLessThan(0.01);
  });
});

describe("the card", () => {
  it("covers the cloth where it sits", () => {
    expect(shareOf(page, REGION.cardClear, INK.card, 10)).toBeGreaterThan(0.95);
  });

  it("is cloth again when the card layer is gone", async () => {
    const bare = await render(without(HALF, "card"));
    expect(shareOf(bare, REGION.cardClear, INK.card, 10)).toBeLessThan(0.02);
  });
});

describe("the tape", () => {
  it("lightens the cloth it is stuck over", () => {
    const under = meanLuma(page, REGION.tapeOverCloth);
    const beside = meanLuma(page, REGION.clothBesideTape);
    expect(under).toBeGreaterThan(beside + 20);
  });

  it("leaves the cloth alone when the tape layer is gone", async () => {
    const bare = await render(without(HALF, "tape"));
    const under = meanLuma(bare, REGION.tapeOverCloth);
    const beside = meanLuma(bare, REGION.clothBesideTape);
    expect(Math.abs(under - beside)).toBeLessThan(20);
  });
});

describe("the photographs", () => {
  it("puts the warm one in the upper heart and the cool one in the lower", () => {
    // Not "is this exact colour": a photograph is hundreds of colours and
    // pinning one of them would be pinning the fixture rather than the render.
    // Which of red and blue leads is a fact about *which picture went where*.
    const up = hexAt(page, 258, 260);
    const lo = hexAt(page, 346, 470);
    const warm = parseInt(up.slice(1, 3), 16) - parseInt(up.slice(5, 7), 16);
    const cool = parseInt(lo.slice(5, 7), 16) - parseInt(lo.slice(1, 3), 16);
    expect(warm).toBeGreaterThan(20);
    expect(cool).toBeGreaterThan(20);
  });

  it("draws a photograph and not a flat patch", () => {
    expect(distinctColours(page, REGION.heartUpperCentre)).toBeGreaterThan(30);
    expect(distinctColours(page, REGION.heartLowerCentre)).toBeGreaterThan(30);
  });

  it("leaves a dashed empty window when no photograph is chosen", async () => {
    const unfilled = await renderPrintPng(HALF, {
      ...FIXTURE_FILL,
      photos: {},
    });
    const empty = raster(unfilled.png, HALF);
    expect(distinctColours(empty, REGION.heartUpperCentre)).toBeLessThan(6);
  });
});

describe("the heart is a heart", () => {
  // The strongest statement this suite makes about the mask. If `maskPath` ever
  // fell back to a rectangle, every assertion above would still pass — the
  // photograph would be in the right place, the right way up, the right
  // colours. Only the gap between the lobes tells the difference.
  it("leaves the space between the lobes as card", () => {
    expect(shareOf(page, REGION.heartUpperCleft, INK.card, 12)).toBeGreaterThan(0.9);
    expect(shareOf(page, REGION.heartLowerCleft, INK.card, 12)).toBeGreaterThan(0.9);
  });

  it("would fill that space if the window were a rectangle", async () => {
    const rectangular: PageTemplate = {
      ...HALF,
      layers: HALF.layers.map((l) =>
        l.kind === "photoSlot" ? { ...l, mask: { kind: "rect" as const } } : l,
      ),
    };
    const boxy = await render(rectangular);
    expect(shareOf(boxy, REGION.heartUpperCleft, INK.card, 12)).toBeLessThan(0.1);
    expect(shareOf(boxy, REGION.heartLowerCleft, INK.card, 12)).toBeLessThan(0.1);
  });
});

describe("the words", () => {
  it("puts ink on the card where each one goes", () => {
    expect(shareOf(page, REGION.wordTop, INK.wordTop, 30)).toBeGreaterThan(0.02);
    expect(shareOf(page, REGION.wordBottom, INK.wordBottom, 30)).toBeGreaterThan(0.03);
  });

  it("puts no ink there when the fill has no words", async () => {
    const wordless = await renderPrintPng(HALF, { ...FIXTURE_FILL, texts: {} });
    const blank = raster(wordless.png, HALF);
    expect(shareOf(blank, REGION.wordTop, INK.wordTop, 30)).toBeLessThan(0.002);
    expect(shareOf(blank, REGION.wordBottom, INK.wordBottom, 30)).toBeLessThan(0.002);
  });

  it("sets the two words in different faces", async () => {
    // One face registered for both would be invisible to every other assertion
    // here, and would be a real regression: the hand and the typewriter are the
    // page's whole typographic idea.
    const oneFace: PageTemplate = {
      ...HALF,
      layers: HALF.layers.map((l) =>
        l.kind === "textSlot" && l.slot === "wordTop" ? { ...l, font: "typewriter" } : l,
      ),
    };
    const swapped = await render(oneFace);
    // The same word in a different face covers a different amount of card.
    expect(shareOf(swapped, REGION.wordTop, INK.wordTop, 30)).not.toBeCloseTo(
      shareOf(page, REGION.wordTop, INK.wordTop, 30),
      3,
    );
  });
});

describe("the kiss", () => {
  it("is crimson, and is where the template puts it", () => {
    expect(shareOf(page, REGION.kiss, INK.kiss, 20)).toBeGreaterThan(0.2);
    expect(isColour(hexAt(page, 600, 180), INK.card, 10)).toBe(true);
  });

  it("is gone when the kiss layer is gone", async () => {
    const bare = await render(without(HALF, "kiss"));
    expect(shareOf(bare, REGION.kiss, INK.kiss, 20)).toBeLessThan(0.01);
  });
});
