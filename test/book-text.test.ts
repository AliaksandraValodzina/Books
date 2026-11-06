/**
 * **The three kinds of text, and the three different things that happen to
 * them.**
 *
 * This is the file that matters most in the book, because **a name goes on the
 * pages.** The rasteriser runs with `loadSystemFonts: false` and two Latin
 * TTFs, so a codepoint neither carries prints as nothing at all, while a
 * browser substitutes a face and shows it perfectly. The buyer approves a cover
 * they can read and a hardback arrives with a hole in their child's name.
 *
 * Three behaviours, and the point of the file is that they are **different on
 * purpose**:
 *
 * | | What happens | Why |
 * |---|---|---|
 * | **A name** | refused, unchanged | "Zoé" minus its accent is "Zo", a different plausible name printed six times, and nobody looks again |
 * | **A dedication** | clamped, with a live counter | prose with a counter running down is something a person can watch happen |
 * | **The story** | refused at build time | the captain writes it once, so the build is the right place to stop it |
 *
 * The contract every acceptor is held to, exactly as `test/editor-text.test.ts`
 * holds the single page's: **no input, however pathological, produces a fill
 * the validator or the renderer would refuse.** It is asserted against the real
 * validator and the real renderer rather than against a copy of their rules.
 */

import { describe, expect, it } from "vitest";
import { FIRST_BOOK } from "../templates/first-book";
import { FIXTURE_BOOK_FILL } from "../fixtures/book-order";
import { checkName, limitsForRole, nameLimit, slotsForRole } from "../lib/book/name";
import { acceptLines, explainLines } from "../lib/editor/lines";
import { dedicationSlot } from "../lib/book/order";
import { SLOT } from "../lib/book/slots";
import { validateBookFill } from "../lib/book/validate";
import { blockingProblems } from "../lib/template/validate";
import { pageFillFor, pageTemplateFor, pageWithSlot } from "../lib/book/derive";
import { TextOverflows, renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import { FACE_COVERAGE } from "../lib/render/coverage";
import type { BookTemplate } from "../lib/book/types";

const slot = dedicationSlot(FIRST_BOOK)!;
const chosen = { lookId: FIRST_BOOK.looks[0].id, coverId: FIRST_BOOK.covers[0].id };

/** Render every page of the book with this fill, as the print path would. */
function renderEveryPage(fill: Parameters<typeof pageFillFor>[2], book: BookTemplate = FIRST_BOOK) {
  for (let i = 0; i < book.pages.length + 1; i++) {
    renderPageSvg(pageTemplateFor(book, i, chosen), pageFillFor(book, i, fill), {
      href: assetUrl,
    });
  }
}

// ---------------------------------------------------------------------------

describe("the baby's name is refused, never quietly changed", () => {
  it("accepts a plain name and tidies only its whitespace", () => {
    const verdict = checkName(FIRST_BOOK, "  Rosalind   Mary  ");
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // Collapsed and trimmed, because a trailing space shifts a centred name
    // off centre in the print file. The letters are untouched.
    expect(verdict.name).toBe("Rosalind Mary");
  });

  it("refuses Cyrillic rather than dropping it", () => {
    const verdict = checkName(FIRST_BOOK, "Зоя");
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("unprintable");
    expect(verdict.unsettable).toEqual(["З", "о", "я"]);
    // The crucial half: there is **no accepted name** in the result. A
    // `{ ok: true, name: "" }` or a `{ name: "" }` would be the silent
    // substitution this whole module exists to prevent.
    expect("name" in verdict).toBe(false);
    expect(verdict.message).toMatch(/cannot print/i);
    expect(verdict.message).toMatch(/not changed/i);
  });

  it("refuses an emoji and names it as one character", () => {
    const verdict = checkName(FIRST_BOOK, "Mia 😀");
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    // Astral, so reported as itself rather than as two unpaired surrogates.
    expect(verdict.unsettable).toEqual(["😀"]);
  });

  it("accepts an accent the vendored faces actually carry", () => {
    // Measured, not assumed: both faces carry Latin-1 Supplement. The refusal
    // must be about what the press cannot do, not about anything non-ASCII.
    expect(checkName(FIRST_BOOK, "Zoé").ok).toBe(true);
    expect(checkName(FIRST_BOOK, "Siân").ok).toBe(true);
    expect(checkName(FIRST_BOOK, "O'Brien-Smith").ok).toBe(true);
  });

  it("refuses an empty name, and says what it is for", () => {
    const verdict = checkName(FIRST_BOOK, "   ");
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("empty");
  });

  it("refuses a name longer than the tightest box in the book", () => {
    const limit = nameLimit(FIRST_BOOK);
    expect(checkName(FIRST_BOOK, "x".repeat(limit)).ok).toBe(true);
    const verdict = checkName(FIRST_BOOK, "x".repeat(limit + 1));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("tooLong");
    expect(verdict.message).toContain(String(limit));
  });

  it("asks every face the name is set in, not the first one it finds", () => {
    // The failure this closes: a name the handwritten face can write and the
    // typewriter cannot would print cleanly on the cover and as a gap on page
    // ten. Moving one name slot to the other face must change the answer.
    const mixed: BookTemplate = {
      ...FIRST_BOOK,
      pages: FIRST_BOOK.pages.map((p) =>
        p.id === "page-001"
          ? {
              ...p,
              layers: (p.layers ?? []).map((l) =>
                l.kind === "textSlot" && l.slot === SLOT.name ? { ...l, font: "typewriter" } : l,
              ),
            }
          : p,
      ),
    };
    // Indie Flower carries Vietnamese that Special Elite has never heard of.
    expect(checkName(FIRST_BOOK, "Thư").ok).toBe(true);
    expect(checkName(mixed, "Thư").ok).toBe(false);
    expect(limitsForRole(mixed, SLOT.name).faces.sort()).toEqual(["hand", "typewriter"]);
  });

  it("takes the tightest limit of every box, not the widest", () => {
    const tight: BookTemplate = {
      ...FIRST_BOOK,
      pages: FIRST_BOOK.pages.map((p) =>
        p.id === "page-024"
          ? {
              ...p,
              layers: (p.layers ?? []).map((l) =>
                l.kind === "textSlot" && l.slot === SLOT.name ? { ...l, maxChars: 5 } : l,
              ),
            }
          : p,
      ),
    };
    expect(nameLimit(tight)).toBe(5);
    expect(checkName(tight, "Rosalind").ok).toBe(false);
  });

  it("is set on more than one page, which is why any of this matters", () => {
    expect(slotsForRole(FIRST_BOOK, SLOT.name).length).toBeGreaterThan(1);
  });

  it("never produces a fill the renderer would refuse", () => {
    const pathological = [
      "",
      "   ",
      "Зоя",
      "😀😀😀",
      "x".repeat(400),
      "A​B",
      "a\nb\nc",
      "\u0000\u0007",
      "ß".repeat(20),
      "Mary-Jane O'Connor-Fitzgerald",
    ];
    for (const raw of pathological) {
      const verdict = checkName(FIRST_BOOK, raw);
      const name = verdict.ok ? verdict.name : "";
      const fill = { ...FIXTURE_BOOK_FILL, name };
      // `blockingProblems`, because "nobody has filled this in yet" is a
      // legitimate state of a book somebody is still working on and is not a
      // refusal — which is exactly the distinction that function exists for.
      expect(
        blockingProblems(validateBookFill(FIRST_BOOK, fill)),
        `"${raw}" composed a fill the validator refuses`,
      ).toEqual([]);
      expect(() => renderEveryPage(fill), `"${raw}" composed a fill the renderer refuses`).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------

describe("the dedication takes a hard limit, shown live", () => {
  it("counts lines and characters from the same function that enforces them", () => {
    const got = acceptLines(slot, "One line");
    expect(got.lines).toBe(1);
    expect(got.chars).toBe("One line".length);
    expect(got.truncated).toBe(false);
    expect(got.linesDropped).toBe(false);
  });

  it("wraps a long unbroken line instead of setting it off both sides", () => {
    // The overflow a line count cannot see. Three hundred characters with no
    // Return is one line, and one line is what runs off the page.
    const got = acceptLines(slot, "word ".repeat(40).trim());
    expect(got.lines).toBeGreaterThan(1);
    for (const line of got.text.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(slot.maxCharsPerLine!);
    }
  });

  it("breaks at a space, and mid-word only when there is no space", () => {
    const words = acceptLines(slot, "alpha bravo charlie delta echo foxtrot golf hotel");
    expect(words.text.split("\n").every((l) => !l.startsWith(" "))).toBe(true);
    expect(words.text.replace(/\n/g, " ")).toBe("alpha bravo charlie delta echo foxtrot golf hotel");

    const unbroken = acceptLines(slot, "z".repeat(90));
    expect(unbroken.text.split("\n").length).toBeGreaterThan(1);
  });

  it("drops whole lines past the limit and says so", () => {
    const got = acceptLines(slot, Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"));
    expect(got.lines).toBe(slot.maxLines);
    expect(got.linesDropped).toBe(true);
    expect(explainLines(got, "Special Elite")).toMatch(/as many lines as the page holds/);
  });

  it("drops what the face cannot write, and names it", () => {
    const got = acceptLines(slot, "For дом, with 😀 love");
    expect(got.unsettable).toEqual(["д", "о", "м", "😀"]);
    expect(got.text).not.toMatch(/[дом😀]/);
    expect(explainLines(got, "Special Elite")).toContain("Special Elite cannot write");
  });

  it("does not let a blank line get pushed off the page by more blank lines", () => {
    const got = acceptLines(slot, "a\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nb");
    expect(got.text).toBe("a\n\nb");
  });

  it("counts a dropped character against nobody's budget", () => {
    // Clamping happens last on purpose: a dropped emoji must not eat one of
    // the buyer's three hundred printable characters.
    const clean = acceptLines(slot, "x".repeat(300));
    const withJunk = acceptLines(slot, "😀" + "x".repeat(300));
    expect(withJunk.chars).toBe(clean.chars);
  });

  it("never produces a fill the validator or the renderer would refuse", () => {
    const pathological = [
      "",
      "\n\n\n",
      "z".repeat(5000),
      "word ".repeat(500),
      Array.from({ length: 200 }, () => "line").join("\n"),
      "дом ".repeat(50),
      "😀".repeat(50),
      "a​​​b",
      "\t\t\tFor you\r\n\r\nalways",
      "ß".repeat(400),
    ];
    for (const raw of pathological) {
      const fill = { ...FIXTURE_BOOK_FILL, dedication: acceptLines(slot, raw).text };
      expect(
        blockingProblems(validateBookFill(FIRST_BOOK, fill)),
        `${JSON.stringify(raw.slice(0, 20))} composed a fill the validator refuses`,
      ).toEqual([]);
      expect(() => renderEveryPage(fill)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------

describe("the renderer is the backstop, and it refuses rather than clips", () => {
  const page = pageWithSlot(FIRST_BOOK, SLOT.dedication);
  const template = pageTemplateFor(FIRST_BOOK, page, chosen);

  /**
   * The dedication page, drawn with **only** the dedication in it.
   *
   * The from-line is on the same page and is its own `<text>` element, so
   * leaving it in would put its baseline in the same list as the dedication's
   * and the line-spacing assertion below would be comparing two slots.
   */
  const draw = (dedication: string) =>
    renderPageSvg(
      template,
      pageFillFor(FIRST_BOOK, page, { ...FIXTURE_BOOK_FILL, dedication, from: "" }),
      { href: assetUrl },
    );

  it("throws on too many lines, naming the slot", () => {
    expect(() => draw(Array.from({ length: 12 }, () => "x").join("\n"))).toThrow(TextOverflows);
    expect(() => draw(Array.from({ length: 12 }, () => "x").join("\n"))).toThrow(/dedication/);
  });

  it("throws on too many characters", () => {
    expect(() => draw("x".repeat(400))).toThrow(TextOverflows);
  });

  it("throws on one line too wide, which a line count cannot see", () => {
    // Four lines, well inside both the line limit and the character budget,
    // and the second one is sixty characters across.
    expect(() => draw(`ok\n${"y".repeat(60)}\nok\nok`)).toThrow(/across/);
  });

  it("draws the thing it is given when it fits", () => {
    const svg = draw("For you,\nalways.");
    expect(svg).toContain("For you,");
    expect(svg).toContain("always.");
  });

  it("sets every line on its own absolute baseline", () => {
    // A `dy` offset is lost whenever a line is empty — a shaper may drop a
    // `<tspan>` with no content, and `resvg` does — so a blank line would
    // silently close up in the print file while a browser kept it. That is a
    // screen/print divergence produced by pressing Return twice.
    const svg = draw("one\n\nthree");
    const ys = [...svg.matchAll(/<tspan x="[\d.]+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBe(3);
    expect(ys[1] - ys[0]).toBe(ys[2] - ys[1]);
    expect(svg).not.toContain("dy=");
  });
});

// ---------------------------------------------------------------------------

describe("the coverage guard covers every face this book uses", () => {
  it("has declared runs for each of them", () => {
    const faces = new Set<string>();
    for (const page of [FIRST_BOOK.cover, ...FIRST_BOOK.pages]) {
      for (const layer of page.layers ?? []) {
        if (layer.kind === "textSlot") faces.add(layer.font);
      }
    }
    expect(faces.size).toBeGreaterThan(1);
    for (const face of faces) {
      expect(FACE_COVERAGE[face], `face "${face}" has no measured coverage`).toBeTruthy();
    }
  });
});
