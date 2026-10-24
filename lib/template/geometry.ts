/**
 * Where every shape in the format is actually a shape.
 *
 * One module, pure functions, no rendering. A mask is named in a template and
 * its geometry lives here, so the on-screen page and the print file are cut to
 * the same outline by construction rather than by two people agreeing. This is
 * `photoSilhouette`'s job in Keepnook and it is kept separate for the same
 * reason: the moment a path string appears in a template it is a picture of a
 * shape at one size, and the first resize makes it wrong.
 */

import type { Box, Crop, Mask, Pt } from "./types";

/** Rounded to a sane number of decimals so SVG output is stable and small. */
export function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function centreOf(b: Box): { cx: number; cy: number } {
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * The axis-aligned box a rotated frame actually occupies.
 *
 * The taped card and both hearts sit at an angle, so "is this inside the safe
 * area" is a question about the rotated corners and not about `frame`. Checking
 * the unrotated box would pass a slot whose corner pokes past the trim, which
 * is precisely the failure the safe area exists to catch.
 */
export function rotatedBounds(b: Box, degrees: number): Box {
  if (!degrees) return b;
  const { cx, cy } = centreOf(b);
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const corners: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    xs.push(cx + dx * cos - dy * sin);
    ys.push(cy + dx * sin + dy * cos);
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * The heart.
 *
 * Two lobes and a point, built from cubics against the box rather than copied
 * from anywhere: `cleft` is how far down the box the dip between the lobes
 * sits, the shoulders are placed a fixed fraction out from the centre, and the
 * tip lands on the bottom edge at the horizontal centre. Changing `cleft` gives
 * a rounder or a sharper heart and nothing else moves, which is the property a
 * declared shape is supposed to have.
 */
export function heartPath(b: Box, cleft = 0.26): string {
  const { x, y, width: w, height: h } = b;
  const cx = x + w / 2;
  const k = Math.min(Math.max(cleft, 0.05), 0.6);
  const dip = y + h * k;
  const tip = y + h;
  // The lobes' tops, and how far the control points reach past the box edge.
  const lobeTop = y + h * (k * 0.22);
  const outerX = w * 0.56;
  const shoulderY = y + h * 0.42;

  return [
    `M ${r(cx)} ${r(dip)}`,
    // Left lobe: up over the top, out to the left shoulder.
    `C ${r(cx - w * 0.14)} ${r(lobeTop)} ${r(cx - outerX)} ${r(y + h * 0.02)} ${r(cx - w * 0.5)} ${r(shoulderY)}`,
    // Left flank down to the tip.
    `C ${r(cx - w * 0.5)} ${r(y + h * 0.66)} ${r(cx - w * 0.2)} ${r(y + h * 0.82)} ${r(cx)} ${r(tip)}`,
    // Right flank back up to the right shoulder.
    `C ${r(cx + w * 0.2)} ${r(y + h * 0.82)} ${r(cx + w * 0.5)} ${r(y + h * 0.66)} ${r(cx + w * 0.5)} ${r(shoulderY)}`,
    // Right lobe back to the dip.
    `C ${r(cx + outerX)} ${r(y + h * 0.02)} ${r(cx + w * 0.14)} ${r(lobeTop)} ${r(cx)} ${r(dip)}`,
    "Z",
  ].join(" ");
}

export function roundedRectPath(b: Box, radius: Pt = 0): string {
  const rr = Math.min(Math.max(radius, 0), Math.min(b.width, b.height) / 2);
  const { x, y, width: w, height: h } = b;
  if (rr <= 0) {
    return `M ${r(x)} ${r(y)} H ${r(x + w)} V ${r(y + h)} H ${r(x)} Z`;
  }
  return [
    `M ${r(x + rr)} ${r(y)}`,
    `H ${r(x + w - rr)}`,
    `A ${r(rr)} ${r(rr)} 0 0 1 ${r(x + w)} ${r(y + rr)}`,
    `V ${r(y + h - rr)}`,
    `A ${r(rr)} ${r(rr)} 0 0 1 ${r(x + w - rr)} ${r(y + h)}`,
    `H ${r(x + rr)}`,
    `A ${r(rr)} ${r(rr)} 0 0 1 ${r(x)} ${r(y + h - rr)}`,
    `V ${r(y + rr)}`,
    `A ${r(rr)} ${r(rr)} 0 0 1 ${r(x + rr)} ${r(y)}`,
    "Z",
  ].join(" ");
}

export function ellipsePath(b: Box): string {
  const { cx, cy } = centreOf(b);
  const rx = b.width / 2;
  const ry = b.height / 2;
  return [
    `M ${r(cx - rx)} ${r(cy)}`,
    `A ${r(rx)} ${r(ry)} 0 0 1 ${r(cx + rx)} ${r(cy)}`,
    `A ${r(rx)} ${r(ry)} 0 0 1 ${r(cx - rx)} ${r(cy)}`,
    "Z",
  ].join(" ");
}

/** The single entry point. Every clip in the renderer comes through here. */
export function maskPath(mask: Mask, b: Box): string {
  switch (mask.kind) {
    case "heart":
      return heartPath(b, mask.cleft);
    case "ellipse":
      return ellipsePath(b);
    case "rect":
    default:
      return roundedRectPath(b, (mask as { radius?: Pt }).radius ?? 0);
  }
}

/**
 * Where to draw a photograph so that `crop` lands exactly on `slot`.
 *
 * The scale is `max` of the two axes rather than either one alone, so a crop
 * whose proportions disagree with its window — which a hand-edited fill or a
 * future editor's rounding can produce — is **covered and centred** rather than
 * stretched. A squashed face is a defect anybody can see in a printed book; a
 * couple of cropped pixels is not.
 */
export function placePhoto(
  slot: Box,
  natural: { width: number; height: number },
  crop: Crop,
): Box {
  const cw = Math.max(crop.width, 1e-6) * natural.width;
  const ch = Math.max(crop.height, 1e-6) * natural.height;
  const scale = Math.max(slot.width / cw, slot.height / ch);
  const drawW = natural.width * scale;
  const drawH = natural.height * scale;
  const cropCx = (crop.x + crop.width / 2) * natural.width * scale;
  const cropCy = (crop.y + crop.height / 2) * natural.height * scale;
  return {
    x: slot.x + slot.width / 2 - cropCx,
    y: slot.y + slot.height / 2 - cropCy,
    width: drawW,
    height: drawH,
  };
}
