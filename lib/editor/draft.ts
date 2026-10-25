/**
 * **The customer's work in progress, and how it survives a refresh.**
 *
 * A `PageFill` is the document of record — what an order is, what the print
 * route renders, what `validateFill` judges. A **draft** is that plus the two
 * things a fill deliberately does not carry:
 *
 * - the **bytes**, because a fill names a photograph by content hash and
 *   something else is meant to hold the pixels. Today that something else is
 *   this tab. There is no bucket and no credential yet, so the bytes go in the
 *   draft and are posted with the render request.
 * - the **view**, because `Crop` is four numbers and a gesture is three, and
 *   recovering "where were their fingers" from a rectangle is lossy enough that
 *   pinching out and back in would not return to where it started. See
 *   `./view.ts`.
 *
 * `toFill` is the only way a draft becomes a fill, and it derives every crop
 * through `cropFor` against the template's own slot frames. So the editor never
 * writes a crop and the format never sees a view: one direction, one
 * conversion, nothing to keep in step by hand.
 *
 * **Reading is tolerant; writing is not.** A stored draft can come from last
 * week's build, a different template revision, or a hand-edited devtools
 * session, and the rule is `lib/template/defaults.ts`'s rule: draw the sane
 * thing, never throw halfway, never trust a number a document told you. What is
 * *written* is always exactly this shape.
 */

import type { AssetRef, PageFill, PageTemplate, PhotoSlotLayer, TextSlotLayer } from "../template/types";
import { accept } from "./text";
import { cropFor, sane, type PhotoView } from "./view";

export interface PhotoDraft {
  asset: AssetRef;
  view: PhotoView;
  /** The resized bytes as a `data:` URI. What `href` returns for this ref in the editor. */
  dataUrl: string;
}

export interface Draft {
  schema: 1;
  templateId: string;
  /**
   * The revision the draft was last touched against.
   *
   * Kept so a stale draft is *recognisable*, not so it can be refused. A moved
   * heart does not invalidate a customer's photograph: a view is zoom and a
   * centre in the photograph's own coordinates, independent of the slot it
   * lands in, so re-deriving the crop against the new frame is all that a new
   * revision needs. `validateFill` still reports `fill.staleRevision` on the
   * fill, which is the right place for it — it is a statement about what the
   * customer approved, not about whether the page can be drawn.
   */
  templateRev: string;
  photos: Record<string, PhotoDraft>;
  texts: Record<string, string>;
}

export function emptyDraft(template: PageTemplate): Draft {
  return {
    schema: 1,
    templateId: template.id,
    templateRev: template.rev,
    photos: {},
    texts: {},
  };
}

const photoSlots = (t: PageTemplate) =>
  t.layers.filter((l): l is PhotoSlotLayer => l.kind === "photoSlot");

const textSlots = (t: PageTemplate) =>
  t.layers.filter((l): l is TextSlotLayer => l.kind === "textSlot");

/**
 * The fill this draft means.
 *
 * Slots the template no longer has are dropped rather than carried: a fill
 * naming a window that does not exist is `fill.unknownPhotoSlot`, which would
 * block the print route over a layer the customer cannot even see.
 *
 * Text is passed through `accept` on the way out as well as on the way in. That
 * is not redundant — the stored draft may predate a change to `maxChars` or to
 * what the face can write, and this is the last point before a document the
 * till will judge.
 */
export function toFill(draft: Draft, template: PageTemplate): PageFill {
  const photos: PageFill["photos"] = {};
  for (const layer of photoSlots(template)) {
    const entry = draft.photos[layer.slot];
    if (!entry?.asset) continue;
    photos[layer.slot] = {
      asset: entry.asset,
      crop: cropFor(entry.view, layer.frame, {
        width: entry.asset.px?.[0] ?? 0,
        height: entry.asset.px?.[1] ?? 0,
      }),
    };
  }

  const texts: PageFill["texts"] = {};
  for (const layer of textSlots(template)) {
    const raw = draft.texts[layer.slot];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const text = accept(layer, raw).text;
    if (text.length > 0) texts[layer.slot] = text;
  }

  return {
    schema: 1,
    templateId: template.id,
    templateRev: template.rev,
    photos,
    texts,
  };
}

/** The bytes for every photograph in the draft, keyed by digest — what `/api/print` is posted. */
export function bytesOf(draft: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of Object.values(draft.photos)) {
    if (entry?.asset?.sha256 && typeof entry.dataUrl === "string") {
      out[entry.asset.sha256] = entry.dataUrl;
    }
  }
  return out;
}

export function isComplete(draft: Draft, template: PageTemplate): boolean {
  return (
    photoSlots(template).every((l) => Boolean(draft.photos[l.slot]?.asset)) &&
    textSlots(template).every((l) => (draft.texts[l.slot] ?? "").length > 0)
  );
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
 * Checked on the way *out of storage* as well as on the way in, because this
 * string becomes an `href` in the SVG the page inlines. `localStorage` is only
 * writable by this origin, so a hostile value there means the origin is already
 * compromised — but the check costs a regex and removes the question.
 */
function readDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null;
}

/**
 * Whatever was in storage, as a draft for this template.
 *
 * A draft for a **different template** is not this page's work and is
 * discarded. A draft for a different *revision* of this template is kept: see
 * `Draft.templateRev`.
 */
export function readDraft(value: unknown, template: PageTemplate): Draft {
  const empty = emptyDraft(template);
  if (!value || typeof value !== "object") return empty;
  const v = value as Partial<Draft>;
  if (v.schema !== 1) return empty;
  if (v.templateId !== template.id) return empty;

  const out = emptyDraft(template);
  out.templateRev = typeof v.templateRev === "string" ? v.templateRev : template.rev;

  const wantedPhotos = new Set(photoSlots(template).map((l) => l.slot));
  for (const [slot, entry] of Object.entries(v.photos ?? {})) {
    if (!wantedPhotos.has(slot) || !entry || typeof entry !== "object") continue;
    const asset = readAsset((entry as PhotoDraft).asset);
    const dataUrl = readDataUrl((entry as PhotoDraft).dataUrl);
    if (!asset || !dataUrl) continue;
    out.photos[slot] = { asset, dataUrl, view: sane((entry as PhotoDraft).view) };
  }

  for (const layer of textSlots(template)) {
    const raw = (v.texts ?? {})[layer.slot];
    if (typeof raw !== "string") continue;
    // Re-accepted rather than trusted: the stored value may predate a change
    // to `maxChars`, or to what the face can write.
    const text = accept(layer, raw).text;
    if (text.length > 0) out.texts[layer.slot] = text;
  }

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

/**
 * Versioned in the key rather than migrated.
 *
 * A draft is a few minutes of one anonymous customer's work, not an archive.
 * When the shape changes, a new key means last version's value is ignored and
 * swept up rather than parsed by code that no longer understands it — and
 * `readDraft` is tolerant enough that the common case needs neither.
 */
export function draftKey(templateId: string): string {
  return `books.draft.v1.${templateId}`;
}

export function loadDraft(storage: StorageLike | null, template: PageTemplate): Draft {
  if (!storage) return emptyDraft(template);
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey(template.id));
  } catch {
    // Safari in private browsing throws on access, not just on write.
    return emptyDraft(template);
  }
  if (!raw) return emptyDraft(template);
  try {
    return readDraft(JSON.parse(raw), template);
  } catch {
    return emptyDraft(template);
  }
}

export type SaveResult =
  | { saved: true }
  | { saved: false; reason: "quota" | "unavailable"; wordsKept: boolean };

/**
 * Write the draft, and **say so honestly when it did not fit.**
 *
 * Two resized photographs as base64 are a megabyte or so against a quota of a
 * few, so this normally succeeds. When it does not — a third photograph one
 * day, a browser with a smaller quota, private browsing — the fallback keeps
 * the *words* and drops the bytes, because words are small and losing them to
 * an over-large photograph would be absurd.
 *
 * The caller is told which happened. Silently failing to persist is the worst
 * of the options: the customer believes their work is safe, refreshes, and it
 * is gone — which is the whole failure persistence was added to prevent.
 */
export function saveDraft(storage: StorageLike | null, draft: Draft): SaveResult {
  if (!storage) return { saved: false, reason: "unavailable", wordsKept: false };
  const key = draftKey(draft.templateId);
  try {
    storage.setItem(key, JSON.stringify(draft));
    return { saved: true };
  } catch {
    const withoutPhotos: Draft = { ...draft, photos: {} };
    try {
      storage.setItem(key, JSON.stringify(withoutPhotos));
      return { saved: false, reason: "quota", wordsKept: true };
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        // Nothing left to try. The draft lives in the tab either way.
      }
      return { saved: false, reason: "quota", wordsKept: false };
    }
  }
}

export function clearDraft(storage: StorageLike | null, templateId: string): void {
  try {
    storage?.removeItem(draftKey(templateId));
  } catch {
    // An unwritable store is already as cleared as it can be made.
  }
}
