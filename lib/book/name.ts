/**
 * **The baby's name, which is refused rather than quietly changed.**
 *
 * This is the one field in the product where the font-coverage guard earns its
 * whole existence, and the reason is in the captain's own specification: *"a
 * name goes on the pages."* The failure runs like this. The rasteriser is
 * loaded with `loadSystemFonts: false` and the two vendored TTFs, so a
 * codepoint neither carries prints as **nothing at all**. A browser does the
 * opposite — give it `font-family: "Indie Flower"` and a Cyrillic letter and it
 * substitutes whatever face the device has, and the name looks perfect. The
 * buyer approves a cover they can read and a hardback arrives with a hole in
 * their child's name on six pages.
 *
 * **So an unwritable name is refused at the keystroke, with a sentence saying
 * why, and nothing is substituted and nothing is dropped.**
 *
 * That is a deliberate departure from `lib/editor/text.ts`, which *drops*
 * characters it cannot set, and from `lib/editor/lines.ts`, which clamps a
 * dedication as it is typed. Both are right for what they handle: a word on a
 * scrapbook page and a paragraph with a counter running down are things a
 * person can watch happen and correct. A name is not. Dropping the accent out
 * of "Zoé" leaves "Zo", which is a *different, plausible name* printed
 * several times over — and the buyer who typed it has no reason to look again. A
 * refusal is the only outcome they cannot miss.
 *
 * **It asks every face the name is actually set in.** The name appears on
 * several pages and nothing says they are set in the same face; a name the
 * handwritten face can write and the typewriter cannot would print cleanly on
 * the cover and as a gap on page ten. So the check unions the coverage of every
 * `babyName` slot in the book, and the length limit is the **tightest** of
 * their `maxChars` — the smallest box is the one the name has to fit.
 */

import { FACES } from "../render/fonts";
import { unsettable } from "../render/coverage";
import { measuredLength } from "../template/defaults";
import type { TextSlotLayer } from "../template/types";
import { stripInvisible } from "../editor/text";
import { SLOT } from "./slots";
import { pageSequence } from "./derive";
import type { BookTemplate } from "./types";

/** Every text slot in the book carrying a given role, cover included. */
export function slotsForRole(book: BookTemplate, role: string): TextSlotLayer[] {
  return pageSequence(book).flatMap((page) =>
    (page.layers ?? []).flatMap((l) => (l.kind === "textSlot" && l.slot === role ? [l] : [])),
  );
}

/**
 * The limits a value in this role has to satisfy on **every** page it appears
 * on.
 *
 * The tightest of each, which is the only safe reduction: a name that fits five
 * of six boxes overflows the sixth, and the sixth is a printed page. A role with
 * no slots at all returns a zero limit, which `validateBook` has already
 * reported as `book.noNameSlot` — it is not this function's job to decide what
 * to do about a book that cannot hold what it asks for.
 */
export function limitsForRole(
  book: BookTemplate,
  role: string,
): { maxChars: number; faces: string[] } {
  const slots = slotsForRole(book, role);
  return {
    maxChars: slots.reduce((least, s) => Math.min(least, s.maxChars), Infinity) || 0,
    faces: [...new Set(slots.map((s) => s.font))],
  };
}

export type NameVerdict =
  | { ok: true; name: string }
  | {
      ok: false;
      /** Stable and greppable, like a `Problem.code`. Never the sentence. */
      code: "empty" | "unprintable" | "tooLong";
      /** What to show the buyer. Written here so the rule and the reason cannot drift. */
      message: string;
      /** The characters the press cannot write, in the order they first appear. */
      unsettable: string[];
    };

/**
 * Is this a name this book can print?
 *
 * The whitespace tidying **is** applied to the accepted value — collapsing two
 * spaces and trimming the ends changes nothing a buyer meant and a trailing
 * space shifts a centred name off centre in the print file. What is never
 * applied is a change to the *letters*.
 */
export function checkName(book: BookTemplate, raw: string): NameVerdict {
  const { maxChars, faces } = limitsForRole(book, SLOT.name);
  const tidied = stripInvisible(typeof raw === "string" ? raw : "")
    .replace(/[\u0009-\u000d]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (tidied.length === 0) {
    return {
      ok: false,
      code: "empty",
      message: "The book needs a name — it goes on the cover and inside.",
      unsettable: [],
    };
  }

  // Unioned across every face the name is set in, de-duplicated in first-seen
  // order so the message reads the way the buyer typed it.
  const bad: string[] = [];
  for (const face of faces) {
    for (const ch of unsettable(face, tidied)) if (!bad.includes(ch)) bad.push(ch);
  }
  if (bad.length) {
    const chars = bad.map((c) => `“${c}”`).join(" ");
    const names = [...new Set(faces.map((f) => FACES[f]?.family ?? f))].join(" and ");
    return {
      ok: false,
      code: "unprintable",
      message:
        `The press cannot print ${chars}. The book is set in ${names}, and ${
          bad.length === 1 ? "that character" : "those characters"
        } would come out as a gap in the name on every page — so the name is not changed and ` +
        "not accepted. Latin letters, numbers, spaces, hyphens and apostrophes all work.",
      unsettable: bad,
    };
  }

  // Measured against the tightest box, the way the renderer and the validator
  // measure it — `measuredLength` is the one definition all three share.
  const widest = slotsForRole(book, SLOT.name).reduce(
    (most, slot) => Math.max(most, measuredLength(slot, tidied)),
    tidied.length,
  );
  if (widest > maxChars) {
    return {
      ok: false,
      code: "tooLong",
      message:
        `That is ${widest} characters and the name is set large enough that ${maxChars} is ` +
        "all the page holds. A shorter form of it will print beautifully; a longer one would " +
        "run off the cover.",
      unsettable: [],
    };
  }

  return { ok: true, name: tidied };
}

/** The tightest limit, for the counter the form shows beside the field. */
export function nameLimit(book: BookTemplate): number {
  return limitsForRole(book, SLOT.name).maxChars;
}

/**
 * The face the name is set in, for a screen that has to show it in that face.
 *
 * The **first** name slot's, which is the cover's — the one the buyer will
 * actually look at. The confirm-the-spelling screen uses it so that the
 * letterforms somebody approves are the letterforms that print; the browser
 * would otherwise set the name in the page's UI font, which is showing them one
 * thing and asking them to approve another.
 *
 * A book whose name slots are set in two faces still returns one here, and that
 * is the honest limit of a single screen: `checkName` is the part that has to
 * consider all of them, and it does.
 */
export function nameSlotFont(book: BookTemplate): string {
  return slotsForRole(book, SLOT.name)[0]?.font ?? "hand";
}
