/**
 * A book's revision: eight hex of its own content hash.
 *
 * `lib/template/rev.ts` makes the whole argument for a page and every word of
 * it applies here, one level up: an order stores `(bookId, bookRev)`, somebody
 * later moves a name slot and republishes, and a reprint must either come out
 * as the buyer approved it or say plainly that it cannot.
 *
 * It reuses `canonicalJson` rather than re-deriving it. Two canonicalisers is
 * two definitions of "the same book", and the day they disagreed a reprint
 * would silently be a different document.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../template/rev";
import type { BookTemplate } from "./types";

/** The revision this book's content implies, with its own `rev` excluded. */
export function bookRev(b: BookTemplate): string {
  const { rev: _ignored, ...rest } = b;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 8);
}

export function isStamped(b: BookTemplate): boolean {
  return b.rev === bookRev(b);
}
