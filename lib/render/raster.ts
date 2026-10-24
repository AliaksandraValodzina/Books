/**
 * The print file.
 *
 * **This module renders nothing.** It asks `./svg.ts` for the page — the same
 * call the screen makes, with the same template and the same fill — and hands
 * the result to a rasteriser at the size the template's `print` spec asks for.
 * Everything that decides what the page *looks like* is upstream of here, which
 * is the whole of the one-renderer rule in one sentence.
 *
 * Node only: it reads font files and runs native code.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { PageFill, PageTemplate } from "../template/types";
import { dataUri, loadAsset } from "../assets/resolve";
import { FACES } from "./fonts";
import { renderPageSvg } from "./svg";
import { readPngSize, withSrgbChunk } from "./png";

/**
 * Every photograph the fill uses, as a `data:` URI.
 *
 * Resolved **before** the render rather than during it, because the renderer is
 * synchronous and must stay that way: a renderer that can await is a renderer
 * that can be halfway through a page when a network call fails, and the thing
 * on the other end of this function is a customer's paid-for book.
 *
 * It is also why the print path cannot quietly depend on R2 being up at the
 * moment somebody clicks Download — the bytes are in hand or the render does
 * not start.
 */
async function inlineAssets(
  template: PageTemplate,
  fill: PageFill,
): Promise<Map<string, string>> {
  const refs = [
    ...Object.values(fill.photos ?? {}).map((p) => p.asset),
    ...template.layers.flatMap((l) => (l.kind === "image" ? [l.asset] : [])),
  ];
  const out = new Map<string, string>();
  for (const ref of refs) {
    if (!ref || out.has(ref.sha256)) continue;
    out.set(ref.sha256, dataUri(await loadAsset(ref), ref.mime));
  }
  return out;
}

/** The SVG that becomes the print file. Exported so a test can read it. */
export async function renderPrintSvg(
  template: PageTemplate,
  fill: PageFill,
): Promise<string> {
  const inlined = await inlineAssets(template, fill);
  return renderPageSvg(template, fill, {
    href: (ref) => {
      const uri = inlined.get(ref.sha256);
      if (!uri) throw new Error(`asset ${ref.sha256.slice(0, 12)}… was not inlined`);
      return uri;
    },
    // Never guides. A trim mark printed inside a customer's book is a defect,
    // and the only way to be certain one can never get there is for the print
    // path not to have the option.
  });
}

export interface PrintResult {
  png: Uint8Array;
  /** Read back out of the bytes, not copied from the request. */
  pixels: { width: number; height: number };
  svg: string;
}

export class PrintSizeMismatch extends Error {}

/**
 * Render the page to the print file.
 *
 * The size comes from `template.print.pixels`, and the result is **measured
 * out of the PNG header** before it is returned. A rasteriser that rounded, or
 * a `viewBox` that was not square, would otherwise produce a file that is
 * nearly right — and nearly right is exactly the failure that survives every
 * check until a book is printed.
 */
export async function renderPrintPng(
  template: PageTemplate,
  fill: PageFill,
): Promise<PrintResult> {
  const svg = await renderPrintSvg(template, fill);
  const want = template.print.pixels;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: want.width },
    font: {
      loadSystemFonts: false, // A machine's own fonts are a difference between machines.
      fontFiles: Object.values(FACES).map((f) => path.join(process.cwd(), "public", f.file)),
    },
    background: template.canvas.background,
  });

  const raw = new Uint8Array(resvg.render().asPng());
  const png = template.print.colourSpace === "srgb" ? withSrgbChunk(raw) : raw;
  const pixels = readPngSize(png);

  if (pixels.width !== want.width || pixels.height !== want.height) {
    throw new PrintSizeMismatch(
      `${template.id} rendered ${pixels.width}×${pixels.height}, asked for ${want.width}×${want.height}`,
    );
  }
  return { png, pixels, svg };
}

/** The TTFs the rasteriser needs, verified to exist. Used by the health check. */
export async function fontFilesPresent(): Promise<boolean> {
  for (const f of Object.values(FACES)) {
    try {
      await readFile(path.join(process.cwd(), "public", f.file));
    } catch {
      return false;
    }
  }
  return true;
}
