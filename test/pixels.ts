/**
 * Looking at what actually came out.
 *
 * **The point of this file is that a test can fail.** A render test that only
 * checks a file was written, or that its header says 3150, passes just as
 * happily when the renderer draws a blank brown square — and a blank brown
 * square is exactly what a broken mask, a missing asset or a dropped layer
 * produces. So the suite reads pixels: it asks whether the cloth's dots are in
 * the cloth, whether the warm photograph is inside the upper heart and the cool
 * one inside the lower, whether the ink of each word is on the card, and
 * whether the space between a heart's lobes is still card.
 *
 * Colours are compared with a tolerance because a PNG is the end of a chain of
 * antialiasing and gamma, and an exact-match assertion on a rendered pixel is a
 * test that fails on a rasteriser upgrade for no reason anybody can act on.
 */

import { PNG } from "pngjs";
import type { Box, PageTemplate } from "../lib/template/types";

export interface Raster {
  png: PNG;
  /** Pixels per page unit, so a test can be written in the template's own units. */
  scale: number;
}

export function raster(bytes: Uint8Array, template: PageTemplate): Raster {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { png, scale: png.width / template.canvas.width };
}

export function hexAt(r: Raster, ptx: number, pty: number): string {
  const x = Math.round(ptx * r.scale);
  const y = Math.round(pty * r.scale);
  const i = (r.png.width * y + x) << 2;
  return (
    "#" +
    [0, 1, 2].map((c) => r.png.data[i + c].toString(16).padStart(2, "0")).join("")
  );
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Straight-line distance in RGB. Crude, and crude is right for "is this that colour". */
export function distance(a: string, b: string): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

export function isColour(got: string, want: string, tolerance = 14): boolean {
  return distance(got, want) <= tolerance;
}

/**
 * What fraction of a region is (near enough) one colour.
 *
 * Sampled every third pixel on both axes: a 300 DPI page is nine million
 * pixels and the questions being asked here are about whole regions, not about
 * individual ones.
 */
export function shareOf(r: Raster, box: Box, colour: string, tolerance = 14): number {
  let hits = 0;
  let total = 0;
  const x1 = Math.round((box.x + box.width) * r.scale);
  const y1 = Math.round((box.y + box.height) * r.scale);
  for (let y = Math.round(box.y * r.scale); y < y1; y += 3) {
    for (let x = Math.round(box.x * r.scale); x < x1; x += 3) {
      const i = (r.png.width * y + x) << 2;
      const hex =
        "#" + [0, 1, 2].map((c) => r.png.data[i + c].toString(16).padStart(2, "0")).join("");
      if (distance(hex, colour) <= tolerance) hits++;
      total++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

/** How many different colours a region holds. A flat fill is 1; a photograph is hundreds. */
export function distinctColours(r: Raster, box: Box): number {
  const seen = new Set<string>();
  const x1 = Math.round((box.x + box.width) * r.scale);
  const y1 = Math.round((box.y + box.height) * r.scale);
  for (let y = Math.round(box.y * r.scale); y < y1; y += 3) {
    for (let x = Math.round(box.x * r.scale); x < x1; x += 3) {
      const i = (r.png.width * y + x) << 2;
      seen.add(`${r.png.data[i]},${r.png.data[i + 1]},${r.png.data[i + 2]}`);
    }
  }
  return seen.size;
}

/** Mean luminance of a region, 0–255. Used to tell "tape over cloth" from "cloth". */
export function meanLuma(r: Raster, box: Box): number {
  let sum = 0;
  let total = 0;
  const x1 = Math.round((box.x + box.width) * r.scale);
  const y1 = Math.round((box.y + box.height) * r.scale);
  for (let y = Math.round(box.y * r.scale); y < y1; y += 3) {
    for (let x = Math.round(box.x * r.scale); x < x1; x += 3) {
      const i = (r.png.width * y + x) << 2;
      sum += 0.2126 * r.png.data[i] + 0.7152 * r.png.data[i + 1] + 0.0722 * r.png.data[i + 2];
      total++;
    }
  }
  return total === 0 ? 0 : sum / total;
}

/** The template with one layer taken out — how a content test proves it can fail. */
export function without(template: PageTemplate, layerId: string): PageTemplate {
  return { ...template, layers: template.layers.filter((l) => l.id !== layerId) };
}

// The regions the content tests ask about, in page units. Named here so the
// test files read as statements about the page rather than about arithmetic.
export const REGION = {
  clothCorner: { x: 4, y: 4, width: 70, height: 70 },
  cardClear: { x: 560, y: 150, width: 80, height: 60 },
  heartUpperCentre: { x: 220, y: 230, width: 70, height: 60 },
  heartUpperCleft: { x: 246, y: 158, width: 24, height: 16 },
  heartLowerCentre: { x: 310, y: 440, width: 70, height: 60 },
  heartLowerCleft: { x: 334, y: 380, width: 24, height: 14 },
  kiss: { x: 522, y: 568, width: 116, height: 94 },
  wordTop: { x: 404, y: 222, width: 176, height: 116 },
  wordBottom: { x: 150, y: 604, width: 350, height: 62 },
  tapeOverCloth: { x: 302, y: 94, width: 154, height: 46 },
  clothBesideTape: { x: 120, y: 94, width: 154, height: 46 },
} satisfies Record<string, Box>;

export const INK = {
  cloth: "#6B4A33",
  dot: "#F2E4D3",
  card: "#FBF6EC",
  kiss: "#B93C52",
  wordTop: "#4A2E22",
  wordBottom: "#3A241A",
};
