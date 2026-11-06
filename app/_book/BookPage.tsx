"use client";

/**
 * **One page of the book, drawn by the one renderer.**
 *
 * It calls `renderPageSvg` with a page template derived from the book and
 * inlines the string — the same call, on the same template, with the same fill
 * that `lib/book/print.ts` hands to the rasteriser. The only thing that differs
 * is how a photograph is addressed: a `data:` URI the tab already holds, rather
 * than one the rasteriser builds. That is an *address*, not a drawing, which is
 * the seam `renderPageSvg`'s own docblock names.
 *
 * So **the preview the buyer approves and the file that goes to the press
 * cannot disagree**, and that is not a claim about care — there is no second
 * drawing path for them to disagree across.
 *
 * It is memoised on the values that change what is drawn. Twenty-five pages
 * re-rendered on every keystroke of a dedication would be twenty-five string
 * builds per character; memoised, only the one page the dedication is on
 * rebuilds.
 */

import { useMemo } from "react";
import { pageFillFor, pageTemplateFor } from "../../lib/book/derive";
import { renderPageSvg } from "../../lib/render/svg";
import type { AssetRef } from "../../lib/template/types";
import { useBook } from "./BookProvider";

export default function BookPage({
  index,
  label,
  className = "",
}: {
  index: number;
  /** For a test and for a tooltip. The SVG carries its own `aria-label`. */
  label?: string;
  className?: string;
}) {
  const { book, order, fill } = useBook();
  const dataUrl = order.photo?.dataUrl;
  const digest = order.photo?.asset.sha256;

  const svg = useMemo(() => {
    const template = pageTemplateFor(book, index, {
      lookId: fill.lookId,
      coverId: fill.coverId,
    });
    const href = (ref: AssetRef) =>
      ref.sha256 === digest && dataUrl ? dataUrl : `/api/assets/${ref.sha256}.png`;
    return renderPageSvg(template, pageFillFor(book, index, fill), { href });
  }, [book, index, fill, dataUrl, digest]);

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-[#F3E7DA] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${className}`}
      // The SVG is built here from a template and a fill; nothing in it comes
      // from a network response, and the only buyer-supplied string in it —
      // their name and dedication — goes through `esc` in the renderer.
      dangerouslySetInnerHTML={{ __html: svg }}
      data-page={index}
      data-page-label={label}
    />
  );
}
