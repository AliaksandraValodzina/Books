/**
 * **The assertion the whole architecture rests on.**
 *
 * A customer pans and zooms a photograph into a heart on screen. Weeks later a
 * printed book arrives. "Is the photograph in the same place" is not a question
 * anybody can answer by reading the code and believing it, so this file answers
 * it by measurement: it composes a draft the way the editor composes one, turns
 * it into a `PageFill` through the editor's own conversion, pushes the bytes
 * through the verification `/api/print` uses, renders the real 3150 × 3150 PNG,
 * and **reads the pixels back out**.
 *
 * The prediction is made independently of the renderer. The photograph carries
 * three small coloured markers at known positions in its own coordinates, and
 * the test works out where each one should land on the page — through
 * `placePhoto`, then through the layer's rotation, then through the scale from
 * points to print pixels — and asserts that colour is there.
 *
 * Every assertion is paired. A view centred on the magenta marker must put
 * magenta at the window's centre *and* must not put green there; the view
 * centred on green must do the opposite. A renderer that ignored the crop
 * entirely, or an editor that computed it wrongly, cannot satisfy both — which
 * a test that only checked "something was drawn" would not notice.
 */

import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { MY_FOREVER } from "../templates/my-forever";
import { renderPrintPng, renderPrintSvg } from "../lib/render/raster";
import { renderPageSvg } from "../lib/render/svg";
import { sha256 } from "../lib/assets/resolve";
import { verifySupplied } from "../lib/assets/supplied";
import { cropFor, MAX_ZOOM } from "../lib/editor/view";
import { bytesOf, emptyDraft, toFill, type Draft } from "../lib/editor/draft";
import { placePhoto, centreOf } from "../lib/template/geometry";
import { blockingProblems, validateFill } from "../lib/template/validate";
import { hexAt, isColour, raster, shareOf, distinctColours } from "./pixels";
import type { AssetRef, Box, PhotoSlotLayer } from "../lib/template/types";

const SLOTS = MY_FOREVER.layers.filter((l): l is PhotoSlotLayer => l.kind === "photoSlot");
const UPPER = SLOTS.find((l) => l.id === "heart-upper")!;
const LOWER = SLOTS.find((l) => l.id === "heart-lower")!;

/**
 * Three markers, at three places in the photograph's own coordinates.
 *
 * Saturated and far apart in RGB so "is this that colour" survives the
 * antialiasing and resampling a 3150 px render puts them through, and so that
 * mistaking one for another is not possible at any tolerance worth using.
 */
const MARKERS = [
  { name: "magenta", hex: "#ff00ff", at: { x: 0.25, y: 0.3 } },
  { name: "green", hex: "#00ff00", at: { x: 0.75, y: 0.7 } },
  { name: "yellow", hex: "#ffff00", at: { x: 0.5, y: 0.5 } },
] as const;

const GROUND = "#303030";

/** A PNG rather than a JPEG: the markers' colours have to be exactly what was painted. */
function syntheticPhoto(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  const put = (x: number, y: number, hex: string) => {
    const i = (width * y + x) << 2;
    png.data[i] = parseInt(hex.slice(1, 3), 16);
    png.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    png.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, GROUND);

  const side = Math.max(8, Math.round(0.05 * Math.min(width, height)));
  for (const marker of MARKERS) {
    const cx = Math.round(marker.at.x * width);
    const cy = Math.round(marker.at.y * height);
    for (let y = cy - side; y <= cy + side; y++) {
      for (let x = cx - side; x <= cx + side; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) put(x, y, marker.hex);
      }
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

function assetFor(bytes: Uint8Array, width: number, height: number): AssetRef {
  return {
    sha256: sha256(bytes),
    mime: "image/png",
    px: [width, height],
    label: "a synthetic photograph with markers in known places",
  };
}

/** A draft shaped exactly as the editor's would be, with no editor involved. */
function draftWith(
  entries: Array<{ slot: string; asset: AssetRef; dataUrl: string; view: { zoom: number; cx: number; cy: number } }>,
): Draft {
  const draft = emptyDraft(MY_FOREVER);
  for (const e of entries) draft.photos[e.slot] = { asset: e.asset, dataUrl: e.dataUrl, view: e.view };
  draft.texts = { wordTop: "my", wordBottom: "forever" };
  return draft;
}

/**
 * Where a point of the photograph lands on the page, predicted without the
 * renderer.
 *
 * `placePhoto` gives the rectangle the whole photograph occupies, so a
 * normalised source point is a simple interpolation inside it — and then the
 * layer's own rotation, which `lib/render/svg.ts` applies as a `rotate` about
 * the centre of `frame`, moves it. Working the rotation out here rather than
 * reading it off the output is the point: it is an independent prediction.
 */
function pageAt(
  layer: PhotoSlotLayer,
  natural: { width: number; height: number },
  view: { zoom: number; cx: number; cy: number },
  source: { x: number; y: number },
): { x: number; y: number } {
  const crop = cropFor(view, layer.frame, natural);
  const place: Box = placePhoto(layer.frame, natural, crop);
  const px = place.x + source.x * place.width;
  const py = place.y + source.y * place.height;

  const degrees = layer.rotation ?? 0;
  if (!degrees) return { x: px, y: py };
  const { cx, cy } = centreOf(layer.frame);
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  };
}

const SIZE = { width: 2400, height: 1800 };
const PHOTO = syntheticPhoto(SIZE.width, SIZE.height);
const ASSET = assetFor(PHOTO, SIZE.width, SIZE.height);
const DATA_URL = `data:image/png;base64,${Buffer.from(PHOTO).toString("base64")}`;

/** The production chain: draft → fill → verified bytes → the real print file. */
async function printDraft(draft: Draft) {
  const fill = toFill(draft, MY_FOREVER);
  const refs = Object.values(fill.photos).map((p) => p.asset);
  const supplied = verifySupplied(refs, bytesOf(draft));
  const result = await renderPrintPng(MY_FOREVER, fill, supplied);
  return { fill, result, raster: raster(result.png, MY_FOREVER) };
}

describe("a photograph placed and panned in the editor", () => {
  it("lands where the editor said it would, in the 3150 px file", async () => {
    // Centre the window on each marker in turn. The marker's own source
    // position becomes the window's centre, so the marker must be at the
    // centre of the heart in the print file — and the other two must not be.
    for (const marker of MARKERS) {
      const view = { zoom: 2, cx: marker.at.x, cy: marker.at.y };
      const { result, raster: r } = await printDraft(
        draftWith([{ slot: LOWER.slot, asset: ASSET, dataUrl: DATA_URL, view }]),
      );
      expect(result.pixels).toEqual({ width: 3150, height: 3150 });

      const { cx, cy } = centreOf(LOWER.frame);
      const got = hexAt(r, cx, cy);
      expect(isColour(got, marker.hex, 30), `${marker.name} at the window centre, got ${got}`).toBe(
        true,
      );

      for (const other of MARKERS) {
        if (other.name === marker.name) continue;
        expect(
          isColour(got, other.hex, 30),
          `${other.name} must not be where ${marker.name} was placed`,
        ).toBe(false);
      }
    }
  });

  it("puts every marker at the page position the arithmetic predicts", async () => {
    // Stronger than the centre check: the position of all three markers is
    // predicted independently — through `placePhoto`, the layer's rotation and
    // the points-to-pixels scale — and read back out of the raster.
    for (const layer of [UPPER, LOWER]) {
      for (const view of [
        { zoom: 1, cx: 0.5, cy: 0.5 },
        { zoom: 1.6, cx: 0.4, cy: 0.45 },
        { zoom: MAX_ZOOM, cx: 0.5, cy: 0.5 },
      ]) {
        const { raster: r } = await printDraft(
          draftWith([{ slot: layer.slot, asset: ASSET, dataUrl: DATA_URL, view }]),
        );

        let checked = 0;
        for (const marker of MARKERS) {
          const at = pageAt(layer, SIZE, view, marker.at);
          // Only markers that actually fall inside the heart's own box can be
          // asserted on; the mask and the card are outside the claim.
          const inside =
            at.x > layer.frame.x + 24 &&
            at.y > layer.frame.y + 40 &&
            at.x < layer.frame.x + layer.frame.width - 24 &&
            at.y < layer.frame.y + layer.frame.height - 36;
          if (!inside) continue;
          checked++;
          const got = hexAt(r, at.x, at.y);
          expect(
            isColour(got, marker.hex, 40),
            `${layer.id} @${view.zoom}/${view.cx},${view.cy}: expected ${marker.name} at ` +
              `(${at.x.toFixed(1)}, ${at.y.toFixed(1)}) pt, got ${got}`,
          ).toBe(true);
        }
        // A loop that checked nothing would pass. At least one marker has to
        // have been inside the heart for the case to mean anything.
        expect(checked, `${layer.id} @${view.zoom}: no marker fell inside the window`).toBeGreaterThan(0);
      }
    }
  });

  it("would notice the crop being ignored", async () => {
    // The paired negative for the two above. If the renderer drew the whole
    // photograph cover-fitted regardless of the crop, a zoomed, panned view
    // and the default view would put the same colour at the window's centre.
    const { cx, cy } = centreOf(LOWER.frame);
    const panned = await printDraft(
      draftWith([
        { slot: LOWER.slot, asset: ASSET, dataUrl: DATA_URL, view: { zoom: 2, cx: 0.25, cy: 0.3 } },
      ]),
    );
    const plain = await printDraft(
      draftWith([
        { slot: LOWER.slot, asset: ASSET, dataUrl: DATA_URL, view: { zoom: 1, cx: 0.5, cy: 0.5 } },
      ]),
    );
    expect(hexAt(panned.raster, cx, cy)).not.toBe(hexAt(plain.raster, cx, cy));
    expect(isColour(hexAt(panned.raster, cx, cy), "#ff00ff", 30)).toBe(true);
    expect(isColour(hexAt(plain.raster, cx, cy), "#ffff00", 30)).toBe(true);
  });

  it("draws the customer's photograph rather than an empty window", async () => {
    // The guard against a suite that would pass if the editor rendered nothing.
    // An unfilled slot is a flat placeholder with a dashed hint; a filled one
    // is a photograph, which has many colours in it.
    const filled = await printDraft(
      draftWith([
        { slot: LOWER.slot, asset: ASSET, dataUrl: DATA_URL, view: { zoom: 1, cx: 0.5, cy: 0.5 } },
      ]),
    );
    const emptyWindow = await printDraft(draftWith([]));

    const region = { x: 300, y: 430, width: 90, height: 80 };
    expect(shareOf(filled.raster, region, GROUND, 24)).toBeGreaterThan(0.3);
    expect(shareOf(emptyWindow.raster, region, GROUND, 24)).toBeLessThan(0.02);
    expect(distinctColours(filled.raster, region)).toBeGreaterThan(
      distinctColours(emptyWindow.raster, region),
    );
  });
});

describe("the screen and the print file, for a fill the editor composed", () => {
  const draft = draftWith([
    { slot: UPPER.slot, asset: ASSET, dataUrl: DATA_URL, view: { zoom: 1.8, cx: 0.3, cy: 0.35 } },
    { slot: LOWER.slot, asset: ASSET, dataUrl: DATA_URL, view: { zoom: 2.2, cx: 0.6, cy: 0.5 } },
  ]);

  it("are the same drawing", async () => {
    // `test/one-renderer.test.ts` proves this for the hard-coded fixture. The
    // editor is a second producer of fills, and the rule has to hold for what
    // it produces too — including the crops it derives from a gesture.
    const fill = toFill(draft, MY_FOREVER);
    const refs = Object.values(fill.photos).map((p) => p.asset);
    const supplied = verifySupplied(refs, bytesOf(draft));

    // The editor's own `href`: the bytes it already holds, as the draft holds
    // them. This is exactly what the browser inlines.
    const screen = renderPageSvg(MY_FOREVER, fill, {
      href: (ref) => bytesOf(draft)[ref.sha256] ?? "",
    });
    const print = await renderPrintSvg(MY_FOREVER, fill, supplied);

    const forget = (svg: string) => {
      let n = 0;
      return svg.replace(/href="[^"]*"/g, () => `href="#${n++}"`);
    };
    expect(forget(print)).toBe(forget(screen));
    // And not trivially equal: the two really do carry addresses.
    expect(screen).toContain("data:image/png;base64,");
  });

  it("composes a fill the print route would accept", async () => {
    const fill = toFill(draft, MY_FOREVER);
    draft.texts = { wordTop: "my", wordBottom: "forever" };
    expect(blockingProblems(validateFill(MY_FOREVER, toFill(draft, MY_FOREVER)))).toEqual([]);
    expect(Object.keys(fill.photos).sort()).toEqual(["photoBottom", "photoTop"]);
  });
});

describe("photographs posted with the request", () => {
  it("are refused when the declared pixel size is not the file's", async () => {
    // The claim whose failure is otherwise silent: `placePhoto` divides by
    // `px`, so a wrong one puts the photograph somewhere else at the wrong
    // scale with every other check green.
    const lying: AssetRef = { ...ASSET, px: [1200, 900] };
    expect(() => verifySupplied([lying], { [lying.sha256]: DATA_URL })).toThrow(
      /supplied\.sizeMismatch/,
    );
  });

  it("are refused when the bytes are not the ones the digest names", () => {
    const other = syntheticPhoto(800, 600);
    expect(() =>
      verifySupplied([ASSET], {
        [ASSET.sha256]: `data:image/png;base64,${Buffer.from(other).toString("base64")}`,
      }),
    ).toThrow(/supplied\.digestMismatch/);
  });

  it("are refused when the fill names a photograph the request did not carry", () => {
    expect(() => verifySupplied([ASSET], {})).toThrow(/supplied\.missing/);
  });

  it("are accepted when every claim checks out", () => {
    const verified = verifySupplied([ASSET], { [ASSET.sha256]: DATA_URL });
    expect(verified.get(ASSET.sha256)).toEqual(PHOTO);
  });
});
