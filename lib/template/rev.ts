/**
 * A template's revision: eight hex of its own content hash.
 *
 * **Why a template needs one at all.** An order stores `(templateId,
 * templateRev)`. A year later somebody nudges a heart and republishes, and a
 * reprint of that order must either come out as the customer approved it or say
 * plainly that it cannot — and the only way to tell the two apart is for the
 * template to be addressed by what it *is* rather than by what it is called.
 * Keepnook makes the same move one level down, where `ArtEntry.rev` means "a
 * pack update cannot repaint a page that already exists".
 *
 * **Derived, and checked.** `test/template.test.ts` asserts the declared `rev`
 * equals the computed one, so editing the template without restamping it is a
 * failing test rather than a quiet lie. `npm run print` restamps it.
 *
 * The hash is over a **canonical** serialisation — keys sorted at every depth —
 * because `JSON.stringify` preserves insertion order, and moving a line in the
 * source without changing a value would otherwise change the revision.
 */

import { createHash } from "node:crypto";
import type { PageTemplate } from "./types";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The revision this template's content implies, with its own `rev` excluded. */
export function templateRev(t: PageTemplate): string {
  const { rev: _ignored, ...rest } = t;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 8);
}

export function isStamped(t: PageTemplate): boolean {
  return t.rev === templateRev(t);
}
