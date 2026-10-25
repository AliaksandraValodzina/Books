/**
 * **Photographs that arrive with the request, and everything refused.**
 *
 * `/api/print` is a renderer fed by an untrusted caller, because there is no
 * bucket yet and the editor posts a customer's bytes with the fill. The rule
 * `lib/assets/resolve.ts` is built on — an `AssetRef` is an address *and a
 * claim*, verified against the bytes every time — has to hold for this third
 * store too, or it holds nowhere.
 *
 * `test/editor-to-print.test.ts` proves the accepting path end to end at
 * 3150 px. This file is the refusing path: every shape of wrong a body can be,
 * each asserted on its stable `code` rather than on its sentence.
 */

import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  MAX_PHOTO_BYTES,
  SuppliedAssetRejected,
  verifySupplied,
} from "../lib/assets/supplied";
import { sha256 } from "../lib/assets/resolve";
import type { AssetRef } from "../lib/template/types";

function png(width: number, height: number, tint = 0): Uint8Array {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i + tint) % 255;
    image.data[i + 1] = tint % 255;
    image.data[i + 2] = 128;
    image.data[i + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(image));
}

const BYTES = png(120, 90);
const URL_OF = (b: Uint8Array) => `data:image/png;base64,${Buffer.from(b).toString("base64")}`;
const REF: AssetRef = { sha256: sha256(BYTES), mime: "image/png", px: [120, 90] };

/** The thrown code, which is the part a route and a test both key on. */
function codeOf(refs: AssetRef[], posted: Record<string, unknown>): string {
  try {
    verifySupplied(refs, posted);
    return "accepted";
  } catch (error) {
    if (error instanceof SuppliedAssetRejected) return error.code;
    throw error;
  }
}

describe("a photograph whose every claim checks out", () => {
  it("is accepted, and comes back as the bytes that were sent", () => {
    const got = verifySupplied([REF], { [REF.sha256]: URL_OF(BYTES) });
    expect(got.get(REF.sha256)).toEqual(BYTES);
    expect(got.size).toBe(1);
  });

  it("is resolved once when two windows share it", () => {
    const got = verifySupplied([REF, REF], { [REF.sha256]: URL_OF(BYTES) });
    expect(got.size).toBe(1);
  });

  it("ignores photographs the page does not use", () => {
    // Driven by the refs, not by the body: a caller cannot make the server
    // hash megabytes it was never going to draw.
    const spare = png(4000, 3000, 7);
    const got = verifySupplied([REF], {
      [REF.sha256]: URL_OF(BYTES),
      [sha256(spare)]: URL_OF(spare),
    });
    expect([...got.keys()]).toEqual([REF.sha256]);
  });

  it("accepts an empty list of refs, which is a page with no photographs yet", () => {
    expect(verifySupplied([], {}).size).toBe(0);
  });
});

describe("everything refused", () => {
  it("a photograph the request did not carry", () => {
    expect(codeOf([REF], {})).toBe("supplied.missing");
    expect(codeOf([REF], undefined as unknown as Record<string, unknown>)).toBe("supplied.missing");
  });

  it("a payload that is not a string", () => {
    for (const value of [42, null, {}, []]) {
      expect(codeOf([REF], { [REF.sha256]: value })).toBe("supplied.notAString");
    }
  });

  it("anything that is not a base64 data: URI of an allowed image", () => {
    for (const value of [
      "https://example.com/photo.png",
      "javascript:alert(1)",
      "data:text/html;base64,PHA+",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/gif;base64,R0lGOD==",
      "data:image/png,unencoded",
      "",
    ]) {
      expect(codeOf([REF], { [REF.sha256]: value }), value).toBe("supplied.notADataUrl");
    }
  });

  it("a payload whose declared type is not the fill's", () => {
    // The type picks the reader that measures the bytes, and is handed to the
    // rasteriser as what it is decoding.
    expect(
      codeOf([REF], { [REF.sha256]: `data:image/jpeg;base64,${Buffer.from(BYTES).toString("base64")}` }),
    ).toBe("supplied.mimeMismatch");
  });

  it("bytes that are not the ones the digest names", () => {
    expect(codeOf([REF], { [REF.sha256]: URL_OF(png(120, 90, 99)) })).toBe(
      "supplied.digestMismatch",
    );
  });

  it("a declared pixel size that is not the file's", () => {
    // The claim whose failure is otherwise invisible all the way into a
    // printed book: `placePhoto` divides by it.
    for (const px of [[60, 45], [120, 91], [90, 120]] as Array<[number, number]>) {
      const lying: AssetRef = { ...REF, px };
      expect(codeOf([lying], { [lying.sha256]: URL_OF(BYTES) }), px.join("x")).toBe(
        "supplied.sizeMismatch",
      );
    }
  });

  it("a payload too large to be anything the editor made", () => {
    const huge = "data:image/png;base64," + "A".repeat(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 128);
    expect(codeOf([REF], { [REF.sha256]: huge })).toBe("supplied.tooLarge");
  });

  it("bytes that do not parse as the type they claim", () => {
    const notAnImage = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8]);
    const ref: AssetRef = { sha256: sha256(notAnImage), mime: "image/png", px: [10, 10] };
    expect(codeOf([ref], { [ref.sha256]: URL_OF(notAnImage) })).toBe("supplied.unreadable");
  });

  it("a WebP, because its size cannot be measured here", () => {
    // The format admits WebP and `resvg` draws it, but there is no reader for
    // its header — so accepting one would mean accepting an unverified `px`.
    // Refusing is the honest state; the fix one day is a reader, not an
    // exemption. The editor only ever produces JPEG, so nothing real is lost.
    const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    const ref: AssetRef = { sha256: sha256(bytes), mime: "image/webp", px: [10, 10] };
    expect(codeOf([ref], { [ref.sha256]: URL_OF(bytes).replace("image/png", "image/webp") })).toBe(
      "supplied.unmeasurable",
    );
  });

  it("names the digest it was talking about, truncated", () => {
    try {
      verifySupplied([REF], {});
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(SuppliedAssetRejected);
      expect((error as SuppliedAssetRejected).digest).toBe(REF.sha256);
      expect((error as SuppliedAssetRejected).message).toContain(REF.sha256.slice(0, 12));
      // Never the whole digest in the sentence: it is already the key.
      expect((error as SuppliedAssetRejected).message).not.toContain(REF.sha256);
    }
  });
});
