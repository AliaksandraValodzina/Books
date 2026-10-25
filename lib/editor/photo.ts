/**
 * **Getting a phone photograph into the page, without a bucket.**
 *
 * A customer picks a file and it has to become an `AssetRef` — a content hash,
 * a mime type and the file's own pixel size — plus the bytes to draw. There is
 * no upload and no credential in any of it: the bytes are resized in the
 * browser, kept in the tab, and posted with the render request. Storage arrives
 * when orders do, and until then this is the whole of it.
 *
 * Three things happen here that are not obvious and all three are correctness,
 * not polish:
 *
 * **The photograph is re-encoded upright.** A phone writes a sideways sensor
 * and an EXIF `Orientation` tag saying how to turn it. A browser reads that tag
 * and `resvg` does not, so passing the original bytes through would show a
 * customer an upright face and print a sideways one — a screen/print divergence
 * of ninety degrees. `createImageBitmap(..., { imageOrientation: "from-image" })`
 * applies the rotation, and what is stored is the rotated result, with no tag
 * left for the two readers to disagree about.
 *
 * **The digest is of the bytes that are actually drawn.** Not of the file the
 * customer chose — that file is never used again. `lib/assets/resolve.ts` is
 * built on an `AssetRef` being an address *and* a claim, verified against the
 * bytes every time, and `/api/print` re-verifies on arrival. Hashing the wrong
 * buffer would fail that check rather than print wrong, which is the right
 * direction, but it would fail it for every order.
 *
 * **The size is a resolution decision, not a bandwidth one.** See `MAX_EDGE`.
 */

import type { AssetRef } from "../template/types";

/**
 * The longest edge a stored photograph is resized to.
 *
 * Two pressures meet at this number. Larger is sharper: the lower heart is
 * 3.44 inches across, so 300 DPI of it is about 1030 pixels, and a customer who
 * pinches to `MAX_ZOOM` is spending 2.5× that. Smaller survives: the draft
 * lives in `localStorage`, whose quota is a few megabytes, and two photographs
 * that do not fit mean a refresh destroys a customer's work — the exact thing
 * persistence was added to prevent.
 *
 * 2400 keeps two photographs comfortably inside the quota as base64 and lands
 * near 280 DPI at full zoom for the slots on this page. `effectiveDpi` in
 * `./view.ts` reports the real figure for the crop in hand rather than relying
 * on this estimate, and the editor shows it: a customer zooming a long way into
 * a small photograph has a right to know before they pay.
 *
 * Going to a phone's full resolution means moving the bytes to IndexedDB, which
 * has room for them. That is a clean, separable change and is not this task.
 */
export const MAX_EDGE = 2400;

/**
 * JPEG quality.
 *
 * High enough that the compression is not what limits a printed photograph, low
 * enough that two of them fit in the quota. PNG is not an option here: a
 * photograph as PNG is several times the size for no visible gain, and the
 * budget is the binding constraint.
 */
export const QUALITY = 0.82;

export class PhotoUnreadable extends Error {
  constructor(cause?: unknown) {
    super(
      "That file could not be read as a photograph. JPEG, PNG and WebP work; " +
        "a HEIC straight off a camera may not.",
    );
    this.name = "PhotoUnreadable";
    this.cause = cause;
  }
}

/**
 * The size to resize to: inside `maxEdge` on both axes, aspect ratio kept.
 *
 * Pure, and separated from the canvas work so it can be tested without a
 * browser. A photograph already small enough is **left alone** rather than
 * scaled up: enlarging it would add bytes and no detail, and would make the
 * `AssetRef`'s `px` a claim about pixels that were invented.
 */
export function fitWithin(
  natural: { width: number; height: number },
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const w = Math.floor(natural.width);
  const h = Math.floor(natural.height);
  if (!(w > 0 && h > 0)) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (!(maxEdge > 0) || longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  // At least one pixel on each axis: a panorama scaled by its long edge can
  // round its short edge to zero, and a zero-pixel canvas throws.
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export interface PreparedPhoto {
  /** The address and the derived facts, ready to go in a `PageFill`. */
  asset: AssetRef;
  /** The bytes, as a `data:` URI — what the renderer's `href` returns for this ref. */
  dataUrl: string;
  /** What the customer chose, before resizing. Shown so the resize is not a secret. */
  original: { width: number; height: number };
}

async function digestOf(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Of(bytes: Uint8Array): string {
  // Chunked, because spreading a few hundred thousand arguments into
  // `fromCharCode` overflows the call stack on a large photograph.
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

/**
 * A file the customer chose, as something the renderer can draw.
 *
 * **Browser only** — it decodes an image and paints a canvas. The pure half is
 * `fitWithin` above, which is where the arithmetic worth testing lives.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new PhotoUnreadable(cause);
  }

  const original = { width: bitmap.width, height: bitmap.height };
  const target = fitWithin(original);
  if (!(target.width > 0 && target.height > 0)) {
    bitmap.close();
    throw new PhotoUnreadable("the image decoded to no pixels");
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new PhotoUnreadable("no 2d context");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new PhotoUnreadable("the canvas would not encode");

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    asset: {
      sha256: await digestOf(bytes),
      mime: "image/jpeg",
      // Measured from the canvas that produced the bytes, which is the only
      // place these two numbers can come from and still be true of the file.
      px: [target.width, target.height],
      label: "a customer's photograph",
    },
    dataUrl: `data:image/jpeg;base64,${base64Of(bytes)}`,
    original,
  };
}
