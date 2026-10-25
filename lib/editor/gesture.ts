/**
 * **Screen pixels into the slot's own frame, which is where the trouble is.**
 *
 * Both hearts on this page are rotated — minus three and a half degrees, plus
 * three — and a photograph inside a rotated window is the one place a crop
 * editor quietly goes wrong. Drag a finger straight down on a heart tilted
 * three degrees and the photograph has to move straight down *the heart*, not
 * straight down the screen, or the picture creeps sideways as the customer pans
 * and the whole thing feels broken without anybody being able to say why.
 *
 * So this module is the two conversions between a pointer event and
 * `./view.ts`, and nothing else:
 *
 * - a drag, in screen pixels, into a displacement in the slot's own points;
 * - a pinch's midpoint, in screen pixels, into "where in this window are the
 *   fingers", 0–1, which is what `zoomedAbout` anchors to.
 *
 * Pure, so `test/editor-gesture.test.ts` can check them against the inverse
 * rotation rather than against a screenshot. `lib/render/svg.ts` applies a
 * layer's rotation as `rotate(θ cx cy)` about the centre of `frame`, and the
 * editor's overlay is a CSS `rotate(θdeg)` over the same box with the default
 * `transform-origin` of its centre — the same transform, so the inverse here is
 * the exact inverse of what the customer is looking at.
 */

import type { Box } from "../template/types";

/** Where the page is on screen, and how big it is drawn. */
export interface Stage {
  /** The square's top-left in client coordinates, from `getBoundingClientRect`. */
  left: number;
  top: number;
  /** Device pixels per page unit: the drawn width divided by `canvas.width`. */
  scale: number;
}

function rotateBy(dx: number, dy: number, degrees: number): { dx: number; dy: number } {
  if (!degrees) return { dx, dy };
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

/**
 * A drag in screen pixels, as a displacement in the slot's own points.
 *
 * Two steps, in this order. **Rotate by minus the layer's angle**, which undoes
 * the rotation the customer is looking at and leaves a vector along the slot's
 * own axes. Then **divide by the scale**, which turns device pixels into page
 * units, so the result means the same thing whether the page is drawn at 320
 * pixels on a phone or 900 on a desktop.
 *
 * The result goes straight to `panned`, which is written entirely in page
 * units and knows nothing about a screen.
 */
export function dragToSlot(
  dx: number,
  dy: number,
  rotationDegrees: number,
  scale: number,
): { dx: number; dy: number } {
  if (!(scale > 0) || !Number.isFinite(scale)) return { dx: 0, dy: 0 };
  const local = rotateBy(dx, dy, -rotationDegrees);
  return { dx: local.dx / scale, dy: local.dy / scale };
}

/**
 * Where a screen point sits inside a slot, 0–1 across and down **the slot**.
 *
 * Anchored to the slot's centre because that is the one point a rotation about
 * the centre does not move, so it can be worked out from the frame and the
 * stage without measuring the rotated element. Everything else follows: the
 * offset from that centre, rotated back into the slot's axes, divided by the
 * slot's drawn size.
 *
 * Not clamped. A pinch's midpoint can legitimately sit outside the window —
 * two fingers either side of a small heart — and `zoomedAbout` clamps what it
 * needs to. Clamping here would silently move the anchor a customer chose.
 */
export function pointToSlotFraction(
  point: { x: number; y: number },
  slot: Box,
  rotationDegrees: number,
  canvasWidth: number,
  stage: Stage,
): { x: number; y: number } {
  const k = stage.scale;
  if (!(k > 0) || !(slot.width > 0) || !(slot.height > 0) || !(canvasWidth > 0)) {
    return { x: 0.5, y: 0.5 };
  }
  const centreScreenX = stage.left + (slot.x + slot.width / 2) * k;
  const centreScreenY = stage.top + (slot.y + slot.height / 2) * k;
  const local = rotateBy(point.x - centreScreenX, point.y - centreScreenY, -rotationDegrees);
  return {
    x: 0.5 + local.dx / (slot.width * k),
    y: 0.5 + local.dy / (slot.height * k),
  };
}

/** The distance between two pointers, for the pinch ratio. */
export function spread(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The stage's metrics from its own element.
 *
 * Read at the moment a gesture starts rather than held in state: the page is a
 * square that resizes with the viewport, and a phone changes it when the
 * keyboard opens, the address bar collapses, or the device is turned. A cached
 * scale is a gesture that pans at the wrong speed for the rest of its life.
 */
export function stageOf(rect: { left: number; top: number; width: number }, canvasWidth: number): Stage {
  return {
    left: rect.left,
    top: rect.top,
    scale: canvasWidth > 0 ? rect.width / canvasWidth : 0,
  };
}
