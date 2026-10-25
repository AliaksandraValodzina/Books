/**
 * **What the editor will let a customer type, and why it refuses the rest.**
 *
 * Three separate limits meet in one function, and each one exists because
 * breaking it produces a *printed book* that is wrong rather than a screen that
 * is wrong:
 *
 * **1. Length.** `TextSlotLayer.maxChars` is a refusal, not a shrink — see
 * `docs/template-format.md` § The text that did not fit for why auto-fitting is
 * the one thing the two renderers cannot agree on. `lib/template/validate.ts`
 * measures it in UTF-16 code units, which is what `String.length` is, so the
 * editor must clamp to the same measure or it will happily compose a fill that
 * `/api/print` then refuses — the customer's work accepted and then rejected at
 * the till, which is the worst possible place to find out.
 *
 * **2. Grapheme boundaries.** Clamping by code unit alone can cut a surrogate
 * pair in half or take an accent off its letter, leaving a broken character in
 * the document. So clamping walks whole grapheme clusters and stops before the
 * one that would not fit: never more than `maxChars` code units, and never a
 * split character.
 *
 * **3. What the face can write.** The rasteriser has no font fallback and the
 * browser has one, so a Cyrillic letter or an emoji looks fine on screen and
 * prints as nothing at all. `lib/render/coverage.ts` carries the measurement
 * and the argument; this module is where a keystroke meets it.
 *
 * The contract the tests hold this to: **no input, however pathological,
 * produces a fill `validateFill` would refuse.** `test/editor-text.test.ts`
 * asserts that against the real validator rather than against a copy of its
 * rule.
 */

import { unsettable } from "../render/coverage";
import type { TextSlotLayer } from "../template/types";

export interface Accepted {
  /** What the slot should hold. Always safe to store and to print. */
  text: string;
  /** Characters removed because the face cannot write them, first appearance order. */
  unsettable: string[];
  /** True when the input was cut short by `maxChars`. */
  truncated: boolean;
}

/**
 * Whole user-perceived characters.
 *
 * `Intl.Segmenter` is in every browser this product targets and in Node 18 up,
 * but it is behind a capability check anyway: the fallback splits by codepoint,
 * which keeps surrogate pairs whole — the case that actually corrupts a
 * document — and merely counts a flag emoji as two. Degrading to *slightly
 * stricter* is the right direction for a limit to fail in.
 */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter === "function") {
    return [...new Segmenter("en", { granularity: "grapheme" }).segment(text)].map(
      (s) => s.segment,
    );
  }
  return [...text];
}

/**
 * Everything a single-line slot on a printed page must not carry.
 *
 * Newlines go because `drawTextSlot` splits on them and would set a second
 * baseline inside a box a designer sized for one line, pushing a word through
 * the bottom of the card. The rest go because they are **invisible**: they
 * change what the string *is* while looking like nothing was typed, and an
 * invisible character inside a word is a bug report nobody can describe.
 *
 * Written as escapes rather than as the characters themselves, because the
 * characters themselves are exactly the ones a diff, a terminal and a review
 * cannot show you.
 *
 *   \u0000-\u0008  C0 controls below tab
 *   \u000e-\u001f  C0 controls above carriage return
 *   \u007f-\u009f  DEL and the C1 controls
 *   \u00ad         soft hyphen
 *   \u034f         combining grapheme joiner
 *   \u061c         Arabic letter mark
 *   \u200b-\u200f  zero-width space, the joiners, the LTR/RTL marks
 *   \u202a-\u202e  the bidi embedding and override controls
 *   \u2060-\u206f  word joiner, invisible operators, deprecated format chars
 *   \ufe00-\ufe0f  variation selectors
 *   \ufeff         byte order mark
 *   \ufff9-\ufffb  interlinear annotation
 *
 * Stripping the variation selectors also keeps `explain` readable: without it a
 * customer who pasted a joined emoji would be told the page cannot write
 * "\ufe0f" — a message whose subject is invisible, which is no message at all.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff\ufff9-\ufffb]/g;

/**
 * Tab, the newlines, vertical tab and form feed — \u0009-\u000d.
 *
 * Held out of `INVISIBLE` and turned into a **space** rather than deleted,
 * because a newline is a word boundary. Deleting it turns "my\nlove" into
 * "mylove": a word the customer never typed, in a slot short enough that it
 * fits, so nothing refuses it and nobody looks for it. Everything left in
 * `INVISIBLE` separates nothing, so deleting those is right.
 */
const WHITESPACE_CONTROL = /[\u0009-\u000d]/g;

/** Runs of whitespace collapse to one space, and the ends are trimmed. */
function tidy(raw: string): string {
  return raw
    .replace(WHITESPACE_CONTROL, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clamp `text` to `maxChars` **code units** without splitting a character.
 *
 * Exported because the counter the editor shows a customer has to agree with
 * the limit that is enforced, and two functions that each work out "how much
 * fits" is two chances to disagree in front of a paying customer.
 */
export function clampToUnits(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  const limit = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 0;
  if (text.length <= limit) return { text, truncated: false };
  let out = "";
  for (const cluster of graphemes(text)) {
    if (out.length + cluster.length > limit) break;
    out += cluster;
  }
  return { text: out, truncated: true };
}

/**
 * What this slot should hold, given what the customer typed.
 *
 * Unsettable characters are **dropped rather than replaced**. Substituting a
 * question mark would put a mark on the page the customer did not choose and
 * might not notice until it was printed; dropping it, with the editor saying
 * which character went and why, leaves them in charge of their own word.
 *
 * The order is deliberate: tidy, then drop what cannot be set, then clamp.
 * Clamping last means a dropped emoji does not eat a character out of a
 * customer's budget of eight — they get eight *printable* ones.
 *
 * Tidying happens **again at the end**, because both of the middle steps can
 * leave whitespace stranded at an edge: dropping the Cyrillic out of "my дом"
 * leaves "my ", and clamping "forever and ever" to eight leaves "forever ".
 * A trailing space is invisible on screen and shifts a centred word off centre
 * in the print file, which is the kind of error that is only ever found in a
 * finished book.
 */
export function accept(layer: Pick<TextSlotLayer, "font" | "maxChars">, raw: string): Accepted {
  const tidied = tidy(typeof raw === "string" ? raw : "");
  const bad = unsettable(layer.font, tidied);
  const settable =
    bad.length === 0 ? tidied : [...tidied].filter((ch) => !bad.includes(ch)).join("");
  const { text, truncated } = clampToUnits(tidy(settable), layer.maxChars);
  return { text: tidy(text), unsettable: bad, truncated };
}

/**
 * The sentence the editor shows when something was refused, or null.
 *
 * Written here rather than in the component so the reason and the rule cannot
 * drift apart, and phrased as what would have happened to the *book* — a
 * customer does not care that a `cmap` lacks a codepoint, they care that there
 * would be a gap in their word.
 */
export function explain(accepted: Accepted, faceName: string): string | null {
  const parts: string[] = [];
  if (accepted.unsettable.length) {
    const chars = accepted.unsettable.map((c) => `“${c}”`).join(" ");
    parts.push(
      `${faceName} cannot write ${chars}, so ${
        accepted.unsettable.length === 1 ? "it" : "they"
      } would print as a gap. Latin letters, numbers and punctuation for now.`,
    );
  }
  if (accepted.truncated) parts.push("That is as much as fits on the page.");
  return parts.length ? parts.join(" ") : null;
}
