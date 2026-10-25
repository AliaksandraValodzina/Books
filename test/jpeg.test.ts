/**
 * **The JPEG size reader, which decides whether a crop lands where it should.**
 *
 * `placePhoto` divides by an `AssetRef`'s declared `px`. When the customer's
 * browser mints that ref, the declaration arrives over HTTP with the bytes and
 * a wrong one does not fail — it silently puts the photograph somewhere else in
 * a printed book at the wrong scale. `lib/assets/supplied.ts` measures instead,
 * and this is what it measures a JPEG with.
 *
 * The streams below are built byte by byte, because every interesting case is
 * a *shape* of file rather than a picture: a progressive frame, a stream with
 * a fat EXIF segment in front of the size, fill bytes before a marker, a
 * truncated header. A real photograph exercises one of those and the tests
 * would then pass by accident for the rest.
 */

import { describe, expect, it } from "vitest";
import { NotAJpeg, readJpegSize } from "../lib/render/jpeg";

const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];

/** A `SOFn` segment stating a size. */
function sof(marker: number, width: number, height: number): number[] {
  return [0xff, marker, ...u16(17), 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
}

/** Any other segment, with a payload of `length` bytes. */
function segment(marker: number, length: number): number[] {
  return [0xff, marker, ...u16(length + 2), ...new Array(length).fill(0x41)];
}

const SOI = [0xff, 0xd8];
const SOS = [0xff, 0xda, ...u16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0];

const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

describe("reading a JPEG's size", () => {
  it("reads a baseline frame", () => {
    expect(readJpegSize(bytes(SOI, sof(0xc0, 2400, 1800), SOS))).toEqual({
      width: 2400,
      height: 1800,
    });
  });

  it("reads a progressive frame, which a phone often writes", () => {
    expect(readJpegSize(bytes(SOI, sof(0xc2, 3024, 4032), SOS))).toEqual({
      width: 3024,
      height: 4032,
    });
  });

  it("reads every other frame marker, rather than only the common two", () => {
    // A reader that knew only SOF0 and SOF2 would throw on a file `resvg`
    // draws perfectly well, and the request would be refused for no reason.
    for (const marker of [0xc1, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      expect(readJpegSize(bytes(SOI, sof(marker, 640, 480), SOS)), `SOF ${marker.toString(16)}`).toEqual({
        width: 640,
        height: 480,
      });
    }
  });

  it("is not fooled by the markers in that range that are not frames", () => {
    // DHT (c4), DNL (c8) and DAC (cc) share the numeric range and state no
    // size. Reading one as a frame header would return whatever bytes happen
    // to sit at that offset — a plausible, wrong size, which is the worst
    // possible answer here.
    const stream = bytes(SOI, segment(0xc4, 30), segment(0xcc, 8), sof(0xc0, 1234, 567), SOS);
    expect(readJpegSize(stream)).toEqual({ width: 1234, height: 567 });
  });

  it("skips over a fat EXIF block to reach the frame", () => {
    // A phone's APP1 is routinely tens of kilobytes. A reader that scanned for
    // a byte pattern instead of walking the segments would find a false marker
    // inside the thumbnail it contains.
    const exif = segment(0xe1, 40000);
    expect(readJpegSize(bytes(SOI, exif, segment(0xdb, 65), sof(0xc0, 800, 600), SOS))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("tolerates the fill bytes a stream is allowed before a marker", () => {
    expect(readJpegSize(bytes(SOI, [0xff, 0xff, 0xff], sof(0xc0, 100, 50), SOS))).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("steps over a standalone marker, which carries no length", () => {
    expect(readJpegSize(bytes(SOI, [0xff, 0xd0], [0xff, 0x01], sof(0xc0, 64, 32), SOS))).toEqual({
      width: 64,
      height: 32,
    });
  });
});

describe("what it refuses", () => {
  it("refuses bytes that are not a JPEG", () => {
    expect(() => readJpegSize(Uint8Array.from([137, 80, 78, 71]))).toThrow(NotAJpeg);
    expect(() => readJpegSize(Uint8Array.from([]))).toThrow(NotAJpeg);
  });

  it("refuses a stream with no frame header", () => {
    expect(() => readJpegSize(bytes(SOI, segment(0xe0, 14), SOS))).toThrow(/no start-of-frame/);
  });

  it("refuses a truncated frame header rather than reading past the end", () => {
    const whole = bytes(SOI, sof(0xc0, 2400, 1800), SOS);
    expect(() => readJpegSize(whole.subarray(0, whole.length - SOS.length - 12))).toThrow(NotAJpeg);
  });

  it("refuses an impossible segment length instead of looping", () => {
    expect(() => readJpegSize(bytes(SOI, [0xff, 0xe0, 0x00, 0x00], SOS))).toThrow(/impossible/);
  });

  it("refuses a frame that states no pixels", () => {
    expect(() => readJpegSize(bytes(SOI, sof(0xc0, 0, 100), SOS))).toThrow(/states 0x100/);
  });

  it("terminates on every prefix of a real stream", () => {
    // A truncated upload must not hang the route. Every prefix either answers
    // or throws, and none of them spins.
    const whole = bytes(SOI, segment(0xe1, 200), sof(0xc0, 300, 200), SOS, [0x12, 0x34, 0xff, 0xd9]);
    for (let n = 0; n <= whole.length; n++) {
      const prefix = whole.subarray(0, n);
      try {
        const got = readJpegSize(prefix);
        expect(got).toEqual({ width: 300, height: 200 });
      } catch (error) {
        expect(error).toBeInstanceOf(NotAJpeg);
      }
    }
  });
});

describe("against a file that is not a JPEG at all", () => {
  it("refuses the committed print PNG", () => {
    // The realistic misuse: a payload declared `image/jpeg` that is actually a
    // PNG. `supplied.ts` picks its reader from the declared type, so this is
    // the throw that turns a lie about the type into a refusal rather than a
    // measurement of the wrong header.
    const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    expect(() => readJpegSize(signature)).toThrow(NotAJpeg);
  });
});
