/**
 * One customer's filling of "My Forever", hard-coded.
 *
 * **This is how the template is tested, and it is deliberately not an editor.**
 * The editor is a separate piece of work; building one to prove the template
 * format renders would be building the second thing to check the first, and the
 * first would end up shaped by it. Two photographs, two words and a crop in a
 * file is the whole of what an editor will eventually produce, so this is the
 * same document that will arrive from one — written by hand.
 *
 * The crops are **not** the whole picture, on purpose. A fixture that left both
 * at the default would exercise the cover-fit path and never the crop path, and
 * the crop path is the one with the arithmetic in it.
 */

import type { AssetRef, PageFill } from "../lib/template/types";
import { MY_FOREVER } from "../templates/my-forever";

/**
 * The two placeholder photographs, by content hash.
 *
 * Minted by `scripts/make-fixture-photos.ts` and committed under
 * `fixtures/assets/`. The digests below are the addresses;
 * `lib/assets/resolve.ts` verifies the bytes against them on every load, so a
 * replaced file fails loudly instead of printing something else.
 */
export const LANDSCAPE: AssetRef = {
  sha256: "d02c142d82c98cd985909f494906d1944ab127a062f093f6787a61d56d8c35b4",
  mime: "image/png",
  px: [1600, 1100],
  label: "fixture — warm landscape",
};

export const PORTRAIT: AssetRef = {
  sha256: "14b9fc70e10edb204c072b830bf6fcc8afbb4574188674e6a170252ca7915ff8",
  mime: "image/png",
  px: [1100, 1500],
  label: "fixture — cool portrait",
};

export const FIXTURE_FILL: PageFill = {
  schema: 1,
  templateId: MY_FOREVER.id,
  templateRev: MY_FOREVER.rev,
  photos: {
    // Pulled in to the middle third: what a pinch-zoom leaves behind.
    photoTop: { asset: LANDSCAPE, crop: { x: 0.22, y: 0.08, width: 0.56, height: 0.74 } },
    // Panned down and left, and not centred — a crop nobody would arrive at by
    // accident, so a renderer that quietly ignored the field would be obvious.
    photoBottom: { asset: PORTRAIT, crop: { x: 0.06, y: 0.3, width: 0.72, height: 0.62 } },
  },
  texts: {
    wordTop: "my",
    wordBottom: "forever",
  },
};

export default FIXTURE_FILL;
