/**
 * A JPEG's real pixel size, read out of its frame header.
 *
 * `./png.ts` exists for the same reason and says it best: **a claim about a file
 * is not the file.** An `AssetRef` carries `px` because the renderer needs a
 * photograph's natural size to place a crop and must not decode an image to
 * find out — and that makes `px` a *claim*, written by whoever minted the ref.
 *
 * When the customer's browser mints it, the claim arrives over HTTP with the
 * bytes. `placePhoto` divides by those two numbers, so a wrong `px` does not
 * fail: it silently puts the photograph somewhere else in the printed book,
 * scaled wrongly, with nothing anywhere to notice. `app/api/print/route.ts`
 * measures instead, and this is how it measures a JPEG.
 *
 * It reads the `SOFn` marker and nothing else — no EXIF, no `JFIF` density, no
 * colour transform. Deliberately: `./photo.ts` re-encodes every photograph
 * upright precisely so there is no EXIF orientation left for a browser and
 * `resvg` to disagree about, and a reader that *honoured* orientation here would
 * reintroduce that disagreement at the measuring step.
 */

export class NotAJpeg extends Error {}

/**
 * Markers that carry no payload length and so are skipped by two bytes.
 *
 * `SOI`/`EOI`, the restart markers, and `TEM`. Everything else in a JPEG
 * stream is a segment with a big-endian length immediately after the marker.
 */
function isStandalone(marker: number): boolean {
  return marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/**
 * `SOF0`–`SOF15`, the start-of-frame markers that state the image's size.
 *
 * All of them, not only the baseline `SOF0` and progressive `SOF2`: a
 * lossless or arithmetic-coded frame states its height and width in the same
 * two places, and a reader that recognised only the common pair would throw
 * `NotAJpeg` on a file the rasteriser would have drawn perfectly well.
 * `DHP` (0xc4), `DAC` (0xcc) and `DNL` (0xc8) sit in the same numeric range and
 * are not frame headers, which is the trap in doing this by range alone.
 */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Width and height in pixels, as the frame header states them. */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new NotAJpeg("not a JPEG: no start-of-image marker");
  }

  let at = 2;
  while (at < bytes.length) {
    // Fill bytes: a stream is allowed any number of 0xff before a marker.
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    while (at < bytes.length && bytes[at] === 0xff) at++;
    if (at >= bytes.length) break;
    const marker = bytes[at++];

    if (isStandalone(marker)) continue;
    if (at + 1 >= bytes.length) break;
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2) throw new NotAJpeg(`segment length ${length} is impossible`);

    if (isStartOfFrame(marker)) {
      // length(2) precision(1) height(2) width(2)
      if (at + 7 > bytes.length) throw new NotAJpeg("frame header is truncated");
      const height = (bytes[at + 3] << 8) | bytes[at + 4];
      const width = (bytes[at + 5] << 8) | bytes[at + 6];
      if (!(width > 0 && height > 0)) throw new NotAJpeg(`frame states ${width}x${height}`);
      return { width, height };
    }

    // `SOS` begins entropy-coded data, which is not segment-structured. A frame
    // header always precedes it, so reaching it means there was none.
    if (marker === 0xda) break;
    at += length;
  }
  throw new NotAJpeg("no start-of-frame marker: the file states no size");
}
