/**
 * The customer's half of the format: what is refused, and what is forgiven.
 *
 * The two are the same subject seen from either side. A fill is **refused** for
 * the things a renderer would otherwise paper over — a word too long for its
 * slot, a photograph for a window that no longer exists — because papering over
 * is how a wrong book gets into a box. A fill is **forgiven** its malformed
 * optional fields, because a page half drawn is worse than a page drawn with a
 * default, and a stored document can always come from a newer build.
 */

import { describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { blockingProblems, validateFill } from "../lib/template/validate";
import { cropOf, lineHeightOf, maskOf, opacityOf, rotationOf, textOf } from "../lib/template/defaults";
import type { Crop, Mask, PageFill } from "../lib/template/types";

const codes = (f: PageFill) => validateFill(MY_FOREVER, f).map((p) => p.code);

describe("the fixture order", () => {
  it("is printable", () => {
    expect(blockingProblems(validateFill(MY_FOREVER, FIXTURE_FILL))).toEqual([]);
  });

  it("names the exact revision it was composed against", () => {
    expect(FIXTURE_FILL.templateRev).toBe(MY_FOREVER.rev);
    expect(codes(FIXTURE_FILL)).not.toContain("fill.staleRevision");
  });

  it("crops both photographs rather than leaving them whole", () => {
    // A fixture that used the default crop everywhere would exercise the
    // cover-fit path and never the arithmetic. See test/crop.test.ts.
    for (const photo of Object.values(FIXTURE_FILL.photos)) {
      expect(photo.crop).toBeDefined();
      expect(photo.crop!.width).toBeLessThan(1);
    }
  });
});

describe("a fill is refused when", () => {
  it("a word is longer than its slot takes", () => {
    const shouty = { ...FIXTURE_FILL, texts: { ...FIXTURE_FILL.texts, wordBottom: "f".repeat(40) } };
    expect(codes(shouty)).toContain("fill.textTooLong");
  });

  it("it carries a word for a slot the template does not have", () => {
    const stray = { ...FIXTURE_FILL, texts: { ...FIXTURE_FILL.texts, wordMiddle: "and" } };
    expect(codes(stray)).toContain("fill.unknownTextSlot");
  });

  it("it carries a photograph for a window the template does not have", () => {
    const stray = {
      ...FIXTURE_FILL,
      photos: { ...FIXTURE_FILL.photos, photoMiddle: FIXTURE_FILL.photos.photoTop },
    };
    expect(codes(stray)).toContain("fill.unknownPhotoSlot");
  });

  it("a digest is not a digest", () => {
    const bad = {
      ...FIXTURE_FILL,
      photos: {
        ...FIXTURE_FILL.photos,
        photoTop: {
          ...FIXTURE_FILL.photos.photoTop,
          asset: { ...FIXTURE_FILL.photos.photoTop.asset, sha256: "beef" },
        },
      },
    };
    expect(codes(bad)).toContain("fill.photoDigestMalformed");
  });

  it("it was composed against a template that has since changed", () => {
    expect(codes({ ...FIXTURE_FILL, templateRev: "deadbeef" })).toContain("fill.staleRevision");
  });

  it("it is for another template entirely", () => {
    expect(codes({ ...FIXTURE_FILL, templateId: "page-two" })).toContain("fill.wrongTemplate");
  });
});

describe("an unfinished fill", () => {
  const empty: PageFill = {
    schema: 1,
    templateId: MY_FOREVER.id,
    templateRev: MY_FOREVER.rev,
    photos: {},
    texts: {},
  };

  it("reports every empty slot", () => {
    const got = codes(empty);
    expect(got.filter((c) => c === "fill.emptyPhotoSlot")).toHaveLength(2);
    expect(got.filter((c) => c === "fill.emptyTextSlot")).toHaveLength(2);
  });

  it("is not *blocked* by them — somebody is still working on it", () => {
    expect(blockingProblems(validateFill(MY_FOREVER, empty))).toEqual([]);
  });
});

describe("the tolerant readers forgive", () => {
  it("a missing crop, which is the whole picture", () => {
    expect(cropOf(undefined)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(cropOf({})).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("a crop that runs off the edge of the picture", () => {
    const over = cropOf({ crop: { x: 0.8, y: 0.8, width: 0.9, height: 0.9 } });
    expect(over.x + over.width).toBeLessThanOrEqual(1);
    expect(over.y + over.height).toBeLessThanOrEqual(1);
  });

  it("a crop with nonsense in it, rather than dividing by it", () => {
    const nonsense = cropOf({ crop: { x: NaN, y: -5, width: 0, height: 0 } as unknown as Crop });
    expect(nonsense).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("a mask kind from the future, by drawing the plain box", () => {
    expect(maskOf({ kind: "trefoil" } as unknown as Mask)).toEqual({ kind: "rect" });
    expect(maskOf(undefined)).toEqual({ kind: "rect" });
    // And does not quietly rewrite one it does understand.
    expect(maskOf({ kind: "heart", cleft: 0.3 })).toEqual({ kind: "heart", cleft: 0.3 });
  });

  it("an opacity or rotation that is not a number", () => {
    expect(opacityOf({ opacity: "half" as unknown as number })).toBe(1);
    expect(opacityOf({ opacity: 4 })).toBe(1);
    expect(opacityOf({ opacity: -2 })).toBe(0);
    expect(rotationOf({ rotation: undefined })).toBe(0);
  });

  it("a line height that is missing or impossible", () => {
    expect(lineHeightOf({ size: 50 })).toBe(60);
    expect(lineHeightOf({ size: 50, lineHeight: 0 })).toBe(60);
    expect(lineHeightOf({ size: 50, lineHeight: 70 })).toBe(70);
  });

  it("but does not forgive a transform it was told to apply", () => {
    expect(textOf({ transform: "uppercase" }, "forever")).toBe("FOREVER");
    expect(textOf({ transform: "none" }, "forever")).toBe("forever");
    expect(textOf({}, "forever")).toBe("forever");
  });
});
