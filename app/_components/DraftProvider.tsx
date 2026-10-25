"use client";

/**
 * **The customer's page in progress, held once for the whole screen.**
 *
 * The editor is near the top and the order button is a long way below it, after
 * the facts and the delivery window — because somebody should know what they
 * are buying and when it lands before they are asked for money. Both need the
 * same answer to "is this page finished", and two components each working it
 * out from their own copy is two answers.
 *
 * So the draft lives here and the sections between stay **server-rendered**: a
 * client component may wrap server-rendered `children` and still provide
 * context to the client components among them, so the price list and the
 * guarantees cost no JavaScript while the button at the bottom knows the state
 * of the editor at the top.
 *
 * Everything this provider actually *does* is in `lib/editor/` — the draft, its
 * conversion to a `PageFill`, its persistence, the gesture arithmetic and the
 * text rules are all pure and all tested without a browser. What is left here
 * is React: state, an effect that loads, an effect that saves.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PageTemplate, PhotoSlotLayer, TextSlotLayer } from "../../lib/template/types";
import {
  emptyDraft,
  isComplete,
  loadDraft,
  saveDraft,
  toFill,
  type Draft,
  type SaveResult,
} from "../../lib/editor/draft";
import type { PhotoView } from "../../lib/editor/view";
import { accept, explain } from "../../lib/editor/text";
import { FACES } from "../../lib/render/fonts";
import { PhotoUnreadable, preparePhoto } from "../../lib/editor/photo";

export interface DraftContext {
  template: PageTemplate;
  draft: Draft;
  /** Which slot the customer is working on, so a focus ring and the controls agree. */
  active: string | null;
  setActive: (slot: string | null) => void;
  /** The one message area. A second one somewhere else is a message nobody reads. */
  notice: string | null;
  setNotice: (message: string | null) => void;
  /** The slot whose photograph is being decoded, if any. */
  busy: string | null;
  /** Whether the browser is remembering the page, and what it dropped if not. */
  persistence: SaveResult | null;
  choosePhoto: (layer: PhotoSlotLayer, file: File | undefined) => Promise<void>;
  setView: (slot: string, next: (view: PhotoView) => PhotoView) => void;
  typeWord: (layer: TextSlotLayer, raw: string) => void;
  /** Every window filled and every word written. */
  ready: boolean;
}

const Ctx = createContext<DraftContext | null>(null);

export function useDraft(): DraftContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDraft outside DraftProvider");
  return value;
}

/** `localStorage`, or null where there is not one — the server, or private browsing. */
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default function DraftProvider({
  template,
  children,
}: {
  template: PageTemplate;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(template));
  const [active, setActive] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<SaveResult | null>(null);

  // Loaded after mount and never during render. The server has no
  // `localStorage`, and starting from the same empty draft on both sides is
  // what keeps the first paint and the hydration agreeing.
  useEffect(() => {
    const stored = loadDraft(store(), template);
    if (Object.keys(stored.photos).length || Object.keys(stored.texts).length) {
      setDraft(stored);
    }
  }, [template]);

  // Debounced, because a pan changes the draft on every pointer move and
  // serialising a megabyte of base64 at sixty hertz would make the gesture
  // stutter — in the one interaction the whole sale depends on.
  useEffect(() => {
    const id = setTimeout(() => setPersistence(saveDraft(store(), draft)), 600);
    return () => clearTimeout(id);
  }, [draft]);

  const setView = useCallback((slot: string, next: (view: PhotoView) => PhotoView) => {
    setDraft((d) => {
      const entry = d.photos[slot];
      if (!entry) return d;
      return { ...d, photos: { ...d.photos, [slot]: { ...entry, view: next(entry.view) } } };
    });
  }, []);

  const choosePhoto = useCallback(async (layer: PhotoSlotLayer, file: File | undefined) => {
    if (!file) return;
    setBusy(layer.slot);
    setNotice(null);
    try {
      const prepared = await preparePhoto(file);
      setDraft((d) => ({
        ...d,
        photos: {
          ...d.photos,
          [layer.slot]: {
            asset: prepared.asset,
            dataUrl: prepared.dataUrl,
            // Landing fully out and centred is the one position that is never
            // wrong: the whole photograph, so the customer sees what they have
            // before deciding what to keep.
            view: { zoom: 1, cx: 0.5, cy: 0.5 },
          },
        },
      }));
      setActive(layer.slot);
    } catch (error) {
      setNotice(
        error instanceof PhotoUnreadable
          ? error.message
          : "That photograph could not be read. Another one should work.",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const typeWord = useCallback((layer: TextSlotLayer, raw: string) => {
    // Every keystroke goes through the same `accept` the stored draft and the
    // outgoing fill go through, so what is on screen is always what would
    // print — including the characters it quietly declined to take.
    const got = accept(layer, raw);
    setDraft((d) => ({ ...d, texts: { ...d.texts, [layer.slot]: got.text } }));
    setNotice(explain(got, FACES[layer.font]?.family ?? "This face"));
  }, []);

  const value = useMemo<DraftContext>(
    () => ({
      template,
      draft,
      active,
      setActive,
      notice,
      setNotice,
      busy,
      persistence,
      choosePhoto,
      setView,
      typeWord,
      ready: isComplete(draft, template),
    }),
    [template, draft, active, notice, busy, persistence, choosePhoto, setView, typeWord],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The fill the draft means — the same conversion an order goes through. */
export function useFill(): ReturnType<typeof toFill> {
  const { draft, template } = useDraft();
  return useMemo(() => toFill(draft, template), [draft, template]);
}
