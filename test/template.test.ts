/**
 * The template, and the checks that give the format teeth.
 *
 * Each rule is asserted twice: once that the real page satisfies it, and once
 * that a page which breaks it is caught. The first half alone would pass for a
 * validator that returned an empty array unconditionally, which is the most
 * common way a validator stops working without anybody noticing.
 */

import { describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { templateRev } from "../lib/template/rev";
import { validateTemplate } from "../lib/template/validate";
import { safeBox, trimBox } from "../lib/template/defaults";
import type { PageTemplate, PhotoSlotLayer } from "../lib/template/types";

const codes = (t: PageTemplate) => validateTemplate(t).map((p) => p.code);

describe("My Forever", () => {
  it("is stamped with its own content hash", () => {
    // Edit the template without restamping and this fails, which is the only
    // thing keeping an order's (templateId, rev) honest.
    expect(MY_FOREVER.rev).toBe(templateRev(MY_FOREVER));
  });

  it("has no problems", () => {
    expect(validateTemplate(MY_FOREVER)).toEqual([]);
  });

  it("is 3150 px across a 10.5 inch artboard, which is 300 DPI", () => {
    expect(MY_FOREVER.canvas.width).toBe(756);
    expect(MY_FOREVER.print.pixels).toEqual({ width: 3150, height: 3150 });
    expect((MY_FOREVER.print.pixels.width / MY_FOREVER.canvas.width) * 72).toBe(300);
  });

  it("keeps every window and word inside the safe area", () => {
    const safe = safeBox(MY_FOREVER.canvas);
    expect(safe).toEqual({ x: 36, y: 36, width: 684, height: 684 });
    expect(codes(MY_FOREVER)).not.toContain("slot.outsideSafeArea");
  });

  it("runs the ground past the trim, which is what bleed is for", () => {
    const cloth = MY_FOREVER.layers.find((l) => l.id === "cloth")!;
    const trim = trimBox(MY_FOREVER.canvas);
    expect(cloth.frame.x).toBeLessThan(trim.x);
    expect(cloth.frame.x + cloth.frame.width).toBeGreaterThan(trim.x + trim.width);
  });
});

describe("the validator catches", () => {
  it("a slot that has drifted outside the safe area", () => {
    const moved: PageTemplate = {
      ...MY_FOREVER,
      layers: MY_FOREVER.layers.map((l) =>
        l.id === "heart-upper" ? { ...l, frame: { ...l.frame, x: 10 } } : l,
      ),
    };
    expect(codes(moved)).toContain("slot.outsideSafeArea");
  });

  it("a slot whose *rotated* corner crosses it, though its box does not", () => {
    // The reason `rotatedBounds` exists. The box below sits just inside the
    // safe area; turned forty degrees, a corner does not.
    const safe = safeBox(MY_FOREVER.canvas);
    const slot: PhotoSlotLayer = {
      id: "probe",
      kind: "photoSlot",
      slot: "probe",
      frame: { x: safe.x + 1, y: safe.y + 1, width: 200, height: 60 },
      mask: { kind: "rect" },
    };
    const upright: PageTemplate = { ...MY_FOREVER, layers: [slot] };
    const turned: PageTemplate = { ...MY_FOREVER, layers: [{ ...slot, rotation: 40 }] };
    expect(codes(upright)).not.toContain("slot.outsideSafeArea");
    expect(codes(turned)).toContain("slot.outsideSafeArea");
  });

  it("two layers sharing an id", () => {
    const clash: PageTemplate = {
      ...MY_FOREVER,
      layers: [...MY_FOREVER.layers, { ...MY_FOREVER.layers[0] }],
    };
    expect(codes(clash)).toContain("layer.duplicateId");
  });

  it("two slots sharing a name", () => {
    const upper = MY_FOREVER.layers.find((l) => l.id === "heart-upper") as PhotoSlotLayer;
    const clash: PageTemplate = {
      ...MY_FOREVER,
      layers: [...MY_FOREVER.layers, { ...upper, id: "heart-upper-2" }],
    };
    expect(codes(clash)).toContain("slot.duplicateName");
  });

  it("a face the registry has never heard of", () => {
    const unknown: PageTemplate = {
      ...MY_FOREVER,
      layers: MY_FOREVER.layers.map((l) =>
        l.kind === "textSlot" ? { ...l, font: "Comic Sans MS" } : l,
      ),
    };
    expect(codes(unknown)).toContain("text.unknownFace");
  });

  it("a print size whose proportions do not match the artboard", () => {
    const stretched: PageTemplate = {
      ...MY_FOREVER,
      print: { ...MY_FOREVER.print, pixels: { width: 3150, height: 2400 } },
    };
    expect(codes(stretched)).toContain("print.aspectMismatch");
  });

  it("a print size that is not whole pixels", () => {
    const fractional: PageTemplate = {
      ...MY_FOREVER,
      print: { ...MY_FOREVER.print, pixels: { width: 3150.5, height: 3150.5 } },
    };
    expect(codes(fractional)).toContain("print.fractionalPixels");
  });

  it("a revision that is not eight hex", () => {
    expect(codes({ ...MY_FOREVER, rev: "nope" })).toContain("rev.malformed");
  });

  it("bleed that has eaten the whole page", () => {
    const drowned: PageTemplate = {
      ...MY_FOREVER,
      canvas: { ...MY_FOREVER.canvas, bleed: 400 },
    };
    expect(codes(drowned)).toContain("canvas.bleedSwallowsTrim");
  });
});

describe("the revision", () => {
  it("changes when anything in the template changes", () => {
    const nudged: PageTemplate = {
      ...MY_FOREVER,
      layers: MY_FOREVER.layers.map((l) =>
        l.id === "kiss" ? { ...l, frame: { ...l.frame, x: l.frame.x + 1 } } : l,
      ),
    };
    expect(templateRev(nudged)).not.toBe(templateRev(MY_FOREVER));
  });

  it("does not change when a key is merely written in a different order", () => {
    // The whole reason the hash is over a canonical serialisation: moving a
    // line in the source must not republish the template.
    const reordered: PageTemplate = {
      layers: MY_FOREVER.layers,
      print: MY_FOREVER.print,
      canvas: MY_FOREVER.canvas,
      name: MY_FOREVER.name,
      id: MY_FOREVER.id,
      rev: MY_FOREVER.rev,
      schema: MY_FOREVER.schema,
    };
    expect(templateRev(reordered)).toBe(templateRev(MY_FOREVER));
  });
});
