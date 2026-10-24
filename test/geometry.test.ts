/**
 * The shapes, on their own.
 *
 * `geometry.ts` is where "a mask is a named kind, not a path in a file" is paid
 * for: it has to produce a correct outline at any size, because a template that
 * resizes a window must not get a shape that was right at the old one. These
 * assertions are about *that* property — scale invariance and the properties
 * that make a heart a heart — rather than about any particular path string,
 * which would pin the drawing and forbid ever improving it.
 */

import { describe, expect, it } from "vitest";
import {
  contains,
  heartPath,
  maskPath,
  rotatedBounds,
  roundedRectPath,
} from "../lib/template/geometry";
import type { Box } from "../lib/template/types";

/** Every coordinate pair in a path, so a shape can be asked where it goes. */
function points(d: string): Array<[number, number]> {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

const BOX: Box = { x: 100, y: 200, width: 240, height: 220 };

describe("the heart", () => {
  it("comes to a point at the bottom centre", () => {
    const pts = points(heartPath(BOX));
    const lowest = Math.max(...pts.map(([, y]) => y));
    expect(lowest).toBeCloseTo(BOX.y + BOX.height, 1);
    const tips = pts.filter(([, y]) => Math.abs(y - lowest) < 0.5);
    for (const [x] of tips) expect(x).toBeCloseTo(BOX.x + BOX.width / 2, 1);
  });

  it("dips between the lobes rather than running straight across the top", () => {
    // The difference between a heart and a shield. `cleft` is how far down the
    // dip sits, and the start of the path is the dip itself.
    const [[dipX, dipY]] = points(heartPath(BOX, 0.26));
    expect(dipX).toBeCloseTo(BOX.x + BOX.width / 2, 1);
    expect(dipY).toBeCloseTo(BOX.y + BOX.height * 0.26, 1);
  });

  it("moves the dip when asked, and nothing else", () => {
    const shallow = points(heartPath(BOX, 0.12));
    const deep = points(heartPath(BOX, 0.4));
    expect(deep[0][1]).toBeGreaterThan(shallow[0][1]);
    // The tip does not move with the cleft.
    expect(Math.max(...deep.map(([, y]) => y))).toBeCloseTo(
      Math.max(...shallow.map(([, y]) => y)),
      1,
    );
  });

  it("clamps a cleft that would turn it inside out", () => {
    const silly = points(heartPath(BOX, 5));
    expect(silly[0][1]).toBeLessThan(BOX.y + BOX.height);
  });

  it("is the same shape at any size", () => {
    const small = points(heartPath({ x: 0, y: 0, width: 100, height: 100 }));
    const large = points(heartPath({ x: 0, y: 0, width: 400, height: 400 }));
    expect(small).toHaveLength(large.length);
    for (const [i, [x, y]] of small.entries()) {
      expect(large[i][0] / 4).toBeCloseTo(x, 1);
      expect(large[i][1] / 4).toBeCloseTo(y, 1);
    }
  });

  it("is not the box it is cut from", () => {
    // The assertion that would catch a silent fallback to a rectangle.
    expect(maskPath({ kind: "heart" }, BOX)).not.toBe(maskPath({ kind: "rect" }, BOX));
  });
});

describe("the rounded rectangle", () => {
  it("is square-cornered with no radius", () => {
    expect(roundedRectPath(BOX)).not.toContain("A ");
  });

  it("cannot be rounded past a stadium", () => {
    const absurd = roundedRectPath({ x: 0, y: 0, width: 100, height: 40 }, 500);
    const radii = absurd.match(/A (\d+(\.\d+)?)/g)?.map((s) => Number(s.slice(2))) ?? [];
    expect(radii.length).toBeGreaterThan(0);
    for (const r of radii) expect(r).toBeLessThanOrEqual(20);
  });
});

describe("rotated bounds", () => {
  it("are the box itself when nothing is turned", () => {
    expect(rotatedBounds(BOX, 0)).toEqual(BOX);
  });

  it("grow when it is", () => {
    const turned = rotatedBounds(BOX, 30);
    expect(turned.width).toBeGreaterThan(BOX.width);
    expect(turned.height).toBeGreaterThan(BOX.height);
  });

  it("keep the centre where it was", () => {
    const turned = rotatedBounds(BOX, 37);
    expect(turned.x + turned.width / 2).toBeCloseTo(BOX.x + BOX.width / 2, 6);
    expect(turned.y + turned.height / 2).toBeCloseTo(BOX.y + BOX.height / 2, 6);
  });

  it("are a square's own box at a right angle, swapped", () => {
    const b = { x: 0, y: 0, width: 100, height: 40 };
    const turned = rotatedBounds(b, 90);
    expect(turned.width).toBeCloseTo(40, 6);
    expect(turned.height).toBeCloseTo(100, 6);
  });
});

describe("containment", () => {
  const outer: Box = { x: 0, y: 0, width: 100, height: 100 };
  it("accepts a box that touches the edge", () => {
    expect(contains(outer, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });
  it("refuses one that crosses it by a hair", () => {
    expect(contains(outer, { x: 0, y: 0, width: 100.001, height: 100 })).toBe(false);
    expect(contains(outer, { x: -0.001, y: 0, width: 100, height: 100 })).toBe(false);
  });
});
