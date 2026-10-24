/**
 * The customer's pan and zoom.
 *
 * `crop` is the one piece of a fill with arithmetic behind it, and the
 * arithmetic is invisible: a renderer that dropped the field entirely would
 * still produce a page with two photographs in two hearts, right way up, right
 * colours. Only the byte-identity check noticed when the field was deliberately
 * ignored, and a byte-identity check tells you *that* something changed and
 * never *what* — so this file says what.
 *
 * Both halves are here on purpose: `placePhoto` is pure and can be asserted to
 * the pixel, and the render is what proves `placePhoto` is the function the
 * page is actually drawn by.
 */

import { describe, expect, it } from "vitest";
import { placePhoto } from "../lib/template/geometry";
import { cropOf } from "../lib/template/defaults";
import { renderPrintPng } from "../lib/render/raster";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { distance, hexAt, raster } from "./pixels";
import type { PageTemplate } from "../lib/template/types";

const SLOT = { x: 0, y: 0, width: 200, height: 100 };
const FULL = { x: 0, y: 0, width: 1, height: 1 };

describe("placing a photograph", () => {
  it("covers the slot and centres it when the whole picture is used", () => {
    // A 400 x 400 source into a 200 x 100 slot: scaled to 200 wide, 200 tall,
    // overhanging 50 above and below.
    const place = placePhoto(SLOT, { width: 400, height: 400 }, FULL);
    expect(place).toEqual({ x: 0, y: -50, width: 200, height: 200 });
  });

  it("maps the cropped rectangle onto the slot", () => {
    // The middle half of a 400 x 200 source: a 200 x 100 rectangle, which is
    // the slot exactly, so the drawing is the source at 1:1 shifted by the crop.
    const place = placePhoto(SLOT, { width: 400, height: 200 }, {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });
    expect(place).toEqual({ x: -100, y: -50, width: 400, height: 200 });
  });

  it("zooms in rather than out as the crop shrinks", () => {
    const wide = placePhoto(SLOT, { width: 400, height: 200 }, FULL);
    const tight = placePhoto(SLOT, { width: 400, height: 200 }, {
      x: 0.3,
      y: 0.3,
      width: 0.4,
      height: 0.4,
    });
    expect(tight.width).toBeGreaterThan(wide.width);
  });

  it("covers rather than distorts when the crop's shape disagrees with the slot", () => {
    // A hand-edited fill, or an editor's rounding, can ask for a square window
    // on a 2:1 slot. The result must still fill the slot and still be in
    // proportion — a squashed face is a defect a customer can see.
    const place = placePhoto(SLOT, { width: 400, height: 400 }, {
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
    expect(place.width / place.height).toBeCloseTo(1, 6);
    expect(place.width).toBeGreaterThanOrEqual(SLOT.width);
    expect(place.height).toBeGreaterThanOrEqual(SLOT.height);
  });

  it("refuses to divide by a crop with no area", () => {
    const place = placePhoto(SLOT, { width: 400, height: 400 }, cropOf({ crop: { x: 0, y: 0, width: 0, height: 0 } }));
    expect(Number.isFinite(place.width)).toBe(true);
    expect(place.width).toBeGreaterThan(0);
  });
});

describe("the crop reaches the page", () => {
  const HALF: PageTemplate = {
    ...MY_FOREVER,
    print: { ...MY_FOREVER.print, pixels: { width: 1575, height: 1575 } },
  };

  it("shows something different through the heart when the crop moves", async () => {
    const asFilled = raster((await renderPrintPng(HALF, FIXTURE_FILL)).png, HALF);
    const uncropped = raster(
      (
        await renderPrintPng(HALF, {
          ...FIXTURE_FILL,
          photos: {
            ...FIXTURE_FILL.photos,
            photoTop: { asset: FIXTURE_FILL.photos.photoTop.asset },
          },
        })
      ).png,
      HALF,
    );

    // Four points across the upper heart. The two renders must disagree
    // somewhere: a renderer that ignored `crop` would agree everywhere.
    const probes: Array<[number, number]> = [
      [220, 220],
      [258, 260],
      [300, 240],
      [258, 310],
    ];
    const moved = probes.filter(
      ([x, y]) => distance(hexAt(asFilled, x, y), hexAt(uncropped, x, y)) > 10,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it("leaves the lower heart alone when only the upper crop changed", async () => {
    const a = raster((await renderPrintPng(HALF, FIXTURE_FILL)).png, HALF);
    const b = raster(
      (
        await renderPrintPng(HALF, {
          ...FIXTURE_FILL,
          photos: {
            ...FIXTURE_FILL.photos,
            photoTop: { asset: FIXTURE_FILL.photos.photoTop.asset },
          },
        })
      ).png,
      HALF,
    );
    expect(distance(hexAt(a, 346, 470), hexAt(b, 346, 470))).toBeLessThan(3);
  });
});
