/**
 * What has to be true of a template, and of a customer's filling of one.
 *
 * This is the part of the format that has teeth. A format is only a decision if
 * something refuses the documents that break it — otherwise it is a comment.
 *
 * The rule worth naming: **customer content must sit inside the safe area.**
 * The renderer will happily draw a heart whose corner crosses the trim, the
 * screen will show it whole, and the fault appears for the first time on a
 * guillotine in somebody else's building. A check against the *rotated* bounds
 * of every slot is three lines and closes that whole class.
 *
 * Fixed decoration is held to the opposite rule: a background is *expected* to
 * run past the trim and off the artboard, which is what bleed is for.
 */

import { contains, rotatedBounds } from "./geometry";
import { cropOf, safeBox, trimBox } from "./defaults";
import { isKnownFace } from "../render/fonts";
import type { PageFill, PageTemplate } from "./types";

export interface Problem {
  /** Stable, greppable, and what a test asserts on. Never the sentence. */
  code: string;
  where: string;
  detail: string;
}

export function validateTemplate(t: PageTemplate): Problem[] {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  if (t.schema !== 1) say("schema.unknown", t.id, `schema ${t.schema} is not 1`);
  if (!/^[0-9a-f]{8}$/.test(t.rev)) say("rev.malformed", t.id, `rev ${t.rev} is not eight hex`);

  const { canvas, print } = t;
  if (canvas.width <= 0 || canvas.height <= 0) say("canvas.empty", t.id, "canvas has no area");
  if (canvas.bleed < 0 || canvas.safe < 0) say("canvas.negativeInset", t.id, "bleed or safe is negative");
  const trim = trimBox(canvas);
  if (trim.width <= 0 || trim.height <= 0) say("canvas.bleedSwallowsTrim", t.id, "bleed leaves no trim");
  const safe = safeBox(canvas);
  if (safe.width <= 0 || safe.height <= 0) say("canvas.safeSwallowsPage", t.id, "safe leaves no page");

  if (!Number.isInteger(print.pixels.width) || !Number.isInteger(print.pixels.height)) {
    say("print.fractionalPixels", t.id, "print size is not whole pixels");
  }
  // A print file whose proportions differ from the artboard is a page that will
  // be stretched or letterboxed, and neither is visible until it is printed.
  const canvasRatio = canvas.width / canvas.height;
  const printRatio = print.pixels.width / print.pixels.height;
  if (Math.abs(canvasRatio - printRatio) > 1e-6) {
    say("print.aspectMismatch", t.id, `canvas ${canvasRatio} vs print ${printRatio}`);
  }

  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const layer of t.layers) {
    if (ids.has(layer.id)) say("layer.duplicateId", layer.id, "two layers share an id");
    ids.add(layer.id);

    if (layer.kind === "photoSlot" || layer.kind === "textSlot") {
      if (slots.has(layer.slot)) say("slot.duplicateName", layer.slot, "two slots share a name");
      slots.add(layer.slot);

      const bounds = rotatedBounds(layer.frame, layer.rotation ?? 0);
      if (!contains(safe, bounds)) {
        say(
          "slot.outsideSafeArea",
          layer.id,
          `slot "${layer.slot}" reaches ${JSON.stringify(bounds)}, outside ${JSON.stringify(safe)}`,
        );
      }
    }

    if (layer.kind === "textSlot") {
      if (!isKnownFace(layer.font)) {
        say("text.unknownFace", layer.id, `font "${layer.font}" is not in the registry`);
      }
      if (!Number.isInteger(layer.maxChars) || layer.maxChars <= 0) {
        say("text.maxCharsMissing", layer.id, "maxChars must be a positive whole number");
      }
      if (layer.size <= 0) say("text.sizeMissing", layer.id, "size must be positive");
    }
  }

  return problems;
}

/**
 * Is this fill printable against this template?
 *
 * Run before a payment is taken, not after. Everything here is a thing the
 * renderer would otherwise paper over — an over-long word clipped at the edge
 * of the card, a photograph for a window that no longer exists — and papering
 * over is how a wrong book gets into a box.
 */
export function validateFill(t: PageTemplate, f: PageFill): Problem[] {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  if (f.schema !== 1) say("schema.unknown", t.id, `fill schema ${f.schema} is not 1`);
  if (f.templateId !== t.id) say("fill.wrongTemplate", f.templateId, `expected ${t.id}`);
  if (f.templateRev !== t.rev) {
    // Not an error about *drawing*: it draws fine. It is an error about what
    // the customer approved, which is a different document from this one.
    say("fill.staleRevision", f.templateId, `fill is against ${f.templateRev}, template is ${t.rev}`);
  }

  const textSlots = new Map(
    t.layers.flatMap((l) => (l.kind === "textSlot" ? [[l.slot, l] as const] : [])),
  );
  const photoSlots = new Map(
    t.layers.flatMap((l) => (l.kind === "photoSlot" ? [[l.slot, l] as const] : [])),
  );

  for (const [slot, value] of Object.entries(f.texts ?? {})) {
    const layer = textSlots.get(slot);
    if (!layer) {
      say("fill.unknownTextSlot", slot, "the template has no text slot by that name");
      continue;
    }
    if (value.length > layer.maxChars) {
      say("fill.textTooLong", slot, `${value.length} characters, the slot takes ${layer.maxChars}`);
    }
  }

  for (const [slot, photo] of Object.entries(f.photos ?? {})) {
    if (!photoSlots.has(slot)) {
      say("fill.unknownPhotoSlot", slot, "the template has no photo window by that name");
      continue;
    }
    const [w, h] = photo.asset?.px ?? [0, 0];
    if (!(w > 0 && h > 0)) say("fill.photoSizeMissing", slot, "the asset declares no pixel size");
    if (!/^[0-9a-f]{64}$/.test(photo.asset?.sha256 ?? "")) {
      say("fill.photoDigestMalformed", slot, "sha256 is not 64 hex characters");
    }
    const crop = cropOf(photo);
    if (crop.width <= 0 || crop.height <= 0) say("fill.cropEmpty", slot, "crop has no area");
  }

  // An empty window prints as an empty window. It is legitimate while a
  // customer is still working and is never legitimate in an order, so it is
  // reported and left to the caller to decide which of the two it is looking at.
  for (const slot of photoSlots.keys()) {
    if (!f.photos?.[slot]?.asset) say("fill.emptyPhotoSlot", slot, "no photograph chosen");
  }
  for (const [slot, layer] of textSlots) {
    if (!f.texts?.[slot]) say("fill.emptyTextSlot", layer.id, `no words for "${slot}"`);
  }

  return problems;
}

/** Everything except the "nobody has filled this in yet" reports. */
export function blockingProblems(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.code !== "fill.emptyPhotoSlot" && p.code !== "fill.emptyTextSlot");
}
