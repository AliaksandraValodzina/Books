/**
 * One line of plumbing with a reason to exist.
 *
 * A `Uint8Array` can be backed by a `SharedArrayBuffer`, so TypeScript will not
 * let one be a `BlobPart` — and a response body has to be one. Copying the view
 * into a plain `ArrayBuffer` is the honest fix; the alternative is a cast, and a
 * cast here would be asserting something about memory that is not ours to
 * assert.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}
