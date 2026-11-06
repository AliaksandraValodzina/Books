/**
 * **The dedication: what may be typed into a slot that has more than one
 * line.**
 *
 * `./text.ts` handles a slot holding a word. A dedication is prose a buyer
 * writes in a box and presses Return in, and it brings one failure the word
 * never could:
 *
 * **A line limit is not a character limit.** Eighty characters fit a two-line
 * box. Eighty characters as twelve lines of one word do not, and
 * `drawTextSlot` sets each line `lineHeight` below the last without ever
 * looking at where the box ends — so line eleven is printed somewhere past the
 * bottom edge of the page. Nobody sees that in a preview of a shrunken page,
 * and nobody can do anything about it once the book is in a box. Wonderbly's
 * dedication screen enforces **ten lines, a live character count and a warning
 * to check the preview**, which is what the research says to copy exactly.
 *
 * So: both limits, clamped as the buyer types, counted live, and enforced again
 * by `./validate.ts` before money changes hands and by the renderer itself
 * (`TextOverflows`). Three enforcements of one rule, for the reasons
 * `TextSlotLayer.maxLines` lays out.
 *
 * **Clamping is right here and refusing is right for a name.** A dedication is
 * prose with a visible counter running down — a buyer watching it hit zero
 * understands exactly what happened and writes something shorter. A *name* is
 * not prose: silently shortening "Zoé" to "Zo" produces a different child's
 * name on every printed page it appears on, which is why `lib/book/name.ts` refuses
 * instead. The two behaviours are not an inconsistency; they are the same
 * principle applied to two different kinds of value.
 *
 * The contract the tests hold this to, exactly as `./text.ts`'s: **no input,
 * however pathological, produces a fill the validator or the renderer would
 * refuse.**
 */

import { maxCharsPerLineOf, maxLinesOf, measuredLength } from "../template/defaults";
import { unsettable } from "../render/coverage";
import type { TextSlotLayer } from "../template/types";
import { clampToUnits, stripInvisible } from "./text";

export interface AcceptedLines {
  /** What the slot should hold. Always safe to store, to validate and to print. */
  text: string;
  /** Distinct characters dropped because the face cannot write them. */
  unsettable: string[];
  /** Characters were dropped to reach `maxChars`. */
  truncated: boolean;
  /** Whole lines were dropped to reach `maxLines`. */
  linesDropped: boolean;
  /** Lines in `text`. What the counter shows. */
  lines: number;
  /** Characters in `text`, measured the way the limit measures them. */
  chars: number;
}

/**
 * Tab, vertical tab and form feed — \u0009, \u000b and \u000c.
 *
 * Turned into a space rather than deleted, for `./text.ts`'s reason: they
 * separate words, and deleting one joins two words the buyer never joined.
 * Carriage return is handled before this, by normalising it into \n.
 *
 * Written as escapes rather than as the characters themselves, because the
 * characters themselves are exactly the ones a diff and a review cannot show
 * you.
 */
const INLINE_CONTROL = /[\u0009\u000b\u000c]/g;

/**
 * A slot's text, tidied, with the line structure kept.
 *
 * Every run of spaces inside a line collapses and every line is trimmed, which
 * is `./text.ts`'s rule applied per line: a trailing space is invisible on
 * screen and shifts a centred line off centre in the print file. Three or more
 * newlines collapse to two, so a buyer cannot push their last line off the page
 * with blank ones — the commonest way a ten-line limit is reached by accident.
 */
function tidyLines(raw: string): string {
  return stripInvisible(raw.replace(/\r\n?/g, "\n"))
    .replace(INLINE_CONTROL, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * One line broken into lines of at most `columns` characters.
 *
 * **Wrapping, not refusing**, and the distinction is the one
 * `TextSlotLayer.maxCharsPerLine` argues: a buyer typing prose into a box
 * expects it to flow, and breaking it at the last space before the limit is
 * what every text box they have ever used does. Refusing would be correct and
 * unbearable.
 *
 * It breaks at the last space inside the limit, and **mid-word only when there
 * is no space to break at** — a single unbroken sixty-character string is
 * either a URL or a cat on the keyboard, and in both cases a hard break is
 * better than a line set off both sides of a printed page.
 *
 * Character counting, not measurement. The seam named at the top of
 * `lib/render/svg.ts` is why: two shapers disagree about advance widths by
 * fractions of a point, so a wrap decided by measurement would be made
 * differently by the browser and by `resvg` — and the print file is where the
 * difference would appear.
 */
function wrap(line: string, columns: number): string[] {
  if (line.length <= columns) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > columns) {
    const window = rest.slice(0, columns + 1);
    const at = window.lastIndexOf(" ");
    const cut = at > 0 ? at : columns;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(at > 0 ? cut + 1 : cut).trimStart();
  }
  if (rest.length) out.push(rest);
  return out;
}

/**
 * What a multi-line slot should hold, given what the buyer typed.
 *
 * The order is tidy → drop what the face cannot write → clamp lines → clamp
 * characters → tidy again, and each step is where it is for the reason
 * `./text.ts`'s `accept` gives: clamping last means a dropped emoji does not
 * eat a character out of the buyer's budget, and the final tidy catches the
 * whitespace the middle steps strand at an edge.
 *
 * The coverage check is run on the text with its **newlines taken out**. A line
 * break is not a character the face has to be able to write, and neither
 * vendored TTF maps U+000A — so checking it directly would tell every buyer who
 * pressed Return that the page cannot write an invisible character.
 */
export function acceptLines(
  layer: Pick<TextSlotLayer, "font" | "maxChars" | "maxLines" | "transform">,
  raw: string,
): AcceptedLines {
  const tidied = tidyLines(typeof raw === "string" ? raw : "");
  const bad = unsettable(layer.font, tidied.replace(/\n/g, " "));
  const settable =
    bad.length === 0 ? tidied : [...tidied].filter((ch) => !bad.includes(ch)).join("");

  const limit = maxLinesOf(layer);
  const all = tidyLines(settable)
    .split("\n")
    .flatMap((line) => wrap(line, maxCharsPerLineOf(layer)));
  const kept = all.slice(0, limit);
  const linesDropped = all.length > kept.length;

  const { text: clamped, truncated } = clampToUnits(kept.join("\n"), layer.maxChars);
  const text = tidyLines(clamped);

  return {
    text,
    unsettable: bad,
    truncated,
    linesDropped,
    lines: text === "" ? 0 : text.split("\n").length,
    chars: measuredLength(layer, text),
  };
}

/**
 * The sentence shown when something was refused, or null.
 *
 * Phrased as what would have happened to the *book*, not to the string: a buyer
 * does not care that a `cmap` lacks a codepoint, they care that there would be a
 * gap in their dedication. `./text.ts`'s `explain` makes the same argument.
 */
export function explainLines(accepted: AcceptedLines, faceName: string): string | null {
  const parts: string[] = [];
  if (accepted.unsettable.length) {
    const chars = accepted.unsettable.map((c) => `“${c}”`).join(" ");
    parts.push(
      `${faceName} cannot write ${chars}, so ${
        accepted.unsettable.length === 1 ? "it" : "they"
      } would print as a gap. Latin letters, numbers and punctuation for now.`,
    );
  }
  if (accepted.linesDropped) parts.push("That is as many lines as the page holds.");
  else if (accepted.truncated) parts.push("That is as much as fits on the page.");
  return parts.length ? parts.join(" ") : null;
}
