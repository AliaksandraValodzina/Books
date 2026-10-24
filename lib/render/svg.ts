/**
 * **The renderer. There is one, and this is it.**
 *
 * The page a customer looks at and the file that goes to Printify are the same
 * string, produced here from the same `PageTemplate` and the same `PageFill`.
 * The screen inlines it; `./raster.ts` hands it to a rasteriser at 3150 px. The
 * only difference between the two calls is how an asset is addressed — a URL
 * the browser can fetch, or a `data:` URI the rasteriser can read without a
 * network — and that is an *address*, not a drawing.
 *
 * Keepnook's `lib/spreadRender.ts` says why this matters better than a comment
 * here could: a second renderer becomes a drifting picture of the first, and
 * you find out in a customer's printed book. Keepnook pays for that rule with
 * two expressions of the same numbers, because there is no way to order a Skia
 * node against a React Native view. Here there is no such obstacle — a browser
 * and `resvg` both read SVG — so the rule costs nothing and is kept absolutely.
 *
 * **Why SVG and not a canvas, or a screenshot.** The output carries a `viewBox`
 * in page units, so the raster size is a pure multiplier of the geometry rather
 * than a thing the geometry has to know about. That is the same argument
 * `spreadRender` makes for drawing from data instead of capturing the view, and
 * it is the only arrangement in which "show me this page at 900 px" and "print
 * this page at 3150 px" can be the same code with one number changed.
 *
 * **The one seam, named.** Text is laid out by whoever shapes it — the
 * browser's engine on screen, `resvg`'s on the way to print. Two shapers can
 * disagree about the advance width of a string by a fraction of a point. That
 * is why a text slot carries an explicit anchor and a `maxChars` rather than an
 * auto-fitting box (see `TextSlotLayer.maxChars`): the seam is held to
 * sub-point tracking differences inside a line, instead of being allowed to
 * decide where a line breaks or how big the type is.
 */

import type {
  Box,
  Canvas,
  Layer,
  PageFill,
  PageTemplate,
  PhotoSlotLayer,
  TextSlotLayer,
  AssetRef,
} from "../template/types";
import { cropOf, lineHeightOf, maskOf, opacityOf, rotationOf, textOf } from "../template/defaults";
import { centreOf, maskPath, placePhoto, r, roundedRectPath } from "../template/geometry";
import { drawArt, shadowFilter } from "./decoration";
import { familyOf } from "./fonts";

/**
 * How a photograph's bytes are named in the output.
 *
 * The screen passes `assetUrl`; the print path passes a function that returns a
 * `data:` URI. Making this an argument rather than a branch inside the renderer
 * is what keeps "one renderer" true under inspection: there is no `if
 * (forPrint)` anywhere below.
 */
export type AssetHref = (ref: AssetRef) => string;

export interface RenderOptions {
  href: AssetHref;
  /**
   * Draw the trim and safe guides over the page.
   *
   * **Never true for a print file** — `renderPrintSvg` in `./raster.ts` does not
   * offer the option. This is for the captain looking at a page on screen and
   * wanting to see where the guillotine goes.
   */
  guides?: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rotate(frame: Box, degrees: number): string {
  if (!degrees) return "";
  const { cx, cy } = centreOf(frame);
  return ` transform="rotate(${r(degrees)} ${r(cx)} ${r(cy)})"`;
}

function opacity(v: number): string {
  return v >= 1 ? "" : ` opacity="${r(v)}"`;
}

// ---------------------------------------------------------------------------

function drawPhotoSlot(
  id: string,
  layer: PhotoSlotLayer,
  fill: PageFill,
  href: AssetHref,
): { defs: string; body: string } {
  const mask = maskOf(layer.mask);
  const d = maskPath(mask, layer.frame);
  const defs = `<clipPath id="${id}-clip"><path d="${d}"/></clipPath>`;
  const photo = fill.photos?.[layer.slot];

  if (!photo?.asset) {
    // An empty window. Keepnook's empty `assetId` is the same intentional
    // state: a template lays out real positions before there are photographs
    // to put in them, and the editor needs something to tap.
    const hint = layer.placeholder?.fill ?? "#ffffff";
    return {
      defs,
      body:
        `<path d="${d}" fill="${hint}"/>` +
        `<path d="${d}" fill="none" stroke="#b9a99a" stroke-width="1.2" stroke-dasharray="6 5"/>`,
    };
  }

  const crop = cropOf(photo);
  const natural = { width: photo.asset.px[0], height: photo.asset.px[1] };
  const place = placePhoto(layer.frame, natural, crop);
  const stroke = layer.stroke
    ? `<path d="${d}" fill="none" stroke="${layer.stroke.colour}" stroke-width="${r(layer.stroke.width)}"/>`
    : "";

  return {
    defs,
    body:
      `<g clip-path="url(#${id}-clip)">` +
      `<image href="${esc(href(photo.asset))}" x="${r(place.x)}" y="${r(place.y)}" ` +
      `width="${r(place.width)}" height="${r(place.height)}" preserveAspectRatio="none"/>` +
      `</g>` +
      stroke,
  };
}

/**
 * Where a line of this slot's text starts, derived from the box and the
 * alignment.
 *
 * Exported because an editor will need the same answer to put a caret in the
 * same place, and two functions that each work it out is two chances to put it
 * somewhere else.
 */
export function textAnchorPoint(layer: TextSlotLayer): { x: number; y: number } {
  const align = layer.align ?? "start";
  const x =
    align === "middle"
      ? layer.frame.x + layer.frame.width / 2
      : align === "end"
        ? layer.frame.x + layer.frame.width
        : layer.frame.x;
  return { x, y: layer.frame.y + (layer.baseline ?? layer.size) };
}

/**
 * One of the customer's words.
 *
 * `frame` is a genuine rectangle — the box `../template/validate.ts` checks
 * against the safe area and the box an editor draws a selection round — and the
 * text hangs off whichever edge of it `align` names, at the baseline the slot
 * declares. Nothing here measures the string: see the seam named at the top of
 * this file, and `TextSlotLayer.maxChars` for what is done about it instead.
 */
function drawTextSlot(layer: TextSlotLayer, fill: PageFill): string {
  const raw = fill.texts?.[layer.slot];
  if (typeof raw !== "string" || raw.length === 0) return "";
  const text = textOf(layer, raw);
  const lines = text.split("\n");
  const lh = lineHeightOf(layer);
  const anchor = layer.align ?? "start";
  const tracking = layer.letterSpacing ? ` letter-spacing="${r(layer.letterSpacing)}"` : "";
  const at = textAnchorPoint(layer);

  const tspans = lines
    .map(
      (line, i) => `<tspan x="${r(at.x)}"${i === 0 ? "" : ` dy="${r(lh)}"`}>${esc(line)}</tspan>`,
    )
    .join("");

  return (
    `<text x="${r(at.x)}" y="${r(at.y)}" ` +
    `font-family="${esc(familyOf(layer.font))}" font-size="${r(layer.size)}" ` +
    `fill="${layer.colour}" text-anchor="${anchor}"${tracking}>${tspans}</text>`
  );
}

// ---------------------------------------------------------------------------

function drawLayer(
  layer: Layer,
  index: number,
  fill: PageFill,
  opts: RenderOptions,
): { defs: string; body: string } {
  const id = `l${index}`;
  const wrap = (inner: string) =>
    `<g${rotate(layer.frame, rotationOf(layer))}${opacity(opacityOf(layer))}>${inner}</g>`;

  switch (layer.kind) {
    case "art": {
      const f = drawArt(id, layer.frame, layer.art);
      return { defs: f.defs, body: wrap(f.body) };
    }
    case "shape": {
      const s = layer.shape;
      const d = roundedRectPath(layer.frame, s.radius ?? 0);
      const defs = s.shadow ? shadowFilter(`${id}-sh`, s.shadow.blur, s.shadow.colour) : "";
      const shadow = s.shadow
        ? `<path d="${d}" filter="url(#${id}-sh)" transform="translate(${r(s.shadow.dx)} ${r(s.shadow.dy)})"/>`
        : "";
      const stroke = s.stroke
        ? ` stroke="${s.stroke.colour}" stroke-width="${r(s.stroke.width)}"`
        : "";
      return {
        defs,
        body: wrap(shadow + `<path d="${d}" fill="${s.fill ?? "none"}"${stroke}/>`),
      };
    }
    case "image": {
      const mask = maskOf(layer.mask);
      const d = maskPath(mask, layer.frame);
      return {
        defs: `<clipPath id="${id}-clip"><path d="${d}"/></clipPath>`,
        body: wrap(
          `<g clip-path="url(#${id}-clip)"><image href="${esc(opts.href(layer.asset))}" ` +
            `x="${r(layer.frame.x)}" y="${r(layer.frame.y)}" width="${r(layer.frame.width)}" ` +
            `height="${r(layer.frame.height)}" preserveAspectRatio="xMidYMid slice"/></g>`,
        ),
      };
    }
    case "photoSlot": {
      const f = drawPhotoSlot(id, layer, fill, opts.href);
      return { defs: f.defs, body: wrap(f.body) };
    }
    case "textSlot":
      return { defs: "", body: wrap(drawTextSlot(layer, fill)) };
    default:
      return { defs: "", body: "" };
  }
}

function guideOverlay(canvas: Canvas): string {
  const b = canvas.bleed;
  const s = canvas.safe;
  const line = (box: Box, colour: string, dash: string) =>
    `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.width)}" height="${r(box.height)}" ` +
    `fill="none" stroke="${colour}" stroke-width="1" stroke-dasharray="${dash}"/>`;
  return (
    `<g>` +
    line({ x: b, y: b, width: canvas.width - 2 * b, height: canvas.height - 2 * b }, "#e0245e", "8 6") +
    line(
      { x: b + s, y: b + s, width: canvas.width - 2 * (b + s), height: canvas.height - 2 * (b + s) },
      "#1f9d55",
      "4 6",
    ) +
    `</g>`
  );
}

/**
 * The page, as an SVG document.
 *
 * `width`/`height` are deliberately **absent** from the root element. A
 * `viewBox` alone is a shape rather than a size, so the browser scales it to
 * whatever box it is given and the rasteriser scales it to 3150 px, and neither
 * one is reading a number the other might not be.
 */
export function renderPageSvg(
  template: PageTemplate,
  fill: PageFill,
  opts: RenderOptions,
): string {
  if (template.schema !== 1) {
    throw new Error(`template ${template.id} is schema ${template.schema}; this renderer knows 1`);
  }
  const { canvas } = template;
  const defs: string[] = [];
  const body: string[] = [];

  for (const [i, layer] of template.layers.entries()) {
    const part = drawLayer(layer, i, fill, opts);
    if (part.defs) defs.push(part.defs);
    if (part.body) body.push(part.body);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${r(canvas.width)} ${r(canvas.height)}" ` +
    `role="img" aria-label="${esc(template.name)}">` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    `<rect x="0" y="0" width="${r(canvas.width)}" height="${r(canvas.height)}" fill="${canvas.background}"/>` +
    body.join("") +
    (opts.guides ? guideOverlay(canvas) : "") +
    `</svg>`
  );
}
