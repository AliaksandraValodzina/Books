/**
 * The handful of PNG bytes this product actually cares about.
 *
 * Two jobs, and they exist for the same reason: **a claim about a file is not
 * the file.** `readPngSize` reads the size out of the header so a test can
 * assert the print file's dimensions against the bytes rather than against the
 * config value that asked for them; `withSrgbChunk` writes the colour space
 * into the file so "we chose sRGB" is something in the artefact and not only
 * something in a README.
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class NotAPng extends Error {}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Width and height off the IHDR, which a PNG is required to carry first. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (!isPng(bytes)) throw new NotAPng("not a PNG: signature does not match");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== "IHDR") throw new NotAPng(`first chunk is ${type}, not IHDR`);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The chunk types present, in order. Enough to prove sRGB landed where it must. */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  if (!isPng(bytes)) throw new NotAPng("not a PNG: signature does not match");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    types.push(type);
    if (type === "IEND") break;
    at += 12 + length;
  }
  return types;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Stamp the file as sRGB.
 *
 * Printify's guidance is to supply sRGB, and in practice an untagged PNG *is*
 * treated as sRGB by every RIP — but "is treated as" is a convention somebody
 * else maintains, and these thirteen bytes are a fact in our file. Rendering
 * intent 0 is perceptual, which is what a photograph wants.
 *
 * `gAMA` goes with it because the PNG specification asks for it: a reader too
 * old to know `sRGB` still gets the right transfer function instead of guessing
 * one, and a reader that knows both is required to prefer `sRGB`.
 *
 * Inserted immediately after IHDR, which is where the specification requires
 * both to sit — before `PLTE` and before the first `IDAT`. An existing `sRGB`
 * chunk is left alone rather than duplicated.
 */
export function withSrgbChunk(bytes: Uint8Array): Uint8Array {
  if (!isPng(bytes)) throw new NotAPng("not a PNG: signature does not match");
  if (pngChunkTypes(bytes).includes("sRGB")) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrEnd = 8 + 12 + view.getUint32(8);
  const srgb = chunk("sRGB", Uint8Array.from([0]));
  const gama = new Uint8Array(4);
  new DataView(gama.buffer).setUint32(0, 45455); // 1 / 2.2, the sRGB approximation
  const gamaChunk = chunk("gAMA", gama);

  const out = new Uint8Array(bytes.length + srgb.length + gamaChunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0);
  out.set(srgb, ihdrEnd);
  out.set(gamaChunk, ihdrEnd + srgb.length);
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + srgb.length + gamaChunk.length);
  return out;
}
