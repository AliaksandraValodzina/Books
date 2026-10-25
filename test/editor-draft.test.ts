/**
 * **The draft: one conversion out, and tolerance coming in.**
 *
 * Two things are asserted here and they pull in opposite directions.
 *
 * Going *out*, the conversion is exact: `toFill` must produce a document
 * `validateFill` has nothing to say about, every time, including when the draft
 * is half finished or carries a slot the template has since lost. A draft that
 * converted into an unprintable fill would be a customer paying for a page the
 * print route then refuses.
 *
 * Coming *in*, the reading is tolerant, for the reason `lib/template/defaults.ts`
 * gives: a stored value can arrive from last week's build, a different template
 * revision, or a devtools session. The duty is to recover what is recoverable
 * and discard the rest — never to throw, and never to hand the renderer a
 * number a document told it.
 *
 * The persistence case that actually matters is the quota. Two photographs as
 * base64 normally fit; when they do not, saying nothing would mean a customer
 * believes their work is safe, refreshes, and finds it gone — the whole failure
 * persistence exists to prevent. So a failed save is reported, and the words
 * are kept even when the bytes cannot be.
 */

import { describe, expect, it } from "vitest";
import {
  bytesOf,
  clearDraft,
  draftKey,
  emptyDraft,
  isComplete,
  loadDraft,
  readDraft,
  saveDraft,
  toFill,
  type Draft,
  type StorageLike,
} from "../lib/editor/draft";
import { DEFAULT_VIEW, MAX_ZOOM, cropFor } from "../lib/editor/view";
import { blockingProblems, validateFill } from "../lib/template/validate";
import { MY_FOREVER } from "../templates/my-forever";
import { LANDSCAPE, PORTRAIT } from "../fixtures/order";
import type { PhotoSlotLayer } from "../lib/template/types";

const LOWER = MY_FOREVER.layers.find(
  (l): l is PhotoSlotLayer => l.kind === "photoSlot" && l.id === "heart-lower",
)!;

const PNG_URL = "data:image/png;base64,aGVsbG8=";

function filled(): Draft {
  const d = emptyDraft(MY_FOREVER);
  d.photos.photoTop = { asset: LANDSCAPE, dataUrl: PNG_URL, view: { zoom: 1.5, cx: 0.4, cy: 0.3 } };
  d.photos.photoBottom = { asset: PORTRAIT, dataUrl: PNG_URL, view: { zoom: 2, cx: 0.6, cy: 0.55 } };
  d.texts = { wordTop: "my", wordBottom: "forever" };
  return d;
}

/** A `localStorage` with a byte budget, which is the only interesting thing about one. */
function storage(limit = Infinity): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      let used = 0;
      for (const [key, value] of map) if (key !== k) used += key.length + value.length;
      if (used + k.length + v.length > limit) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

describe("turning a draft into a fill", () => {
  it("produces a document the print route accepts", () => {
    const fill = toFill(filled(), MY_FOREVER);
    expect(blockingProblems(validateFill(MY_FOREVER, fill))).toEqual([]);
    expect(fill.schema).toBe(1);
    expect(fill.templateId).toBe(MY_FOREVER.id);
    expect(fill.templateRev).toBe(MY_FOREVER.rev);
  });

  it("derives each crop through the editor's own arithmetic", () => {
    // Not a copy of it — the same function. Two ways of working out a crop is
    // two chances for the screen and the print file to disagree.
    const draft = filled();
    const fill = toFill(draft, MY_FOREVER);
    const view = draft.photos.photoBottom.view;
    expect(fill.photos.photoBottom.crop).toEqual(
      cropFor(view, LOWER.frame, { width: PORTRAIT.px[0], height: PORTRAIT.px[1] }),
    );
  });

  it("writes a crop at all, rather than leaving the pan on the floor", () => {
    // The guard against a `toFill` that produced a valid but default document.
    const fill = toFill(filled(), MY_FOREVER);
    const plain = toFill(
      (() => {
        const d = filled();
        d.photos.photoBottom.view = DEFAULT_VIEW;
        return d;
      })(),
      MY_FOREVER,
    );
    expect(fill.photos.photoBottom.crop).not.toEqual(plain.photos.photoBottom.crop);
  });

  it("is still printable when the customer has only started", () => {
    // A half-finished draft is a legitimate state. It must convert to a fill
    // that reports empty slots and nothing worse, which is exactly what
    // `blockingProblems` filters out.
    const d = emptyDraft(MY_FOREVER);
    d.photos.photoTop = { asset: LANDSCAPE, dataUrl: PNG_URL, view: DEFAULT_VIEW };
    const fill = toFill(d, MY_FOREVER);
    expect(blockingProblems(validateFill(MY_FOREVER, fill))).toEqual([]);
    expect(validateFill(MY_FOREVER, fill).map((p) => p.code)).toContain("fill.emptyPhotoSlot");
    expect(Object.keys(fill.photos)).toEqual(["photoTop"]);
  });

  it("drops a slot the template no longer has", () => {
    // Otherwise the fill names a window that does not exist, which is
    // `fill.unknownPhotoSlot` — the print route blocked over a layer the
    // customer cannot see.
    const d = filled();
    (d.photos as Record<string, unknown>)["photoSideways"] = {
      asset: LANDSCAPE,
      dataUrl: PNG_URL,
      view: DEFAULT_VIEW,
    };
    (d.texts as Record<string, string>)["wordMiddle"] = "gone";
    const fill = toFill(d, MY_FOREVER);
    expect(Object.keys(fill.photos).sort()).toEqual(["photoBottom", "photoTop"]);
    expect(Object.keys(fill.texts).sort()).toEqual(["wordBottom", "wordTop"]);
    expect(blockingProblems(validateFill(MY_FOREVER, fill))).toEqual([]);
  });

  it("re-accepts the words on the way out", () => {
    // A stored draft may predate a change to `maxChars` or to what the face can
    // write, and this is the last point before a document the till will judge.
    const d = filled();
    d.texts = { wordTop: "моя my", wordBottom: "forever and ever and ever" };
    const fill = toFill(d, MY_FOREVER);
    expect(fill.texts.wordTop).toBe("my");
    expect(blockingProblems(validateFill(MY_FOREVER, fill))).toEqual([]);
  });

  it("omits a word that came to nothing rather than storing an empty one", () => {
    const d = filled();
    d.texts = { wordTop: "моя", wordBottom: "forever" };
    const fill = toFill(d, MY_FOREVER);
    expect("wordTop" in fill.texts).toBe(false);
  });
});

describe("the bytes to post with the render", () => {
  it("are keyed by the digest the fill names", () => {
    const d = filled();
    expect(Object.keys(bytesOf(d)).sort()).toEqual([LANDSCAPE.sha256, PORTRAIT.sha256].sort());
  });

  it("carry one copy when both windows hold the same photograph", () => {
    const d = emptyDraft(MY_FOREVER);
    d.photos.photoTop = { asset: LANDSCAPE, dataUrl: PNG_URL, view: DEFAULT_VIEW };
    d.photos.photoBottom = { asset: LANDSCAPE, dataUrl: PNG_URL, view: { zoom: 2, cx: 0.3, cy: 0.3 } };
    expect(Object.keys(bytesOf(d))).toEqual([LANDSCAPE.sha256]);
  });

  it("are empty for an empty draft", () => {
    expect(bytesOf(emptyDraft(MY_FOREVER))).toEqual({});
  });
});

describe("knowing whether the page is finished", () => {
  it("is true only when every window and every word is filled", () => {
    expect(isComplete(filled(), MY_FOREVER)).toBe(true);
    expect(isComplete(emptyDraft(MY_FOREVER), MY_FOREVER)).toBe(false);
    for (const key of ["photoTop", "photoBottom"]) {
      const d = filled();
      delete d.photos[key];
      expect(isComplete(d, MY_FOREVER), `without ${key}`).toBe(false);
    }
    for (const key of ["wordTop", "wordBottom"]) {
      const d = filled();
      delete d.texts[key];
      expect(isComplete(d, MY_FOREVER), `without ${key}`).toBe(false);
    }
  });
});

describe("reading back something that may not be what we wrote", () => {
  it("round-trips a draft through JSON unchanged", () => {
    const d = filled();
    expect(readDraft(JSON.parse(JSON.stringify(d)), MY_FOREVER)).toEqual(d);
  });

  it("keeps the work when the template revision has moved on", () => {
    // A view is zoom and a centre in the photograph's own coordinates, so it
    // survives a heart being moved or resized: re-deriving the crop against the
    // new frame is all a new revision needs. Discarding the customer's
    // photographs because a designer nudged a layer would be absurd.
    const stored = { ...filled(), templateRev: "deadbeef" };
    const back = readDraft(JSON.parse(JSON.stringify(stored)), MY_FOREVER);
    expect(Object.keys(back.photos).sort()).toEqual(["photoBottom", "photoTop"]);
    expect(back.texts.wordBottom).toBe("forever");
    expect(back.photos.photoBottom.view).toEqual(stored.photos.photoBottom.view);
  });

  it("discards a draft for a different page", () => {
    const stored = { ...filled(), templateId: "some-other-page" };
    expect(readDraft(JSON.parse(JSON.stringify(stored)), MY_FOREVER)).toEqual(
      emptyDraft(MY_FOREVER),
    );
  });

  it("discards a schema it does not know", () => {
    const stored = { ...filled(), schema: 2 };
    expect(readDraft(JSON.parse(JSON.stringify(stored)), MY_FOREVER)).toEqual(
      emptyDraft(MY_FOREVER),
    );
  });

  it("refuses a photograph whose asset is not a usable address", () => {
    // Each of these would reach `placePhoto` or an `href`, and each is a thing
    // a hand-edited store really contains.
    const broken: Array<[string, unknown]> = [
      ["no digest", { mime: "image/png", px: [10, 10] }],
      ["short digest", { sha256: "abc", mime: "image/png", px: [10, 10] }],
      ["upper case digest", { sha256: "A".repeat(64), mime: "image/png", px: [10, 10] }],
      ["unknown mime", { sha256: "a".repeat(64), mime: "image/gif", px: [10, 10] }],
      ["no px", { sha256: "a".repeat(64), mime: "image/png" }],
      ["zero px", { sha256: "a".repeat(64), mime: "image/png", px: [0, 10] }],
      ["px as strings", { sha256: "a".repeat(64), mime: "image/png", px: ["10", "10"] }],
      ["px too long", { sha256: "a".repeat(64), mime: "image/png", px: [10, 10, 10] }],
      ["asset missing", undefined],
    ];
    for (const [name, asset] of broken) {
      const back = readDraft(
        { schema: 1, templateId: MY_FOREVER.id, templateRev: MY_FOREVER.rev, photos: { photoTop: { asset, dataUrl: PNG_URL, view: DEFAULT_VIEW } }, texts: {} },
        MY_FOREVER,
      );
      expect(Object.keys(back.photos), name).toEqual([]);
    }
  });

  it("refuses bytes that are not a data: URI of an image", () => {
    // This string becomes an `href` in the SVG the page inlines.
    for (const dataUrl of [
      "javascript:alert(1)",
      "https://example.com/photo.png",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/png,notbase64",
      "",
      42,
    ]) {
      const back = readDraft(
        { schema: 1, templateId: MY_FOREVER.id, templateRev: MY_FOREVER.rev, photos: { photoTop: { asset: LANDSCAPE, dataUrl, view: DEFAULT_VIEW } }, texts: {} },
        MY_FOREVER,
      );
      expect(Object.keys(back.photos), String(dataUrl)).toEqual([]);
    }
  });

  it("would have kept a good one, so the refusals above are not vacuous", () => {
    const back = readDraft(
      { schema: 1, templateId: MY_FOREVER.id, templateRev: MY_FOREVER.rev, photos: { photoTop: { asset: LANDSCAPE, dataUrl: PNG_URL, view: DEFAULT_VIEW } }, texts: {} },
      MY_FOREVER,
    );
    expect(Object.keys(back.photos)).toEqual(["photoTop"]);
  });

  it("forces a stored view into range rather than trusting it", () => {
    const back = readDraft(
      {
        schema: 1,
        templateId: MY_FOREVER.id,
        templateRev: MY_FOREVER.rev,
        photos: { photoTop: { asset: LANDSCAPE, dataUrl: PNG_URL, view: { zoom: 400, cx: -2, cy: "x" } } },
        texts: {},
      },
      MY_FOREVER,
    );
    expect(back.photos.photoTop.view).toEqual({ zoom: MAX_ZOOM, cx: 0, cy: 0.5 });
  });

  it("re-accepts stored words", () => {
    const back = readDraft(
      {
        schema: 1,
        templateId: MY_FOREVER.id,
        templateRev: MY_FOREVER.rev,
        photos: {},
        texts: { wordTop: "моя my", wordBottom: "forever and ever and ever", wordGone: "x" },
      },
      MY_FOREVER,
    );
    expect(back.texts.wordTop).toBe("my");
    expect(back.texts.wordBottom.length).toBeLessThanOrEqual(12);
    expect("wordGone" in back.texts).toBe(false);
  });

  it("takes anything at all without throwing", () => {
    for (const junk of [null, undefined, 7, "a string", [], [1, 2], { photos: 1, texts: 2 }, { schema: 1 }]) {
      expect(() => readDraft(junk, MY_FOREVER)).not.toThrow();
      expect(readDraft(junk, MY_FOREVER).templateId).toBe(MY_FOREVER.id);
    }
  });
});

describe("surviving a refresh", () => {
  it("comes back the same", () => {
    const store = storage();
    const d = filled();
    expect(saveDraft(store, d)).toEqual({ saved: true });
    expect(loadDraft(store, MY_FOREVER)).toEqual(d);
  });

  it("is nothing before anything has been saved", () => {
    expect(loadDraft(storage(), MY_FOREVER)).toEqual(emptyDraft(MY_FOREVER));
  });

  it("survives a store holding something that is not JSON", () => {
    const store = storage();
    store.setItem(draftKey(MY_FOREVER.id), "{not json");
    expect(loadDraft(store, MY_FOREVER)).toEqual(emptyDraft(MY_FOREVER));
  });

  it("keeps the words when the photographs will not fit", () => {
    // The case that decides whether a customer is told the truth. The fallback
    // must keep what is small and say what was lost.
    const d = filled();
    const roomForWordsOnly = JSON.stringify({ ...d, photos: {} }).length + draftKey(d.templateId).length + 8;
    const store = storage(roomForWordsOnly);

    const result = saveDraft(store, d);
    expect(result).toEqual({ saved: false, reason: "quota", wordsKept: true });

    const back = loadDraft(store, MY_FOREVER);
    expect(back.texts).toEqual(d.texts);
    expect(back.photos).toEqual({});
  });

  it("says so when not even the words fit", () => {
    const store = storage(4);
    expect(saveDraft(store, filled())).toEqual({ saved: false, reason: "quota", wordsKept: false });
    expect(store.map.size).toBe(0);
  });

  it("says so when there is no store at all", () => {
    // Private browsing, or a server render. Reporting it lets the editor keep
    // quiet rather than promise persistence it does not have.
    expect(saveDraft(null, filled())).toEqual({
      saved: false,
      reason: "unavailable",
      wordsKept: false,
    });
    expect(loadDraft(null, MY_FOREVER)).toEqual(emptyDraft(MY_FOREVER));
  });

  it("does not throw when the store throws on read", () => {
    // Safari in private browsing throws on access, not only on write.
    const hostile: StorageLike = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    };
    expect(() => loadDraft(hostile, MY_FOREVER)).not.toThrow();
    expect(loadDraft(hostile, MY_FOREVER)).toEqual(emptyDraft(MY_FOREVER));
    expect(() => clearDraft(hostile, MY_FOREVER.id)).not.toThrow();
    expect(saveDraft(hostile, filled()).saved).toBe(false);
  });

  it("is cleared on request", () => {
    const store = storage();
    saveDraft(store, filled());
    expect(store.map.size).toBe(1);
    clearDraft(store, MY_FOREVER.id);
    expect(loadDraft(store, MY_FOREVER)).toEqual(emptyDraft(MY_FOREVER));
  });

  it("keys by the page, so two pages cannot overwrite each other", () => {
    expect(draftKey("my-forever")).not.toBe(draftKey("something-else"));
    expect(draftKey("my-forever")).toContain("my-forever");
  });
});
