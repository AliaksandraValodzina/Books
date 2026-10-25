/**
 * **Pan and zoom, as arithmetic — the editor's only geometry.**
 *
 * A phone photograph is never the right crop. A customer who cannot move their
 * own face into the heart leaves, so the editor has to offer pan and zoom; and
 * the moment it does, "does the thing I dragged into place end up there in the
 * print file" becomes the question the whole product rests on.
 *
 * It is answered by *not having a second opinion*. The editor does not place
 * photographs. It converts a gesture into the `Crop` the format already
 * defines, and `placePhoto` in `lib/template/geometry.ts` — the one function
 * the screen and the print file both go through — does the placing. So there is
 * no editor-side layout to drift from the renderer's, because there is no
 * editor-side layout. `test/editor-to-print.test.ts` renders a panned fill at
 * 3150 px and reads the pixels back to prove it.
 *
 * **A view is three numbers, and a crop is derived from them.** Storing the
 * crop as the thing a gesture edits would be storing a derived fact: a pinch
 * has to change the crop's *size about its centre*, which from four corner
 * numbers is a calculation that drifts, and zooming out then in would not come
 * back to where it started. Keepnook's own note on declared-versus-derived is
 * the same argument.
 *
 * `Crop` is in source coordinates — a fraction of the photograph's own width
 * and height — which `docs/template-format.md` explains at length is what a
 * *published* template needs: enlarging a heart later must not silently
 * re-crop a thousand customers' photographs.
 */

import type { Box, Crop } from "../template/types";

/**
 * Where the customer has moved the photograph to.
 *
 * `zoom` is 1 when the picture is as far out as it goes — the whole photograph
 * cover-fitted to the window, exactly what an absent `Crop` means — and larger
 * as they pinch in. `cx`/`cy` are the point of the *source photograph* sitting
 * at the centre of the window, 0–1.
 */
export interface PhotoView {
  zoom: number;
  cx: number;
  cy: number;
}

/** What a photograph lands as: all of it, centred. The same picture a fill with no crop draws. */
export const DEFAULT_VIEW: PhotoView = { zoom: 1, cx: 0.5, cy: 0.5 };

/**
 * How far in a customer may pinch.
 *
 * Not a feel decision — a resolution one. A photograph is resized in the
 * browser before it is stored (see `./photo.ts`), so there is a finite number
 * of source pixels and zooming in spends them. At this ceiling the worst case
 * still lands near 240 DPI in a 3.4-inch heart; the editor shows the real
 * figure rather than hiding behind this constant, because a customer who zooms
 * a long way into a small photograph has a right to know before they pay.
 */
export const MAX_ZOOM = 2.5;

/** What `print.md` and the trade both call enough. Below it the editor says so. */
export const DPI_TARGET = 300;

function finite(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A view with every field forced into range. An out-of-range view is a defined state, not a bug. */
export function sane(view: Partial<PhotoView> | undefined): PhotoView {
  return {
    zoom: clamp(finite(view?.zoom, 1), 1, MAX_ZOOM),
    cx: clamp(finite(view?.cx, 0.5), 0, 1),
    cy: clamp(finite(view?.cy, 0.5), 0, 1),
  };
}

export interface Natural {
  width: number;
  height: number;
}

/**
 * The largest crop whose **displayed** shape matches the window, at zoom 1.
 *
 * This is the hinge of the whole module. `placePhoto` scales a crop by the
 * *larger* of the two axes and centres it, so a crop whose proportions disagree
 * with its window is covered — correct, and deliberately so, but it means part
 * of the crop a customer positioned would be outside the window. Produce crops
 * that already match the window's shape and that never happens: what the
 * customer frames is exactly what is drawn, on screen and at 3150 px.
 *
 * A degenerate photograph — zero pixels either way, which a hand-edited fill or
 * a failed decode can produce — gives the whole square rather than a division
 * by zero.
 */
export function baseCrop(slot: Box, natural: Natural): { width: number; height: number } {
  const nw = finite(natural.width, 0);
  const nh = finite(natural.height, 0);
  const sw = finite(slot.width, 0);
  const sh = finite(slot.height, 0);
  if (!(nw > 0 && nh > 0 && sw > 0 && sh > 0)) return { width: 1, height: 1 };

  const window = sw / sh;
  const photo = nw / nh;
  return photo >= window
    ? { width: clamp(window / photo, 0, 1), height: 1 }
    : { width: 1, height: clamp(photo / window, 0, 1) };
}

/**
 * A view whose centre is inside the range that actually does something.
 *
 * **This is not the same clamp as `sane`, and the difference is a bug a
 * customer would feel.** `sane` keeps the centre inside the photograph, 0–1.
 * This keeps it inside the narrower range where the window is still full of
 * photograph — which depends on the zoom, and therefore on the slot.
 *
 * Without it a view *stores* travel that has no effect. Drag a long way past
 * the edge and `cx` keeps counting down while `cropFor` clamps it back for
 * drawing, so nothing moves; then drag the other way and nothing moves again
 * until the dead distance has been paid back. On a phone that is the gesture
 * sticking for no visible reason, which reads as a broken site rather than as
 * an edge.
 *
 * So every function that *writes* a view ends here, and `cropFor` can then
 * clamp defensively for the views it did not write — a stored draft, a
 * hand-edited file — without that clamp ever being load-bearing.
 */
export function clampCentre(
  view: Partial<PhotoView> | undefined,
  slot: Box,
  natural: Natural,
): PhotoView {
  const v = sane(view);
  const base = baseCrop(slot, natural);
  const width = base.width / v.zoom;
  const height = base.height / v.zoom;
  return {
    zoom: v.zoom,
    cx: clamp(v.cx, width / 2, 1 - width / 2),
    cy: clamp(v.cy, height / 2, 1 - height / 2),
  };
}

/**
 * The `Crop` a view means.
 *
 * The centre is clamped so the window is always full of photograph: a crop that
 * ran off the edge of the picture would show the card through it, which reads
 * as a bug rather than as a pan. Because the crop is never wider than the
 * source, the clamp's range is never empty.
 */
export function cropFor(view: Partial<PhotoView> | undefined, slot: Box, natural: Natural): Crop {
  const v = clampCentre(view, slot, natural);
  const base = baseCrop(slot, natural);
  const width = base.width / v.zoom;
  const height = base.height / v.zoom;
  return { x: v.cx - width / 2, y: v.cy - height / 2, width, height };
}

/**
 * The view a stored `Crop` came from.
 *
 * Needed because a `PageFill` is the document of record and carries only the
 * crop. A draft restored from a file written by an older build, or handed over
 * from somewhere else entirely, still has to put the customer's fingers back
 * where they left them.
 */
export function viewFor(crop: Crop | undefined, slot: Box, natural: Natural): PhotoView {
  if (!crop) return DEFAULT_VIEW;
  const base = baseCrop(slot, natural);
  const w = finite(crop.width, base.width);
  const h = finite(crop.height, base.height);
  // The larger of the two ratios, for the same reason `placePhoto` takes the
  // larger: it is the one that keeps the window covered.
  const zoom = Math.max(w > 0 ? base.width / w : 1, h > 0 ? base.height / h : 1);
  return clampCentre(
    {
      zoom,
      cx: finite(crop.x, 0) + w / 2,
      cy: finite(crop.y, 0) + h / 2,
    },
    slot,
    natural,
  );
}

/**
 * Drag the photograph by a displacement **in the slot's own points**.
 *
 * The caller has already rotated the screen gesture into the slot's frame and
 * divided by the display scale, so this is pure arithmetic in page units: one
 * unit of crop width spans `slot.width` points of window, so a point of drag is
 * `crop.width / slot.width` of the source. The sign is negative because
 * dragging the picture right shows a part further *left* of it.
 */
export function panned(
  view: Partial<PhotoView> | undefined,
  dx: number,
  dy: number,
  slot: Box,
  natural: Natural,
): PhotoView {
  const v = clampCentre(view, slot, natural);
  const crop = cropFor(v, slot, natural);
  const sw = finite(slot.width, 0);
  const sh = finite(slot.height, 0);
  if (!(sw > 0 && sh > 0)) return v;
  // Clamped on the way out, not merely on the way to a crop: see `clampCentre`
  // for why storing travel that does nothing makes the next drag stick.
  return clampCentre(
    {
      zoom: v.zoom,
      cx: v.cx - (finite(dx, 0) / sw) * crop.width,
      cy: v.cy - (finite(dy, 0) / sh) * crop.height,
    },
    slot,
    natural,
  );
}

/**
 * Pinch, about a point of the window rather than about its centre.
 *
 * `focus` is where the fingers are, 0–1 across the window, and the point of the
 * photograph under it stays under it. Zooming about the centre instead makes a
 * pinch feel like the picture is being pulled away from the fingers, which on a
 * phone is the difference between an editor that works one-handed and one a
 * customer gives up on.
 */
export function zoomedAbout(
  view: Partial<PhotoView> | undefined,
  factor: number,
  focus: { x: number; y: number },
  slot: Box,
  natural: Natural,
): PhotoView {
  const v = sane(view);
  const next = clamp(v.zoom * (finite(factor, 1) > 0 ? finite(factor, 1) : 1), 1, MAX_ZOOM);
  const before = cropFor(v, slot, natural);
  const after = cropFor({ ...v, zoom: next }, slot, natural);

  // The source point under the fingers now, and where it would land after the
  // crop shrinks about the current centre. Shift the centre by the difference.
  const fx = clamp(finite(focus.x, 0.5), 0, 1);
  const fy = clamp(finite(focus.y, 0.5), 0, 1);
  const anchorX = before.x + fx * before.width;
  const anchorY = before.y + fy * before.height;
  return clampCentre(
    {
      zoom: next,
      cx: anchorX + (0.5 - fx) * after.width,
      cy: anchorY + (0.5 - fy) * after.height,
    },
    slot,
    natural,
  );
}

/**
 * How many dots per inch this crop actually has, along its poorer axis.
 *
 * Honest arithmetic over a reassuring badge: the slot's width in inches is
 * `slot.width / 72` by definition of a point, and the source pixels spanning it
 * are `crop.width × natural.width`. Nothing here consults `print.pixels` —
 * asking for a bigger print file does not create photograph.
 */
export function effectiveDpi(crop: Crop, slot: Box, natural: Natural): number {
  const across = finite(crop.width, 1) * finite(natural.width, 0);
  const down = finite(crop.height, 1) * finite(natural.height, 0);
  const wIn = finite(slot.width, 0) / 72;
  const hIn = finite(slot.height, 0) / 72;
  if (!(wIn > 0 && hIn > 0)) return 0;
  return Math.min(across / wIn, down / hIn);
}
