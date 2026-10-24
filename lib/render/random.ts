/**
 * The only source of randomness the renderer has, and it is not random.
 *
 * A torn tape edge and a lipstick crease need jitter or they look drawn by a
 * machine. `Math.random` would give them that and take away the thing the whole
 * delivery rests on: that a template renders the same bytes every time. The
 * file committed under `data/` would then be evidence of one lucky run, a
 * reprint of a customer's order would not match the first print, and a snapshot
 * test could not exist.
 *
 * `mulberry32` — small, fast, well-distributed enough for wobble, and
 * identical on every platform because it is all 32-bit integer arithmetic.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream of jitter in `[-amount, +amount]`. */
export function jitter(seed: number, amount: number): () => number {
  const rand = mulberry32(seed);
  return () => (rand() * 2 - 1) * amount;
}
