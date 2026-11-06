"use client";

/**
 * **The buyer's order, held once for the whole flow.**
 *
 * `DraftProvider` is the same thing for the single page and its docblock makes
 * the argument: the chooser at the top and the `Continue` in the bar at the
 * bottom need the same answer to "is this finished", and two components each
 * working it out from their own copy is two answers.
 *
 * Everything this provider actually *does* is in `lib/book/` — the order, its
 * conversion to a `BookFill`, its persistence, the name's refusal and the
 * dedication's clamp are all pure and all tested without a browser. What is
 * left here is React: state, an effect that loads, an effect that saves.
 *
 * **It never mutates what the buyer typed into the name field.** `checkName`
 * returns a verdict and the raw text stays exactly as typed; the verdict
 * decides whether the book can use it. That is the difference between a name
 * and a dedication — see `lib/book/name.ts` — and it is a property of this
 * component, not only of that module: a controlled input that rewrote the value
 * on every keystroke would be the silent substitution the whole guard exists to
 * prevent, however correct the module underneath it was.
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
import type { BookTemplate } from "../../lib/book/types";
import {
  answerGender,
  done,
  emptyOrder,
  isComplete,
  loadOrder,
  saveOrder,
  toBookFill,
  type Order,
  type SaveResult,
} from "../../lib/book/order";
import { checkName, type NameVerdict } from "../../lib/book/name";
import { isEdition } from "../../lib/book/editions";
import { DEFAULT_VIEW, type PhotoView } from "../../lib/editor/view";
import { checkPhoto } from "../../lib/book/photo";
import { PhotoUnreadable, preparePhoto } from "../../lib/editor/photo";
import type { AskId } from "../../lib/book/slots";

export interface BookContext {
  book: BookTemplate;
  order: Order;
  /** Exactly what is in the name field, including what the book cannot print. */
  typedName: string;
  /** What the book makes of it. `ok: false` is shown and blocks `Continue`. */
  nameVerdict: NameVerdict;
  setName: (raw: string) => void;
  setGender: (id: string) => void;
  setLook: (id: string) => void;
  setCover: (id: string) => void;
  setDedication: (raw: string) => void;
  setFrom: (raw: string) => void;
  setEdition: (id: string) => void;
  choosePhoto: (file: File | undefined) => Promise<void>;
  removePhoto: () => void;
  /** Crop: the one thing the buyer may move. `CropSurface.tsx` says why. */
  setPhotoView: (next: (view: PhotoView) => PhotoView) => void;
  /** The one message area. A second one somewhere else is a message nobody reads. */
  notice: string | null;
  setNotice: (message: string | null) => void;
  /** True while a photograph is being decoded and resized. */
  busy: boolean;
  persistence: SaveResult | null;
  done: Record<AskId, boolean>;
  ready: boolean;
  fill: ReturnType<typeof toBookFill>;
}

const Ctx = createContext<BookContext | null>(null);

export function useBook(): BookContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useBook outside BookProvider");
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

export default function BookProvider({
  book,
  children,
}: {
  book: BookTemplate;
  children: ReactNode;
}) {
  const [order, setOrder] = useState<Order>(() => emptyOrder(book));
  // Held separately from the order, which only ever contains a name the book
  // can print. This is what is in the field.
  const [typedName, setTypedName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [persistence, setPersistence] = useState<SaveResult | null>(null);

  // Loaded after mount and never during render. The server has no
  // `localStorage`, and starting from the same empty order on both sides is
  // what keeps the first paint and the hydration agreeing.
  useEffect(() => {
    const stored = loadOrder(store(), book);
    setOrder(stored);
    setTypedName(stored.name);
  }, [book]);

  useEffect(() => {
    const id = setTimeout(() => setPersistence(saveOrder(store(), order)), 400);
    return () => clearTimeout(id);
  }, [order]);

  const nameVerdict = useMemo(() => checkName(book, typedName), [book, typedName]);

  const setName = useCallback(
    (raw: string) => {
      setTypedName(raw);
      const verdict = checkName(book, raw);
      // The order takes the name only when the book can print it. An empty
      // string is the honest state of "they have typed something we cannot
      // use", and the bar reports it as not done.
      setOrder((o) => ({ ...o, name: verdict.ok ? verdict.name : "" }));
    },
    [book],
  );

  const setGender = useCallback(
    (id: string) => setOrder((o) => answerGender(o, book, id)),
    [book],
  );
  const setLook = useCallback((id: string) => setOrder((o) => ({ ...o, lookId: id })), []);
  const setCover = useCallback((id: string) => setOrder((o) => ({ ...o, coverId: id })), []);
  const setDedication = useCallback(
    // Stored raw and clamped on the way out by `toBookFill`, so the textarea
    // does not fight the buyer's cursor. `DedicationControl` shows the clamped
    // count live, which is the thing they need to see.
    (raw: string) => setOrder((o) => ({ ...o, dedication: raw })),
    [],
  );
  const setFrom = useCallback((raw: string) => setOrder((o) => ({ ...o, from: raw })), []);
  const setEdition = useCallback(
    (id: string) => setOrder((o) => (isEdition(id) ? { ...o, editionId: id } : o)),
    [],
  );

  const choosePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setNotice(null);
      try {
        const prepared = await preparePhoto(file);
        // Checked **after** resizing, against the bytes that would actually be
        // printed. The browser caps the long edge, so a picture that was big
        // enough before could in principle not be after — and the stored asset
        // is what goes to the press.
        const verdict = checkPhoto(book, prepared.asset.px);
        if (!verdict.ok) {
          setNotice(verdict.message);
          return;
        }
        // A fresh photograph lands at `DEFAULT_VIEW` — all of it, centred,
        // which is what a fill with no crop draws. Choosing a *different*
        // photograph therefore discards the previous crop rather than applying
        // it to someone else's picture.
        setOrder((o) => ({
          ...o,
          photo: { asset: prepared.asset, dataUrl: prepared.dataUrl, view: DEFAULT_VIEW },
        }));
      } catch (error) {
        setNotice(
          error instanceof PhotoUnreadable
            ? error.message
            : "That photograph could not be read. Another one should work.",
        );
      } finally {
        setBusy(false);
      }
    },
    [book],
  );

  const removePhoto = useCallback(() => setOrder((o) => ({ ...o, photo: undefined })), []);

  /**
   * A gesture, as a new view.
   *
   * Every writer of a view goes through `clampCentre` — which is what `panned`
   * and `zoomedAbout` already do — because a view that stores travel the crop
   * clamps away makes the next drag stick for exactly that distance.
   * `lib/editor/view.ts` § `clampCentre` is the whole argument, and it is
   * invisible in a unit test and obvious to a thumb.
   */
  const setPhotoView = useCallback((next: (view: PhotoView) => PhotoView) => {
    setOrder((o) => (o.photo ? { ...o, photo: { ...o.photo, view: next(o.photo.view) } } : o));
  }, []);

  const value = useMemo<BookContext>(
    () => ({
      book,
      order,
      typedName,
      nameVerdict,
      setName,
      setGender,
      setLook,
      setCover,
      setDedication,
      setFrom,
      setEdition,
      choosePhoto,
      removePhoto,
      setPhotoView,
      notice,
      setNotice,
      busy,
      persistence,
      done: done(order, book),
      ready: isComplete(order, book),
      fill: toBookFill(order, book),
    }),
    [
      book,
      order,
      typedName,
      nameVerdict,
      setName,
      setGender,
      setLook,
      setCover,
      setDedication,
      setFrom,
      setEdition,
      choosePhoto,
      removePhoto,
      setPhotoView,
      notice,
      busy,
      persistence,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
