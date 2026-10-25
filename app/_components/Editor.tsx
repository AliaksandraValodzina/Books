"use client";

/**
 * **The editor, which is the top of the selling page.**
 *
 * The buyer's real question is not "is this nice" — it is *"will mine look as
 * good as yours?"*. Every example uses beautiful couples and beautiful
 * photographs; the customer has blurry phone pictures and doubts. So this is
 * not a landing page with a buy button at the bottom. Someone arriving from a
 * link should be putting a photograph in within seconds, without scrolling to
 * look for the way in, and the moment they see their own faces in the hearts
 * the sale is mostly made.
 *
 * **It is glue, deliberately.** Everything that decides what a customer gets is
 * a pure module tested without a browser: `lib/editor/view.ts` for the crop,
 * `lib/editor/gesture.ts` for the rotated frames, `lib/editor/text.ts` for what
 * may be typed, `lib/editor/draft.ts` for the document and its one conversion,
 * `lib/editor/photo.ts` for the resize and the hash.
 *
 * **It does not draw the page.** It asks `renderPageSvg` for the same string the
 * print path asks for and inlines it. That costs six kilobytes and under a
 * tenth of a millisecond, so the whole page is re-rendered on every pointer
 * move rather than the `<image>` element being nudged by hand — nudging it would
 * be a second placement path, which is exactly what the one-renderer rule
 * forbids. `test/editor-to-print.test.ts` renders a panned fill at 3150 px and
 * reads the pixels back to prove the two agree.
 *
 * The overlays are **chrome**: tap targets, a focus ring, a caret, a label.
 * They sit over the SVG and never inside it, so nothing here can reach a print
 * file.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Box, PageTemplate, PhotoSlotLayer, TextSlotLayer } from "../../lib/template/types";
import { renderPageSvg } from "../../lib/render/svg";
import { FACES } from "../../lib/render/fonts";
import { bytesOf, toFill } from "../../lib/editor/draft";
import {
  DPI_TARGET,
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
import { useDraft } from "./DraftProvider";

// ---------------------------------------------------------------------------

/**
 * A layer's box as a percentage of the artboard.
 *
 * Percentages rather than pixels so an overlay tracks the SVG at every size
 * without anything measuring anything: the `viewBox` scales the drawing to the
 * square, and these scale the chrome to the same square. The default
 * `transform-origin` is the box's centre, which is the point `rotate(θ cx cy)`
 * turns about in `lib/render/svg.ts` — the same transform, so the overlay and
 * the thing it covers cannot drift apart.
 */
function overlayStyle(t: PageTemplate, frame: Box, rotation = 0): CSSProperties {
  return {
    position: "absolute",
    left: `${(frame.x / t.canvas.width) * 100}%`,
    top: `${(frame.y / t.canvas.height) * 100}%`,
    width: `${(frame.width / t.canvas.width) * 100}%`,
    height: `${(frame.height / t.canvas.height) * 100}%`,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
  };
}

/** The base64 of a `data:` URI as a Blob, so the renderer can be given a short `href`. */
function blobFromDataUrl(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const mime = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? "application/octet-stream";
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

export default function Editor({ guides = false }: { guides?: boolean }) {
  const { template, draft, active, setActive, notice, setNotice, busy, persistence, choosePhoto, setView, typeWord } =
    useDraft();

  const photoSlots = useMemo(
    () => template.layers.filter((l): l is PhotoSlotLayer => l.kind === "photoSlot"),
    [template],
  );
  const textSlots = useMemo(
    () => template.layers.filter((l): l is TextSlotLayer => l.kind === "textSlot"),
    [template],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  /**
   * One short URL per photograph, in place of half a megabyte of base64.
   *
   * The `href` the renderer is handed ends up in the inlined SVG, and the SVG is
   * re-rendered on every pointer move. With `data:` URIs that string would be
   * megabytes and the browser would re-parse them all, at which point panning
   * crawls; with `blob:` URLs it stays at six kilobytes and the decoded image is
   * cached against a stable key.
   *
   * Keyed on the **set of digests** rather than on the draft, so panning does
   * not mint a new URL for the same bytes sixty times a second and leak every
   * one of them.
   */
  const digests = Object.values(draft.photos)
    .map((p) => p?.asset?.sha256)
    .filter(Boolean)
    .sort()
    .join(",");

  const objectUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return urls;
    for (const entry of Object.values(draft.photos)) {
      const digest = entry?.asset?.sha256;
      if (!digest || urls[digest]) continue;
      const blob = blobFromDataUrl(entry.dataUrl);
      if (blob) urls[digest] = URL.createObjectURL(blob);
    }
    return urls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digests]);

  useEffect(
    () => () => {
      for (const url of Object.values(objectUrls)) URL.revokeObjectURL(url);
    },
    [objectUrls],
  );

  const fill = useMemo(() => toFill(draft, template), [draft, template]);
  const svg = useMemo(
    () => renderPageSvg(template, fill, { href: (ref) => objectUrls[ref.sha256] ?? "", guides }),
    [template, fill, objectUrls, guides],
  );

  const anyPhoto = Object.keys(draft.photos).length > 0;

  /**
   * Fetch the real print file for the page as it stands.
   *
   * Here rather than behind the order button because it is the one thing that
   * answers "will mine look as good as yours" with evidence instead of a
   * promise: the same renderer, at 3150 pixels, from the customer's own
   * photographs. The bytes go up with the request because there is no bucket —
   * see `lib/assets/supplied.ts` for what the server checks before it draws.
   */
  const download = useCallback(async () => {
    setDownloading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fill: toFill(draft, template), photos: bytesOf(draft) }),
      });
      if (!response.ok) {
        const detail: unknown = await response.json().catch(() => null);
        const problems = (detail as { problems?: Array<{ code: string }> } | null)?.problems;
        const error = (detail as { error?: string } | null)?.error;
        setNotice(
          `The print file could not be made: ${
            problems?.map((p) => p.code).join(", ") ?? error ?? `HTTP ${response.status}`
          }`,
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.id}-${template.print.pixels.width}px.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice("The print file could not be fetched. Check the connection and try again.");
    } finally {
      setDownloading(false);
    }
  }, [draft, template, setNotice]);

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div
        ref={stageRef}
        data-testid="editor-stage"
        className="relative aspect-square w-full select-none overflow-hidden rounded-xl shadow-2xl shadow-black/30 [&>div>svg]:block [&>div>svg]:h-auto [&>div>svg]:w-full"
      >
        <div dangerouslySetInnerHTML={{ __html: svg }} />

        {photoSlots.map((layer) => (
          <PhotoHandle
            key={layer.id}
            template={template}
            layer={layer}
            stageRef={stageRef}
            busy={busy === layer.slot}
            entry={draft.photos[layer.slot]}
            onActivate={() => setActive(layer.slot)}
            onChoose={(file) => void choosePhoto(layer, file)}
            onView={(next) => setView(layer.slot, next)}
          />
        ))}

        {textSlots.map((layer) => (
          <TextHandle
            key={layer.id}
            template={template}
            layer={layer}
            value={draft.texts[layer.slot] ?? ""}
            active={active === layer.slot}
            onActivate={() => setActive(layer.slot)}
            onChange={(raw) => typeWord(layer, raw)}
          />
        ))}
      </div>

      <p className="mt-3 text-center text-sm opacity-70" role="status">
        {anyPhoto
          ? "Drag inside a heart to move your photo. Pinch, or use the zoom below."
          : "Tap a heart to put one of your own photos in it. Nothing is uploaded."}
      </p>

      {notice ? (
        <p className="mt-3 rounded-lg border border-current/25 bg-black/5 px-3 py-2 text-sm" role="alert">
          {notice}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {photoSlots.map((layer) => (
          <PhotoControls
            key={layer.id}
            layer={layer}
            entry={draft.photos[layer.slot]}
            active={active === layer.slot}
            busy={busy === layer.slot}
            onChoose={(file) => void choosePhoto(layer, file)}
            onView={(next) => setView(layer.slot, next)}
            onActivate={() => setActive(layer.slot)}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {textSlots.map((layer) => (
          <WordField
            key={layer.id}
            layer={layer}
            value={draft.texts[layer.slot] ?? ""}
            onChange={(raw) => typeWord(layer, raw)}
            onActivate={() => setActive(layer.slot)}
          />
        ))}
      </div>

      {persistence && !persistence.saved && persistence.reason === "quota" ? (
        <p className="mt-3 text-xs opacity-70" role="status">
          {persistence.wordsKept
            ? "Your photos are too large for this browser to remember. Your words are saved — the photos are still here, but a refresh would lose them."
            : "This browser will not remember your page. It is all still here, but a refresh would lose it."}
        </p>
      ) : null}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void download()}
          disabled={!anyPhoto || downloading}
          className="w-full rounded-lg border border-current/25 px-4 py-3 font-medium disabled:opacity-40"
        >
          {downloading ? "Making the print file…" : `See the real ${template.print.pixels.width} px print file`}
        </button>
        <p className="mt-2 text-xs opacity-60">
          The same renderer draws the page above and that file, at{" "}
          {Math.round((template.print.pixels.width / template.canvas.width) * 72)} DPI. It is the
          picture that would be printed — not a preview of one.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Entry = { asset: { px: [number, number]; sha256: string }; view: PhotoView } | undefined;

/**
 * One heart's gesture surface.
 *
 * `touch-action: none` **only once there is a photograph in it.** An empty heart
 * must stay scrollable: a customer swiping down the page who happens to begin
 * the swipe on an empty window would otherwise find the page stuck, which reads
 * as a broken site rather than as a crop editor.
 */
function PhotoHandle({
  template,
  layer,
  entry,
  stageRef,
  busy,
  onActivate,
  onChoose,
  onView,
}: {
  template: PageTemplate;
  layer: PhotoSlotLayer;
  entry: Entry;
  stageRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  onActivate: () => void;
  onChoose: (file: File | undefined) => void;
  onView: (next: (view: PhotoView) => PhotoView) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stage = useRef<Stage | null>(null);
  const lastSpread = useRef<number | null>(null);

  const natural = entry ? { width: entry.asset.px[0], height: entry.asset.px[1] } : null;

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    onActivate();
    if (!entry) return;
    // Measured at the start of every gesture rather than cached: the square
    // resizes with the viewport, and a phone changes it when the keyboard
    // opens, the address bar collapses, or the device is turned. A stale scale
    // is a gesture that pans at the wrong speed for the rest of its life.
    const rect = stageRef.current?.getBoundingClientRect();
    stage.current = rect ? stageOf(rect, template.canvas.width) : null;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastSpread.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!entry || !natural) return;
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    const metrics = stage.current;
    if (!metrics) return;

    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      const current = spread(a, b);
      const before = lastSpread.current;
      lastSpread.current = current;
      if (before && before > 0 && current > 0) {
        const focus = pointToSlotFraction(
          midpoint(a, b),
          layer.frame,
          layer.rotation ?? 0,
          template.canvas.width,
          metrics,
        );
        onView((view) => zoomedAbout(view, current / before, focus, layer.frame, natural));
      }
      return;
    }

    const delta = dragToSlot(
      now.x - previous.x,
      now.y - previous.y,
      layer.rotation ?? 0,
      metrics.scale,
    );
    onView((view) => panned(view, delta.dx, delta.dy, layer.frame, natural));
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    lastSpread.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      data-testid={`photo-handle-${layer.slot}`}
      style={{
        ...overlayStyle(template, layer.frame, layer.rotation),
        touchAction: entry ? "none" : undefined,
      }}
      className={`grid place-items-center ${entry ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={() => {
        if (!entry) fileRef.current?.click();
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={`Choose a photo for “${layer.prompt ?? layer.slot}”`}
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = "";
        }}
      />

      {entry ? null : (
        <span className="pointer-events-none rounded-full bg-[#2b1d14]/85 px-3 py-1.5 text-center text-[0.7rem] font-medium leading-tight text-[#efe9df] shadow-lg">
          {busy ? "Reading…" : `+ ${layer.prompt ?? "Your photo"}`}
        </span>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * A word, edited in place.
 *
 * The input is **invisible and the SVG is the text**: an `opacity-0` field over
 * the slot, with the renderer drawing the live value underneath as it is typed.
 * That is what makes this in-place rather than a form — the customer watches
 * their own word appear on the page in the right face, at the right size, at
 * the right angle, which is the thing being sold.
 *
 * The alternative is an opaque input styled to match, and it is worse: lining a
 * CSS line box up with an SVG baseline means guessing a face's ascent, which
 * differs between browsers, so the word would jump a pixel or two on focus. The
 * cost of this way is no caret inside the word, so the slot takes a visible
 * ring while it is focused and `WordField` below carries the counter.
 *
 * `opacity-0` rather than `color: transparent`, because a transparent input
 * still paints a selection highlight — a blue box across a handwritten word. An
 * `opacity-0` input is still focusable and still announced, so nothing is lost
 * to a screen reader or to the keyboard.
 */
function TextHandle({
  template,
  layer,
  value,
  active,
  onActivate,
  onChange,
}: {
  template: PageTemplate;
  layer: TextSlotLayer;
  value: string;
  active: boolean;
  onActivate: () => void;
  onChange: (raw: string) => void;
}) {
  return (
    <div style={overlayStyle(template, layer.frame, layer.rotation)} className="grid place-items-center">
      <input
        type="text"
        value={value}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        data-testid={`text-handle-${layer.slot}`}
        aria-label={`The word “${layer.slot}” on the page, up to ${layer.maxChars} characters`}
        onFocus={onActivate}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        // 16px stops iOS Safari zooming the whole page on focus, which would
        // throw the customer out of the editor mid-word.
        style={{ fontSize: "16px" }}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-center opacity-0"
      />
      {value.length === 0 && !active ? (
        <span className="pointer-events-none rounded-full border border-dashed border-[#4A2E22]/60 bg-[#FBF6EC]/80 px-2 py-0.5 text-[0.65rem] font-medium text-[#4A2E22]">
          tap to write
        </span>
      ) : null}
      {active ? (
        <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-[#2b1d14]/35" />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PhotoControls({
  layer,
  entry,
  active,
  busy,
  onChoose,
  onView,
  onActivate,
}: {
  layer: PhotoSlotLayer;
  entry: Entry;
  active: boolean;
  busy: boolean;
  onChoose: (file: File | undefined) => void;
  onView: (next: (view: PhotoView) => PhotoView) => void;
  onActivate: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const natural = entry ? { width: entry.asset.px[0], height: entry.asset.px[1] } : null;
  const dpi =
    entry && natural
      ? Math.round(effectiveDpi(cropFor(entry.view, layer.frame, natural), layer.frame, natural))
      : null;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        active ? "border-current/50 bg-black/5" : "border-current/15"
      }`}
    >
      <p className="text-sm font-medium">{layer.prompt ?? "A photograph"}</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={`Choose a photo for “${layer.prompt ?? layer.slot}”`}
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => {
          onActivate();
          fileRef.current?.click();
        }}
        disabled={busy}
        className="mt-2 w-full rounded-lg bg-[#2b1d14] px-3 py-2.5 text-sm font-medium text-[#efe9df] disabled:opacity-50"
      >
        {busy ? "Reading…" : entry ? "Choose a different photo" : "Choose a photo"}
      </button>

      {entry ? (
        <div className="mt-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="opacity-70">Zoom</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.02}
              value={entry.view.zoom}
              aria-label={`Zoom “${layer.prompt ?? layer.slot}”`}
              onChange={(event) => {
                onActivate();
                const zoom = Number(event.target.value);
                // A slider has no fingers to anchor to, so it zooms about the
                // centre of the window. `sane` does the clamping either way.
                onView((view) => ({ ...view, zoom: Math.min(Math.max(zoom, 1), MAX_ZOOM) }));
              }}
              className="w-full"
            />
          </label>
          {dpi !== null ? (
            <p className="mt-1.5 text-[0.7rem] opacity-70">
              {dpi >= DPI_TARGET
                ? `Sharp enough to print — ${dpi} DPI.`
                : `${dpi} DPI at this zoom; ${DPI_TARGET} is ideal. Zoom out a little, or use a larger photo, for the sharpest print.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The word again, under the page, with its counter and its face named.
 *
 * It is a **second field bound to the same one value**, not a second source of
 * truth: both are controlled by the draft, so typing in either updates the page
 * and the other field at once. It earns its place because an invisible input
 * has no affordance — a customer who has not realised the words on the page are
 * theirs to change needs somewhere obvious that says so — and because a counter
 * floating over a rotated handwritten word would be unreadable.
 */
function WordField({
  layer,
  value,
  onChange,
  onActivate,
}: {
  layer: TextSlotLayer;
  value: string;
  onChange: (raw: string) => void;
  onActivate: () => void;
}) {
  const face = FACES[layer.font]?.family ?? layer.font;
  return (
    <div className="rounded-xl border border-current/15 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium" htmlFor={`word-${layer.slot}`}>
          Your word
        </label>
        <span className="text-[0.7rem] tabular-nums opacity-60">
          {value.length}/{layer.maxChars}
        </span>
      </div>
      <input
        id={`word-${layer.slot}`}
        type="text"
        value={value}
        onFocus={onActivate}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        style={{ fontSize: "16px" }}
        className="mt-2 w-full rounded-lg border border-current/20 bg-transparent px-3 py-2"
      />
      <p className="mt-1.5 text-[0.7rem] opacity-60">
        Set in {face}. Latin letters, numbers and punctuation — that face has no others, and a
        letter it cannot write would print as a gap.
      </p>
    </div>
  );
}
