/**
 * **Screen pixels into a rotated slot's own frame.**
 *
 * Both hearts on this page sit at an angle, and a photograph inside a rotated
 * window is where a crop editor quietly goes wrong: drag straight down on a
 * heart tilted three degrees and the picture has to move straight down *the
 * heart*. Get the sign or the order wrong and the picture creeps sideways as
 * the customer pans — broken in a way nobody can describe.
 *
 * So the conversions are checked against the rotation they are meant to
 * invert, at the angles this page actually uses, rather than against a
 * remembered formula. Every claim is paired with the rotated case that must
 * differ from the unrotated one, because a `rotateBy` that silently did
 * nothing would satisfy a test written only at zero degrees.
 */

import { describe, expect, it } from "vitest";
import { dragToSlot, midpoint, pointToSlotFraction, spread, stageOf } from "../lib/editor/gesture";
import { MY_FOREVER } from "../templates/my-forever";
import type { PhotoSlotLayer } from "../lib/template/types";

const SLOTS = MY_FOREVER.layers.filter((l): l is PhotoSlotLayer => l.kind === "photoSlot");
const UPPER = SLOTS.find((l) => l.id === "heart-upper")!;
const CANVAS = MY_FOREVER.canvas.width;

/** A 390-point phone showing the square at 358 pixels, which is the real target. */
const PHONE = stageOf({ left: 16, top: 220, width: 358 }, CANVAS);

/** Turn a vector clockwise, which is what the SVG and the CSS transform both do. */
function forward(dx: number, dy: number, degrees: number) {
  const t = (degrees * Math.PI) / 180;
  return { dx: dx * Math.cos(t) - dy * Math.sin(t), dy: dx * Math.sin(t) + dy * Math.cos(t) };
}

describe("a drag, in the slot's own points", () => {
  it("divides by the scale, so the page pans the same at any size", () => {
    const small = stageOf({ left: 0, top: 0, width: 300 }, CANVAS);
    const large = stageOf({ left: 0, top: 0, width: 900 }, CANVAS);
    // Thirty pixels on a 300-pixel square is a tenth of the page, and so is
    // ninety on a 900-pixel one. Both are 75.6 points.
    expect(dragToSlot(30, 0, 0, small.scale).dx).toBeCloseTo(CANVAS / 10, 6);
    expect(dragToSlot(90, 0, 0, large.scale).dx).toBeCloseTo(CANVAS / 10, 6);
  });

  it("undoes the layer's rotation exactly", () => {
    for (const degrees of [UPPER.rotation ?? 0, 3, -14, 90, 180]) {
      // Take a vector in the slot's frame, rotate it the way the browser
      // draws it, and the conversion must give the original back.
      const local = { dx: 11, dy: -4 };
      const onScreen = forward(local.dx, local.dy, degrees);
      const back = dragToSlot(onScreen.dx * PHONE.scale, onScreen.dy * PHONE.scale, degrees, PHONE.scale);
      expect(back.dx, `${degrees}deg dx`).toBeCloseTo(local.dx, 6);
      expect(back.dy, `${degrees}deg dy`).toBeCloseTo(local.dy, 6);
    }
  });

  it("actually rotates, rather than passing the vector through", () => {
    // The paired negative. At the page's real angle a straight-down drag has
    // a sideways component in the slot's frame, and a conversion that skipped
    // the rotation would report zero.
    const straightDown = dragToSlot(0, 40, UPPER.rotation ?? 0, PHONE.scale);
    expect(UPPER.rotation).not.toBe(0);
    expect(Math.abs(straightDown.dx)).toBeGreaterThan(0.5);
    expect(dragToSlot(0, 40, 0, PHONE.scale).dx).toBeCloseTo(0, 9);
  });

  it("turns the right way", () => {
    // A quarter turn clockwise sends screen-right to slot-down's opposite:
    // pinning the direction, not only that something moved.
    const got = dragToSlot(10, 0, 90, 1);
    expect(got.dx).toBeCloseTo(0, 6);
    expect(got.dy).toBeCloseTo(-10, 6);
  });

  it("is zero rather than infinite when the page has no size", () => {
    for (const scale of [0, -1, NaN, Infinity]) {
      expect(dragToSlot(10, 10, 3, scale)).toEqual({ dx: 0, dy: 0 });
    }
  });
});

describe("where the fingers are inside a slot", () => {
  it("reads the centre of the slot as the centre", () => {
    for (const layer of SLOTS) {
      const centre = {
        x: PHONE.left + (layer.frame.x + layer.frame.width / 2) * PHONE.scale,
        y: PHONE.top + (layer.frame.y + layer.frame.height / 2) * PHONE.scale,
      };
      const got = pointToSlotFraction(centre, layer.frame, layer.rotation ?? 0, CANVAS, PHONE);
      expect(got.x, layer.id).toBeCloseTo(0.5, 9);
      expect(got.y, layer.id).toBeCloseTo(0.5, 9);
    }
  });

  it("reads each corner of a rotated slot as that corner", () => {
    const layer = UPPER;
    const degrees = layer.rotation ?? 0;
    const cx = layer.frame.x + layer.frame.width / 2;
    const cy = layer.frame.y + layer.frame.height / 2;

    for (const [fx, fy] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.25, 0.8],
    ]) {
      // The corner in the slot's own frame, turned the way it is drawn, then
      // placed on the screen — the journey a real fingertip makes.
      const localX = (fx - 0.5) * layer.frame.width;
      const localY = (fy - 0.5) * layer.frame.height;
      const turned = forward(localX, localY, degrees);
      const screen = {
        x: PHONE.left + (cx + turned.dx) * PHONE.scale,
        y: PHONE.top + (cy + turned.dy) * PHONE.scale,
      };
      const got = pointToSlotFraction(screen, layer.frame, degrees, CANVAS, PHONE);
      expect(got.x, `(${fx},${fy}) x`).toBeCloseTo(fx, 6);
      expect(got.y, `(${fy},${fy}) y`).toBeCloseTo(fy, 6);
    }
  });

  it("would differ if the rotation were ignored", () => {
    // Otherwise the corner test above could pass against a function that never
    // rotated anything, since the page's angles are small.
    const layer = UPPER;
    const corner = {
      x: PHONE.left + layer.frame.x * PHONE.scale,
      y: PHONE.top + layer.frame.y * PHONE.scale,
    };
    const rotated = pointToSlotFraction(corner, layer.frame, layer.rotation ?? 0, CANVAS, PHONE);
    const flat = pointToSlotFraction(corner, layer.frame, 0, CANVAS, PHONE);
    expect(rotated.x).not.toBeCloseTo(flat.x, 3);
  });

  it("is not clamped, because two fingers can straddle a small heart", () => {
    const layer = SLOTS[0];
    const farOff = { x: PHONE.left - 500, y: PHONE.top - 500 };
    const got = pointToSlotFraction(farOff, layer.frame, layer.rotation ?? 0, CANVAS, PHONE);
    expect(got.x).toBeLessThan(0);
    expect(got.y).toBeLessThan(0);
  });

  it("is the middle of the window when there is nothing to measure", () => {
    const dead = stageOf({ left: 0, top: 0, width: 0 }, CANVAS);
    expect(pointToSlotFraction({ x: 5, y: 5 }, SLOTS[0].frame, 0, CANVAS, dead)).toEqual({ x: 0.5, y: 0.5 });
    expect(
      pointToSlotFraction({ x: 5, y: 5 }, { x: 0, y: 0, width: 0, height: 0 }, 0, CANVAS, PHONE),
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("the two-finger arithmetic", () => {
  it("measures the spread and the midpoint", () => {
    expect(spread({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 10 }, { x: 4, y: 0 })).toEqual({ x: 2, y: 5 });
  });

  it("reads the stage as pixels per page unit", () => {
    const stage = stageOf({ left: 16, top: 9, width: 378 }, 756);
    expect(stage).toEqual({ left: 16, top: 9, scale: 0.5 });
  });

  it("is zero rather than infinite for a page with no width", () => {
    expect(stageOf({ left: 0, top: 0, width: 300 }, 0).scale).toBe(0);
  });
});
