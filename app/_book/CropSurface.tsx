"use client";

/**
 * **Crop: the one thing the buyer may move, and it moves nothing on the page.**
 *
 * The flow is a form and not an editor — every slot is fixed, and `BookFill`
 * has no coordinates in it for a buyer to have chosen. This is the single
 * exception the captain asked for, and the distinction it rests on is worth
 * stating because it is what keeps the rest of the design intact:
 *
 * **The buyer never positions anything *on the page*. They may choose which
 * part of their own photograph the fixed window shows.** The window does not
 * move, resize, rotate or reflow; nothing else on the spread knows this
 * happened. A buyer who never touches it gets `placePhoto`'s cover-fit about
 * the centre, which is exactly what they got before cropping existed — so the
 * default is unchanged and `toBookFill` omits the `Crop` entirely in that case.
 *
 * **It is not a second placement path.** The surface is a transparent overlay
 * positioned by percentage over the real page, and the page underneath is
 * `BookPage` — `renderPageSvg`, the same string the rasteriser is handed. A
 * drag becomes a `PhotoView`, `cropFor` turns that into the `Crop` the format
 * already defines, and `placePhoto` does the placing for the screen and the
 * print file alike. There is no nudged `<image>` element and no CSS transform
 * anywhere in here. `test/editor-to-print.test.ts` already proves that
 * arithmetic against a 3150 px render; this reuses it rather than restating it.
 *
 * **The DPI is shown rather than hidden.** Zooming in spends source pixels, and
 * a buyer who has zoomed a long way into a small photograph has a right to know
 * before they pay — `lib/book/photo.ts` refuses a photograph too small to print
 * at all, and this is the same honesty one level finer.
 */

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  MAX_ZOOM,
  cropFor,
  effectiveDpi,
  panned,
  zoomedAbout,
  type PhotoView,
} from "../../lib/editor/view";
import {
  dragToSlot,
  midpoint,
  pointToSlotFraction,
  spread,
  stageOf,
  type Stage,
} from "../../lib/editor/gesture";
import { photoSlotOf } from "../../lib/book/derive";
import BookPage from "./BookPage";
import { useBook } from "./BookProvider";

/**
 * The slot's box as a percentage of the artboard.
 *
 * Percentages rather than pixels so the overlay tracks the SVG at every size
 * without anything measuring anything — the `viewBox` scales the drawing to the
 * square and this scales the chrome to the same square. `Editor.tsx`'s
 * `overlayStyle` is the same function for the single page.
 */
function boxStyle(side: number, frame: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    position: "absolute",
    left: `${(frame.x / side) * 100}%`,
    top: `${(frame.y / side) * 100}%`,
    width: `${(frame.width / side) * 100}%`,
    height: `${(frame.height / side) * 100}%`,
  };
}

export default function CropSurface({ pageIndex }: { pageIndex: number }) {
  const { book, order, setPhotoView } = useBook();
  const slot = photoSlotOf(book);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stage = useRef<Stage | null>(null);
  const lastSpread = useRef<number | null>(null);

  const photo = order.photo;
  if (!slot || !photo) return null;

  const natural = { width: photo.asset.px[0], height: photo.asset.px[1] };
  const dpi = Math.round(effectiveDpi(cropFor(photo.view, slot.frame, natural), slot.frame, natural));
  const floor = Math.round((book.page.print.pixels.width / book.page.canvas.width) * 72);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Measured at the start of every gesture rather than cached: the square
    // resizes with the viewport, and a phone changes it when the keyboard
    // opens or the device is turned. A stale scale pans at the wrong speed for
    // the rest of the gesture's life.
    const rect = stageRef.current?.getBoundingClientRect();
    stage.current = rect ? stageOf(rect, book.page.canvas.width) : null;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastSpread.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    const metrics = stage.current;
    if (!previous || !metrics) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);

    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      const current = spread(a, b);
      const before = lastSpread.current;
      lastSpread.current = current;
      if (before && before > 0 && current > 0) {
        const focus = pointToSlotFraction(
          midpoint(a, b),
          slot.frame,
          0,
          book.page.canvas.width,
          metrics,
        );
        setPhotoView((view) => zoomedAbout(view, current / before, focus, slot.frame, natural));
      }
      return;
    }

    const delta = dragToSlot(now.x - previous.x, now.y - previous.y, 0, metrics.scale);
    setPhotoView((view) => panned(view, delta.dx, delta.dy, slot.frame, natural));
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    lastSpread.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div data-testid="crop-surface">
      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-[18rem] select-none overflow-hidden rounded-lg shadow-lg shadow-black/20"
      >
        <BookPage index={pageIndex} label="Crop your photograph" />
        <div
          data-testid="crop-handle"
          // `touch-action: none` only here, over the window itself: a buyer
          // scrolling the page who happens to begin the swipe on the rest of
          // the spread must still scroll.
          style={{ ...boxStyle(book.page.canvas.width, slot.frame), touchAction: "none" }}
          className="cursor-grab ring-2 ring-white/70 active:cursor-grabbing"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs">
        <span className="opacity-70">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.02}
          value={photo.view.zoom}
          data-testid="crop-zoom"
          aria-label="Zoom your photograph"
          // A slider has no fingers to anchor to, so it zooms about the centre
          // of the window. `clampCentre` inside `panned`/`sane` does the rest.
          onChange={(event) =>
            setPhotoView((view) => ({
              ...view,
              zoom: Math.min(Math.max(Number(event.target.value), 1), MAX_ZOOM),
            }))
          }
          className="w-full"
        />
      </label>

      <p className="mt-1 text-[0.72rem] opacity-70" role="status">
        Drag inside the frame to move it. {dpi >= floor
          ? `Sharp at this crop — ${dpi} DPI.`
          : `${dpi} DPI at this crop, where the page prints at ${floor}. Zoom out a little for the sharpest print.`}
      </p>
    </div>
  );
}
