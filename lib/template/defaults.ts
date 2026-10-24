/**
 * The tolerant readers. **Nothing else in the codebase reads an optional field
 * off a template or a fill directly.**
 *
 * A template is data, which means it can arrive from a publisher newer than the
 * reader, from a hand-edited file, or from a customer's stored order written by
 * last year's build. In every one of those cases the renderer's duty is the
 * same: draw the sane thing. A field it does not understand must never make it
 * draw nothing, and must never make it throw halfway down a page that is
 * already half painted.
 *
 * Keepnook's `photoCrop` is the pattern being copied — clamp, fall back, and
 * never divide by something a file told you.
 */

import type { Canvas, Crop, Box, Mask, Pt } from "./types";

const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 0–1, clamped. Absent, NaN or out of range is `fallback`. */
export function unit(v: unknown, fallback: number): number {
  return Math.min(Math.max(num(v, fallback), 0), 1);
}

export function rotationOf(l: { rotation?: number }): number {
  return num(l.rotation, 0);
}

export function opacityOf(l: { opacity?: number }): number {
  return unit(l.opacity, 1);
}

/**
 * The rectangle of the source photograph that fills the slot, 0–1.
 *
 * Clamped into the picture and never allowed to be empty: a zero-width crop
 * divides by zero three lines later and would put a blank window in a printed
 * book. A crop that has been clamped to nothing is the whole picture instead,
 * which is wrong in a way a customer can see and fix.
 */
export function cropOf(fill: { crop?: Crop } | undefined): Crop {
  const c = fill?.crop;
  if (!c || typeof c !== "object") return FULL_CROP;
  const x = unit(c.x, 0);
  const y = unit(c.y, 0);
  const width = Math.min(num(c.width, 1), 1 - x);
  const height = Math.min(num(c.height, 1), 1 - y);
  if (!(width > 0) || !(height > 0)) return FULL_CROP;
  return { x, y, width, height };
}

const KNOWN_MASKS = new Set(["rect", "ellipse", "heart"]);

/**
 * The outline to cut to. An unrecognised kind is the plain box.
 *
 * This is the one fallback worth arguing about, and the argument is the same
 * one `PhotoShape` makes in Keepnook: a photograph in the wrong outline is a
 * flaw somebody can point at, and a photograph that refused to draw is a hole
 * in a book that was paid for.
 */
export function maskOf(m: Mask | undefined): Mask {
  if (!m || typeof m !== "object" || !KNOWN_MASKS.has(m.kind)) {
    return { kind: "rect" };
  }
  return m;
}

export function lineHeightOf(t: { size: Pt; lineHeight?: Pt }): Pt {
  const h = num(t.lineHeight, t.size * 1.2);
  return h > 0 ? h : t.size * 1.2;
}

export function textOf(t: { transform?: "none" | "uppercase" }, raw: string): string {
  return t.transform === "uppercase" ? raw.toUpperCase() : raw;
}

/** The box the guillotine leaves: the artboard inset by `bleed`. */
export function trimBox(c: Canvas): Box {
  const b = Math.max(num(c.bleed, 0), 0);
  return { x: b, y: b, width: c.width - 2 * b, height: c.height - 2 * b };
}

/** The box customer content must stay inside: the trim inset by `safe`. */
export function safeBox(c: Canvas): Box {
  const t = trimBox(c);
  const s = Math.max(num(c.safe, 0), 0);
  return { x: t.x + s, y: t.y + s, width: t.width - 2 * s, height: t.height - 2 * s };
}

/**
 * Pixels per point, derived from the artboard and the print size.
 *
 * Derived, never declared — see the note on `Pt` in `./types.ts`. Multiplied by
 * 72 it is the DPI, which is how `docs/print.md` can state one without the
 * format carrying one.
 */
export function scaleOf(canvas: Canvas, pixels: { width: number }): number {
  return pixels.width / canvas.width;
}
