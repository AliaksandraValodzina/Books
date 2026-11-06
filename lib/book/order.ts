/**
 * **The buyer's order in progress, and how it survives a refresh.**
 *
 * `lib/editor/draft.ts` is the same idea for a single page and its opening
 * paragraphs are worth reading first. The difference here is how little there
 * is: a `BookFill` is five values, and an `Order` is those five plus the one
 * thing a fill deliberately does not carry — the **bytes** of the buyer's
 * photograph, because a fill names it by content hash and there is no bucket
 * yet, so the pixels live in this tab and travel with the render request.
 *
 * There is no *view* here, which is the other thing a page draft carries. A
 * view is where the buyer's fingers were, and in this product the buyer has no
 * fingers on anything: every slot is fixed, so there is nothing to remember.
 *
 * **Reading is tolerant and sanitising; writing is not.** A stored order can
 * come from last week's build, a retired look, a changed limit, or a hand-edited
 * devtools session. So `readOrder` puts every value back through the same
 * checks the form applies — `checkName`, `acceptLines`, the look and cover
 * lists — and drops what no longer passes.
 *
 * That last point is load-bearing rather than defensive. `lib/render/svg.ts`
 * **throws** on a fill that overflows its slot, which is right for a print file
 * and wrong for a preview the buyer is looking at. Sanitising at the door is
 * what keeps the renderer's refusal a genuine backstop — reachable by a
 * hand-written document and by nothing a buyer can do — rather than a crash
 * waiting on the far side of a tampered `localStorage` key.
 */

import type { AssetRef, Box } from "../template/types";
import { acceptLines } from "../editor/lines";
import { DEFAULT_VIEW, cropFor, sane, type PhotoView } from "../editor/view";
import { genderOfLook, looksFor, photoSlotOf } from "./derive";
import { checkName } from "./name";
import { ASKS, SLOT, type AskId } from "./slots";
import { slotsForRole } from "./name";
import { DEFAULT_EDITION, isEdition } from "./editions";
import type { BookFill, BookTemplate } from "./types";

export interface PhotoOrder {
  asset: AssetRef;
  /** The resized bytes as a `data:` URI — what `href` returns for this ref on screen. */
  dataUrl: string;
  /**
   * Where the buyer has moved the photograph to inside its window.
   *
   * **`DEFAULT_VIEW` is the state nobody touched**, and it is the whole of what
   * "the buyer never positions anything" means here: an untouched photograph
   * is cover-fitted and centred, exactly as a fill with no `Crop` draws, and
   * the preview the buyer approves is that. Crop is then an *adjustment* they
   * may make rather than a step they must complete — the captain's
   * specification asks for Crop and Delete after upload, and a square window
   * takes the same bite out of every picture until somebody says otherwise.
   *
   * It is a `PhotoView` and not a `Crop` because a `Crop` is derived: a pinch
   * changes a crop's size *about its centre*, and `lib/editor/view.ts` opens
   * with why computing that from four corner numbers drifts. `toBookFill`
   * converts it once, with `cropFor`, against the slot the renderer will use.
   */
  view: PhotoView;
}

export interface Order {
  schema: 1;
  bookId: string;
  /**
   * The revision the order was last touched against.
   *
   * Kept so a stale order is *recognisable* rather than refusable. Nothing the
   * buyer supplied depends on where a slot is, so a moved slot does not
   * invalidate a name — `validateBookFill` still reports `fill.staleRevision`,
   * which is a statement about what they approved and not about whether it can
   * be drawn.
   */
  bookRev: string;
  /**
   * The answer to the question asked before the grid, or `null`.
   *
   * **Not in `BookFill`, and that is the point.** The gender is a *filter on
   * the grid*, and once a look is chosen the look already says which gender it
   * belongs to — so putting it in the order's fill too would be two statements
   * of one fact, with a day where they disagree. It lives here because the form
   * needs somewhere to remember the answer between the question and the grid.
   *
   * `null` means not yet answered, which is the state the flow opens in.
   */
  genderId: string | null;
  lookId: string;
  coverId: string;
  /**
   * Which edition — softcover, or the one hardcover upgrade.
   *
   * On the order and **not** in the `BookFill`, for `lib/book/editions.ts`'s
   * reason: it changes nothing that is drawn, so a fill that carried it would
   * make a price change restamp the book and mark every earlier order stale.
   */
  editionId: string;
  name: string;
  dedication: string;
  /** The optional line under the dedication. Empty is the normal state. */
  from: string;
  photo?: PhotoOrder;
}

/**
 * A fresh order.
 *
 * The first look and the first cover are **pre-chosen**, not left empty. A grid
 * with nothing selected makes the buyer's first act a decision about a thing
 * they have not seen yet; a grid with the first tile selected lets them press
 * on and change their mind in the preview, which is where the research says the
 * decision actually gets made.
 */
export function emptyOrder(book: BookTemplate): Order {
  return {
    schema: 1,
    bookId: book.id,
    bookRev: book.rev,
    // Unanswered. The grid is not shown until it is, which is the captain's
    // decision of 6 November: the question comes before the tiles.
    genderId: null,
    lookId: book.looks[0]?.id ?? "",
    coverId: book.covers[0]?.id ?? "",
    // The listed edition, not the upgrade. An upgrade nobody has been offered
    // yet must never already be selected.
    editionId: DEFAULT_EDITION,
    name: "",
    dedication: "",
    from: "",
  };
}

/** The dedication slot's limits, or null if the book has none. */
export function dedicationSlot(book: BookTemplate) {
  return slotsForRole(book, SLOT.dedication)[0] ?? null;
}

/** The from-line slot's limits, or null if the book has none. */
export function fromSlot(book: BookTemplate) {
  return slotsForRole(book, SLOT.from)[0] ?? null;
}

/**
 * The fill this order means.
 *
 * Re-checked on the way out as well as on the way in, which is `toFill`'s rule
 * and not redundancy: this is the last point before a document the till will
 * judge, and the stored value may predate a change to a limit.
 */
export function toBookFill(order: Order, book: BookTemplate): BookFill {
  const verdict = checkName(book, order.name);
  const slot = dedicationSlot(book);
  const signature = fromSlot(book);
  return {
    schema: 1,
    bookId: book.id,
    bookRev: book.rev,
    lookId: order.lookId,
    coverId: order.coverId,
    name: verdict.ok ? verdict.name : "",
    dedication: slot ? acceptLines(slot, order.dedication).text : "",
    // The same acceptor as the dedication, against a one-line slot — so the
    // from-line is clamped by the slot's own `maxLines: 1` rather than by a
    // second rule written here. A buyer who presses Return in it gets one line,
    // which is what the slot can print.
    ...(signature ? { from: acceptLines(signature, order.from).text } : {}),
    ...(order.photo?.asset ? { photo: photoFillOf(order, book) } : {}),
  };
}

/**
 * The buyer's photograph as a `PhotoFill`, with their crop if they made one.
 *
 * **`cropFor` is the only converter**, and it is handed the *slot the renderer
 * will draw into* — so the crop is produced at the window's own aspect ratio,
 * which `CLAUDE.md` names as the rule that bites: `placePhoto` covers a
 * mismatched crop by scaling on the larger axis, and a crop of the wrong shape
 * puts part of what the buyer framed outside the window.
 *
 * An untouched view converts to the crop an absent `Crop` already means, so the
 * field is **omitted** in that case rather than written as the full rectangle.
 * That keeps a fill the buyer never adjusted byte-identical to one from before
 * cropping existed, which is what makes `orderFingerprint` stable across this
 * change and a reprint of an older order the same document.
 */
function photoFillOf(order: Order, book: BookTemplate) {
  const asset = order.photo!.asset;
  const slot = photoSlotOf(book);
  const view = sane(order.photo!.view);
  const untouched =
    view.zoom === DEFAULT_VIEW.zoom && view.cx === DEFAULT_VIEW.cx && view.cy === DEFAULT_VIEW.cy;
  if (!slot || untouched) return { asset };
  const natural = { width: asset.px[0], height: asset.px[1] };
  return { asset, crop: cropFor(view, slot.frame as Box, natural) };
}

/** The bytes for the buyer's photograph, keyed by digest — what the print route is posted. */
export function bytesOf(order: Order): Record<string, string> {
  if (!order.photo?.asset?.sha256 || typeof order.photo.dataUrl !== "string") return {};
  return { [order.photo.asset.sha256]: order.photo.dataUrl };
}

/**
 * The order with a gender answered, and the look moved if it has to be.
 *
 * **Changing the answer must not leave a boy's look selected under "A girl".**
 * The grid would then show tiles none of which is the selected one, which reads
 * as the page having forgotten — so the look moves to the first of the new
 * grid. Nothing else in the order is touched: the name, the photograph and the
 * dedication belong to the *listing* and not to any variant, which is the whole
 * reason switching cannot lose a buyer's work.
 */
export function answerGender(order: Order, book: BookTemplate, genderId: string): Order {
  const grid = looksFor(book, genderId);
  const keep = grid.some((l) => l.id === order.lookId);
  return { ...order, genderId, lookId: keep ? order.lookId : (grid[0]?.id ?? order.lookId) };
}

/**
 * What is done, by ask.
 *
 * **The persistent bar reads this and so does `Continue`.** One answer to "is
 * this finished", because two components each working it out from their own
 * copy is two answers — which is the mistake `DraftProvider`'s docblock already
 * records on the single page.
 */
export function done(order: Order, book: BookTemplate): Record<AskId, boolean> {
  const look = book.looks.find((l) => l.id === order.lookId);
  const fill = toBookFill(order, book);
  return {
    name: checkName(book, order.name).ok,
    // A look is only chosen once the question before the grid has been
    // answered: a tile selected by default under a question nobody answered is
    // not a choice the buyer made.
    look: Boolean(look) && (!(book.genders ?? []).length || order.genderId !== null),
    cover: book.covers.some((c) => c.id === order.coverId),
    photo: Boolean(order.photo?.asset),
    dedication: fill.dedication.length > 0,
    from: (fill.from ?? "").length > 0,
  };
}

/**
 * Is the order finished enough to take money for?
 *
 * **Only the asks `ASKS` marks `required`.** The photograph and the from-line
 * are ticks the bar shows and never gates: a parent with no photograph they are
 * happy with still gets the book, and a dedication with no signature is a
 * complete dedication. Blocking `Continue` on either would turn a nice-to-have
 * into a reason to leave, which is the opposite of what the checklist is for —
 * and it is read off the same table the bar renders, so the button and the
 * ticks beside it cannot come to different conclusions.
 */
export function isComplete(order: Order, book: BookTemplate): boolean {
  const state = done(order, book);
  return ASKS.every((ask) => !ask.required || state[ask.id]);
}

/** The required asks still outstanding, in the bar's own order. For the message. */
export function outstanding(order: Order, book: BookTemplate): string[] {
  const state = done(order, book);
  return ASKS.filter((ask) => ask.required && !state[ask.id]).map((ask) => ask.label.toLowerCase());
}

// ---------------------------------------------------------------------------
// Reading something back that may not be what we wrote
// ---------------------------------------------------------------------------

const DIGEST = /^[0-9a-f]{64}$/;
const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

function readAsset(value: unknown): AssetRef | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<AssetRef>;
  const px = v.px;
  if (typeof v.sha256 !== "string" || !DIGEST.test(v.sha256)) return null;
  if (typeof v.mime !== "string" || !MIMES.has(v.mime)) return null;
  if (!Array.isArray(px) || px.length !== 2) return null;
  const [w, h] = px;
  if (!(typeof w === "number" && typeof h === "number" && w > 0 && h > 0)) return null;
  return {
    sha256: v.sha256,
    mime: v.mime as AssetRef["mime"],
    px: [Math.floor(w), Math.floor(h)],
    label: typeof v.label === "string" ? v.label : undefined,
  };
}

/**
 * A `data:` URI for one of the three image types, and nothing else.
 *
 * Checked coming *out* of storage as well as going in, because this string
 * becomes an `href` in the SVG the page inlines. `localStorage` is writable only
 * by this origin, so a hostile value there means the origin is already
 * compromised — but the check costs a regular expression and removes the
 * question.
 */
function readDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null;
}

/**
 * Whatever was in storage, as an order for this book.
 *
 * An order for a **different book** is not this flow's work and is discarded.
 * An order for a different *revision* is kept — see `Order.bookRev`.
 */
export function readOrder(value: unknown, book: BookTemplate): Order {
  const empty = emptyOrder(book);
  if (!value || typeof value !== "object") return empty;
  const v = value as Partial<Order>;
  if (v.schema !== 1 || v.bookId !== book.id) return empty;

  const out = emptyOrder(book);
  out.bookRev = typeof v.bookRev === "string" ? v.bookRev : book.rev;

  // A retired look falls back to the first rather than discarding the order:
  // losing a buyer's name and photograph because a tile was withdrawn would be
  // the worst possible trade.
  if (typeof v.lookId === "string" && book.looks.some((l) => l.id === v.lookId)) {
    out.lookId = v.lookId;
    // Re-derived from the look rather than trusted from storage, so a stored
    // pair that disagrees cannot show a grid the selected tile is not in.
    out.genderId = genderOfLook(book, v.lookId);
  }
  if (out.genderId === null && typeof v.genderId === "string") {
    if ((book.genders ?? []).some((g) => g.id === v.genderId)) out.genderId = v.genderId;
  }
  if (typeof v.coverId === "string" && book.covers.some((c) => c.id === v.coverId)) {
    out.coverId = v.coverId;
  }
  // A retired edition falls back to the listed one rather than being kept. An
  // unknown id here would price the order at whatever `editionOf` guesses, and
  // guessing a price is the one thing this codebase refuses to do.
  if (isEdition(v.editionId)) out.editionId = v.editionId as string;

  if (typeof v.name === "string") {
    const verdict = checkName(book, v.name);
    if (verdict.ok) out.name = verdict.name;
  }

  const slot = dedicationSlot(book);
  if (slot && typeof v.dedication === "string") {
    out.dedication = acceptLines(slot, v.dedication).text;
  }
  const signature = fromSlot(book);
  if (signature && typeof v.from === "string") {
    out.from = acceptLines(signature, v.from).text;
  }

  const asset = readAsset(v.photo?.asset);
  const dataUrl = readDataUrl(v.photo?.dataUrl);
  // `sane` rather than a trust of the stored numbers: a hand-edited zoom of
  // 400 or a centre of NaN would otherwise reach `cropFor`, and a crop with no
  // area is a `fill.cropEmpty` thrown at the till rather than at the door.
  if (asset && dataUrl) out.photo = { asset, dataUrl, view: sane(v.photo?.view) };

  return out;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Only what this module uses, so a test does not need a browser. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Versioned in the key rather than migrated — `draftKey`'s reasoning exactly. */
export function orderKey(bookId: string): string {
  return `books.order.v1.${bookId}`;
}

export function loadOrder(storage: StorageLike | null, book: BookTemplate): Order {
  if (!storage) return emptyOrder(book);
  let raw: string | null;
  try {
    raw = storage.getItem(orderKey(book.id));
  } catch {
    // Safari in private browsing throws on access, not only on write.
    return emptyOrder(book);
  }
  if (!raw) return emptyOrder(book);
  try {
    return readOrder(JSON.parse(raw), book);
  } catch {
    return emptyOrder(book);
  }
}

export type SaveResult =
  | { saved: true }
  | { saved: false; reason: "quota" | "unavailable"; wordsKept: boolean };

/**
 * Write the order, and **say so honestly when it did not fit.**
 *
 * One resized photograph as base64 is a few hundred kilobytes against a quota
 * of a few megabytes, so this normally succeeds. When it does not, the fallback
 * keeps the **words** and drops the bytes: a name and a dedication are the part
 * that took effort to write, and losing them to an over-large photograph would
 * be absurd. Silently failing is the one option that is never taken — the buyer
 * would believe their work was safe, refresh, and find it gone.
 */
export function saveOrder(storage: StorageLike | null, order: Order): SaveResult {
  if (!storage) return { saved: false, reason: "unavailable", wordsKept: false };
  const key = orderKey(order.bookId);
  try {
    storage.setItem(key, JSON.stringify(order));
    return { saved: true };
  } catch {
    const withoutPhoto: Order = { ...order, photo: undefined };
    try {
      storage.setItem(key, JSON.stringify(withoutPhoto));
      return { saved: false, reason: "quota", wordsKept: true };
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        // Nothing left to try. The order lives in the tab either way.
      }
      return { saved: false, reason: "quota", wordsKept: false };
    }
  }
}

export function clearOrder(storage: StorageLike | null, bookId: string): void {
  try {
    storage?.removeItem(orderKey(bookId));
  } catch {
    // An unwritable store is already as cleared as it can be made.
  }
}
