/**
 * **The pan and zoom arithmetic, held to the renderer's own placement.**
 *
 * The assertion that matters here is not "the numbers look plausible" — it is
 * that a crop the editor produces, handed to `placePhoto`, lands the framed
 * rectangle **exactly** on the slot. That is the WYSIWYG guarantee stated as
 * arithmetic: `placePhoto` is the one function the screen and the print file
 * both go through, so a crop that satisfies this is drawn in the same place in
 * both pictures by construction.
 *
 * `test/editor-to-print.test.ts` then proves the same thing by reading pixels
 * out of a real 3150 px render, because an arithmetic identity and a rasterised
 * page are different kinds of evidence and the product needs both.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  MAX_ZOOM,
  baseCrop,
  cropFor,
  effectiveDpi,
  panned,
  sane,
  viewFor,
  zoomedAbout,
} from "../lib/editor/view";
import { placePhoto } from "../lib/template/geometry";
import { cropOf } from "../lib/template/defaults";
import { MY_FOREVER } from "../templates/my-forever";
import type { Box, PhotoSlotLayer } from "../lib/template/types";

const SLOTS = MY_FOREVER.layers.filter((l): l is PhotoSlotLayer => l.kind === "photoSlot");

/** Real slots from the real page, plus two extremes a phone photo can meet. */
const WINDOWS: Box[] = [
  ...SLOTS.map((s) => s.frame),
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 10, y: 20, width: 300, height: 60 },
];

/** A phone portrait, a phone landscape, a square, and a panorama. */
const PHOTOS = [
  { width: 3024, height: 4032 },
  { width: 4032, height: 3024 },
  { width: 1200, height: 1200 },
  { width: 4000, height: 900 },
];

describe("a crop the editor produces", () => {
  it("covers its window exactly, in the renderer's own placement", () => {
    // The whole point. If this holds, what the customer framed is what both
    // pictures draw, because both go through `placePhoto`.
    for (const slot of WINDOWS) {
      for (const natural of PHOTOS) {
        for (const zoom of [1, 1.3, 2, MAX_ZOOM]) {
          for (const [cx, cy] of [
            [0.5, 0.5],
            [0, 0],
            [1, 1],
            [0.2, 0.8],
          ]) {
            const crop = cropFor({ zoom, cx, cy }, slot, natural);
            const place = placePhoto(slot, natural, crop);

            const left = place.x + crop.x * place.width;
            const right = place.x + (crop.x + crop.width) * place.width;
            const top = place.y + crop.y * place.height;
            const bottom = place.y + (crop.y + crop.height) * place.height;

            const what = `${slot.width}x${slot.height} <- ${natural.width}x${natural.height} @${zoom} (${cx},${cy})`;
            expect(left, `left ${what}`).toBeCloseTo(slot.x, 6);
            expect(right, `right ${what}`).toBeCloseTo(slot.x + slot.width, 6);
            expect(top, `top ${what}`).toBeCloseTo(slot.y, 6);
            expect(bottom, `bottom ${what}`).toBeCloseTo(slot.y + slot.height, 6);
          }
        }
      }
    }
  });

  it("would notice a crop that did not match its window", () => {
    // The guard on the guard. `placePhoto` covers a mismatched crop by scaling
    // on the larger axis, so a crop of the wrong shape still fills the slot and
    // the test above would pass on "it drew something" if it only checked that.
    // A deliberately square crop in a non-square window must fail it.
    const slot = { x: 0, y: 0, width: 300, height: 100 };
    const natural = { width: 1000, height: 1000 };
    const square = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const place = placePhoto(slot, natural, square);
    const bottom = place.y + (square.y + square.height) * place.height;
    expect(bottom).not.toBeCloseTo(slot.y + slot.height, 6);
  });

  it("stays inside the photograph", () => {
    for (const slot of WINDOWS) {
      for (const natural of PHOTOS) {
        for (const zoom of [1, 1.7, MAX_ZOOM]) {
          for (const [cx, cy] of [
            [-5, -5],
            [9, 9],
            [0.5, 0.5],
          ]) {
            const crop = cropFor({ zoom, cx, cy }, slot, natural);
            expect(crop.x).toBeGreaterThanOrEqual(-1e-9);
            expect(crop.y).toBeGreaterThanOrEqual(-1e-9);
            expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-9);
            expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-9);
            expect(crop.width).toBeGreaterThan(0);
            expect(crop.height).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("survives the format's own tolerant reader unchanged", () => {
    // `cropOf` clamps and can replace a crop with the whole picture. A crop the
    // editor produced must pass through it untouched, or the page the customer
    // framed is not the page that prints.
    for (const slot of WINDOWS) {
      for (const natural of PHOTOS) {
        const crop = cropFor({ zoom: 2.2, cx: 0.33, cy: 0.71 }, slot, natural);
        expect(cropOf({ crop })).toEqual(crop);
      }
    }
  });

  it("is the whole picture at zoom 1, which is what an absent crop means", () => {
    for (const slot of WINDOWS) {
      for (const natural of PHOTOS) {
        const crop = cropFor(DEFAULT_VIEW, slot, natural);
        const base = baseCrop(slot, natural);
        // One axis is the entire photograph; the other is as much as the
        // window's shape allows. That is exactly `cover` and centred.
        expect(Math.max(base.width, base.height)).toBeCloseTo(1, 9);
        const placedDefault = placePhoto(slot, natural, crop);
        const placedAbsent = placePhoto(slot, natural, cropOf(undefined));
        expect(placedDefault.width).toBeCloseTo(placedAbsent.width, 6);
        expect(placedDefault.height).toBeCloseTo(placedAbsent.height, 6);
        expect(placedDefault.x).toBeCloseTo(placedAbsent.x, 6);
        expect(placedDefault.y).toBeCloseTo(placedAbsent.y, 6);
      }
    }
  });
});

describe("panning", () => {
  const slot = SLOTS[0].frame;
  const natural = { width: 3024, height: 4032 };
  const start = { zoom: 2, cx: 0.5, cy: 0.5 };

  it("moves the photograph the way the finger went, by the distance it went", () => {
    // Drag right by a quarter of the window's width: the picture must move
    // right by a quarter of the window, measured where the renderer puts it.
    const dx = slot.width / 4;
    const before = placePhoto(slot, natural, cropFor(start, slot, natural));
    const after = placePhoto(slot, natural, cropFor(panned(start, dx, 0, slot, natural), slot, natural));
    expect(after.x - before.x).toBeCloseTo(dx, 6);
    expect(after.y - before.y).toBeCloseTo(0, 6);
  });

  it("moves down when the finger goes down", () => {
    const dy = slot.height / 5;
    const before = placePhoto(slot, natural, cropFor(start, slot, natural));
    const after = placePhoto(slot, natural, cropFor(panned(start, 0, dy, slot, natural), slot, natural));
    expect(after.y - before.y).toBeCloseTo(dy, 6);
  });

  it("stops at the edge of the photograph rather than showing the card through it", () => {
    let view = start;
    for (let i = 0; i < 40; i++) view = panned(view, 500, 500, slot, natural);
    const crop = cropFor(view, slot, natural);
    expect(crop.x).toBeCloseTo(0, 9);
    expect(crop.y).toBeCloseTo(0, 9);
  });

  it("is reversible, so a customer can undo a drag with their finger", () => {
    const there = panned(start, 17, -23, slot, natural);
    const back = panned(there, -17, 23, slot, natural);
    expect(back.cx).toBeCloseTo(start.cx, 9);
    expect(back.cy).toBeCloseTo(start.cy, 9);
  });

  it("locks the axis that is already full, and frees the one that is not", () => {
    // At zoom 1 only the *tight* axis is spent. This slot is wider than it is
    // tall and the photograph is a phone portrait, so the crop is the full
    // width of the picture and only part of its height: sideways there is
    // nowhere to go, and up and down there is — which is precisely what a
    // portrait photograph in a landscape heart needs to be able to do.
    const centred = cropFor(DEFAULT_VIEW, slot, natural);
    expect(centred.width).toBeCloseTo(1, 9);
    expect(centred.height).toBeLessThan(1);

    const moved = cropFor(panned(DEFAULT_VIEW, 200, 60, slot, natural), slot, natural);
    expect(moved.x).toBeCloseTo(0, 9);
    expect(moved.width).toBeCloseTo(centred.width, 9);
    expect(moved.y).toBeLessThan(centred.y);
    expect(moved.y).toBeGreaterThanOrEqual(0);
  });

  it("cannot pan on either axis when the picture exactly fits the window", () => {
    // A photograph whose shape matches the window has no slack anywhere, and a
    // drag must move nothing rather than slide the card into view.
    const square = { x: 0, y: 0, width: 200, height: 200 };
    const alsoSquare = { width: 1500, height: 1500 };
    const before = cropFor(DEFAULT_VIEW, square, alsoSquare);
    const after = cropFor(panned(DEFAULT_VIEW, 300, -300, square, alsoSquare), square, alsoSquare);
    expect(before).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(after).toEqual(before);
  });
});

describe("zooming", () => {
  const slot = SLOTS[1].frame;
  const natural = { width: 4032, height: 3024 };

  it("keeps the point under the fingers under the fingers", () => {
    const view = { zoom: 1.2, cx: 0.5, cy: 0.5 };
    const focus = { x: 0.25, y: 0.75 };
    const before = cropFor(view, slot, natural);
    const anchor = {
      x: before.x + focus.x * before.width,
      y: before.y + focus.y * before.height,
    };
    const after = cropFor(zoomedAbout(view, 1.6, focus, slot, natural), slot, natural);
    expect(after.x + focus.x * after.width).toBeCloseTo(anchor.x, 6);
    expect(after.y + focus.y * after.height).toBeCloseTo(anchor.y, 6);
  });

  it("would notice zooming about the centre instead", () => {
    // The paired negative: zooming about the window's centre leaves the point
    // under the fingers somewhere else, which is the pinch that feels broken.
    const view = { zoom: 1.2, cx: 0.5, cy: 0.5 };
    const focus = { x: 0.1, y: 0.9 };
    const before = cropFor(view, slot, natural);
    const anchor = before.x + focus.x * before.width;
    const centred = cropFor({ ...view, zoom: 1.2 * 1.6 }, slot, natural);
    expect(centred.x + focus.x * centred.width).not.toBeCloseTo(anchor, 4);
  });

  it("will not go further out than the whole photograph", () => {
    const out = zoomedAbout({ zoom: 1, cx: 0.5, cy: 0.5 }, 0.1, { x: 0.5, y: 0.5 }, slot, natural);
    expect(out.zoom).toBe(1);
  });

  it("will not go further in than the resolution allows", () => {
    const inn = zoomedAbout({ zoom: MAX_ZOOM, cx: 0.5, cy: 0.5 }, 9, { x: 0.5, y: 0.5 }, slot, natural);
    expect(inn.zoom).toBe(MAX_ZOOM);
  });
});

describe("reading a view back out of a stored crop", () => {
  it("round-trips every view the editor can produce", () => {
    // A `PageFill` is the document of record and carries only the crop, so
    // restoring a draft has to put the customer's fingers back where they were.
    for (const slot of WINDOWS) {
      for (const natural of PHOTOS) {
        for (const zoom of [1, 1.45, 2, MAX_ZOOM]) {
          for (const [cx, cy] of [
            [0.5, 0.5],
            [0.18, 0.82],
            [0.95, 0.05],
          ]) {
            const wanted = cropFor({ zoom, cx, cy }, slot, natural);
            const back = viewFor(wanted, slot, natural);
            expect(cropFor(back, slot, natural).x).toBeCloseTo(wanted.x, 6);
            expect(cropFor(back, slot, natural).y).toBeCloseTo(wanted.y, 6);
            expect(cropFor(back, slot, natural).width).toBeCloseTo(wanted.width, 6);
            expect(cropFor(back, slot, natural).height).toBeCloseTo(wanted.height, 6);
          }
        }
      }
    }
  });

  it("reads an absent crop as the whole picture", () => {
    expect(viewFor(undefined, WINDOWS[0], PHOTOS[0])).toEqual(DEFAULT_VIEW);
  });

  it("recovers a usable view from a crop the editor never made", () => {
    // A hand-edited fill, or one from another tool. It must come back as
    // something a finger can move, not as NaN.
    const view = viewFor({ x: 0.1, y: 0.1, width: 0.3, height: 0.9 }, WINDOWS[0], PHOTOS[0]);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(view.zoom).toBeGreaterThanOrEqual(1);
    expect(view.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });
});

describe("a view read from anywhere at all", () => {
  it("is forced into range rather than trusted", () => {
    expect(sane(undefined)).toEqual(DEFAULT_VIEW);
    expect(sane({ zoom: NaN, cx: NaN, cy: NaN })).toEqual(DEFAULT_VIEW);
    expect(sane({ zoom: 0, cx: -4, cy: 7 })).toEqual({ zoom: 1, cx: 0, cy: 1 });
    expect(sane({ zoom: Infinity, cx: 0.4, cy: 0.4 })).toEqual({ zoom: 1, cx: 0.4, cy: 0.4 });
    expect(sane({ zoom: 99 }).zoom).toBe(MAX_ZOOM);
    expect(sane({ zoom: "2" } as unknown as { zoom: number }).zoom).toBe(1);
  });

  it("never divides by a photograph with no pixels", () => {
    const slot = WINDOWS[0];
    for (const natural of [
      { width: 0, height: 0 },
      { width: 100, height: 0 },
      { width: NaN, height: NaN },
    ]) {
      const crop = cropFor({ zoom: 2, cx: 0.3, cy: 0.3 }, slot, natural);
      expect(Number.isFinite(crop.x)).toBe(true);
      expect(Number.isFinite(crop.width)).toBe(true);
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeGreaterThan(0);
    }
  });

  it("never divides by a window with no area", () => {
    for (const slot of [
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: 100, height: 0 },
      { x: 0, y: 0, width: NaN, height: 10 },
    ]) {
      const crop = cropFor({ zoom: 2, cx: 0.5, cy: 0.5 }, slot, PHOTOS[0]);
      // Degenerate in, sane out: a finite crop with area, centred. The zoom is
      // still honoured because there is no window shape to honour instead.
      expect(Number.isFinite(crop.x) && Number.isFinite(crop.width)).toBe(true);
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeGreaterThan(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-9);
    }
    // And panning a window with no area is a no-op rather than a NaN.
    const flat = { x: 0, y: 0, width: 0, height: 0 };
    expect(panned({ zoom: 2, cx: 0.5, cy: 0.5 }, 10, 10, flat, PHOTOS[0])).toEqual({
      zoom: 2,
      cx: 0.5,
      cy: 0.5,
    });
  });
});

describe("the resolution the customer actually has", () => {
  const slot = SLOTS[1].frame;

  it("is the arithmetic, not a reassuring badge", () => {
    // 248 pt is 3.444 inches. A crop spanning 2067 source pixels across it is
    // 600 DPI, and the function must say 600 rather than something rounder.
    const natural = { width: 2067, height: 2067 };
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    const across = 2067 / (slot.width / 72);
    expect(effectiveDpi(crop, slot, natural)).toBeCloseTo(Math.min(across, 2067 / (slot.height / 72)), 6);
  });

  it("falls as the customer zooms in, because zooming spends pixels", () => {
    const natural = { width: 2400, height: 1800 };
    const out = effectiveDpi(cropFor({ zoom: 1, cx: 0.5, cy: 0.5 }, slot, natural), slot, natural);
    const inn = effectiveDpi(cropFor({ zoom: MAX_ZOOM, cx: 0.5, cy: 0.5 }, slot, natural), slot, natural);
    expect(inn).toBeCloseTo(out / MAX_ZOOM, 6);
    expect(inn).toBeLessThan(out);
  });

  it("reports the poorer axis, not the flattering one", () => {
    // A panorama has plenty of width and little height. Averaging, or taking
    // the better axis, would promise a sharpness the short axis cannot deliver.
    const natural = { width: 6000, height: 600 };
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    const dpi = effectiveDpi(crop, slot, natural);
    expect(dpi).toBeCloseTo(600 / (slot.height / 72), 6);
    expect(dpi).toBeLessThan(6000 / (slot.width / 72));
  });

  it("is zero rather than infinite for a window with no area", () => {
    expect(effectiveDpi({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 0 }, PHOTOS[0])).toBe(0);
  });
});
