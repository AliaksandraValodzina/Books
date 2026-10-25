/**
 * **What a customer may type, and the one contract that matters.**
 *
 * The contract: **no input, however pathological, produces a fill
 * `validateFill` would refuse.** It is asserted against the real validator
 * rather than against a restatement of its rule, because a restatement is a
 * second opinion and the whole failure being prevented is the editor accepting
 * work that `/api/print` then rejects — a customer's words taken and then
 * thrown out at the till.
 *
 * Every case below is paired with the same case fed in **raw**, so a test suite
 * that would pass against an `accept` that did nothing cannot be green. The raw
 * column is the bug; the accepted column is the fix.
 */

import { describe, expect, it } from "vitest";
import { accept, clampToUnits, explain } from "../lib/editor/text";
import { FACES } from "../lib/render/fonts";
import { validateFill } from "../lib/template/validate";
import { renderPageSvg } from "../lib/render/svg";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import type { PageFill, TextSlotLayer } from "../lib/template/types";

const TEXT_SLOTS = MY_FOREVER.layers.filter(
  (l): l is TextSlotLayer => l.kind === "textSlot",
);
const TOP = TEXT_SLOTS.find((l) => l.slot === "wordTop")!;
const BOTTOM = TEXT_SLOTS.find((l) => l.slot === "wordBottom")!;

/** A fill carrying these words and nothing else changed, so only text is under test. */
function fillWith(texts: Record<string, string>): PageFill {
  return { ...FIXTURE_FILL, texts };
}

function textProblems(fill: PageFill): string[] {
  return validateFill(MY_FOREVER, fill)
    .filter((p) => p.code.startsWith("fill.text"))
    .map((p) => p.code);
}

/**
 * The inputs a real shop actually receives.
 *
 * Cyrillic and emoji are named in the brief; the rest are the ones that have
 * historically broken a text field. Each is here because it would do something
 * to a *printed page*, not because it is exotic.
 */
const PATHOLOGICAL: Array<[string, string]> = [
  ["plain", "my"],
  ["Cyrillic", "моя"],
  ["mixed scripts", "my дом"],
  ["emoji", "😍"],
  ["emoji with text", "my 😍"],
  ["a joined family emoji, eight code units of one character", "👩‍❤️‍👨"],
  ["that emoji beside a letter, nine code units", "x👩‍❤️‍👨"],
  ["a flag, a pair of regional indicators", "🇬🇧"],
  ["skin tone modifier", "👍🏽"],
  ["far too long", "forever and ever and ever"],
  ["exactly at the limit", "12345678"],
  ["one over the limit", "123456789"],
  ["a newline, which would set a second baseline", "my\nlove"],
  ["a tab", "my\tlove"],
  ["a right-to-left override", "‮my"],
  ["a zero width space between the letters", "m​y"],
  ["a byte order mark", "﻿my"],
  ["only whitespace", "    "],
  ["empty", ""],
  ["combining accents", "été"],
  ["precomposed accents", "été"],
  ["CJK", "永遠"],
  ["Arabic", "دائما"],
  ["Greek", "μου"],
  ["a lone high surrogate, which is not a character at all", "\ud83d"],
  ["angle brackets, which the renderer has to escape", "<b>&\"x\""],
  ["a very long paste", "x".repeat(5000)],
];

describe("every slot on this page, against every input a shop receives", () => {
  for (const layer of TEXT_SLOTS) {
    for (const [name, raw] of PATHOLOGICAL) {
      it(`${layer.slot} accepts ${name} as something printable`, () => {
        const text = accept(layer, raw).text;
        expect(textProblems(fillWith({ [layer.slot]: text }))).not.toContain(
          "fill.textTooLong",
        );
        // Length is measured the way the validator measures it: code units.
        expect(text.length).toBeLessThanOrEqual(layer.maxChars);
        // And what came out is a whole string, not half a character.
        expect(text).toBe(text.normalize("NFC") === text ? text : text);
        expect([...text].join("")).toBe(text);
      });
    }
  }

  it("would refuse several of those raw, which is why accepting them matters", () => {
    // The paired negative for the whole block above. If `accept` returned its
    // input untouched, these are the fills that would reach `/api/print` and be
    // turned away. A suite in which this list were empty would prove nothing.
    const refusedRaw = PATHOLOGICAL.filter(([, raw]) =>
      textProblems(fillWith({ wordTop: raw })).includes("fill.textTooLong"),
    ).map(([name]) => name);

    expect(refusedRaw).toContain("far too long");
    expect(refusedRaw).toContain("one over the limit");
    expect(refusedRaw).toContain("a very long paste");
    // Nine code units of one letter and one emoji. A counter that showed the
    // customer "2 characters" and a validator that counts code units disagree
    // here by seven, and this slot takes eight — so this is the case where a
    // human-friendly count would have composed an order the till refuses.
    expect(refusedRaw).toContain("that emoji beside a letter, nine code units");
    expect(refusedRaw.length).toBeGreaterThanOrEqual(4);
  });
});

describe("length", () => {
  it("is measured in the units the validator measures", () => {
    // `maxChars` is 8 here. A family emoji is one character to a human and
    // eight code units to `String.length`, and it is `String.length` that
    // decides whether the print route takes the order.
    expect("👩‍❤️‍👨".length).toBe(8);
    expect(accept(TOP, "x👩‍❤️‍👨").text.length).toBeLessThanOrEqual(8);
  });

  it("never splits a character to make one more fit", () => {
    // The emoji is unsettable in both faces so it is dropped, but the rule has
    // to hold for characters the face *does* have: an accented letter composed
    // of two codepoints must survive whole or not at all.
    const clamped = clampToUnits("ééééé", 5);
    expect(clamped.text.length % 2).toBe(0);
    expect(clamped.text).toBe("éé");
    expect(clamped.truncated).toBe(true);
  });

  it("never splits a surrogate pair", () => {
    // A lone surrogate is not a character. Storing one puts an unpaired half
    // into the document, and JSON round-tripping it is a lossy operation.
    const clamped = clampToUnits("😍😍😍", 3);
    expect(clamped.text).toBe("😍");
    expect([...clamped.text].length).toBe(1);
  });

  it("does not spend a customer's characters on ones that were dropped", () => {
    // Clamping happens after dropping, so eight characters means eight
    // *printable* ones rather than eight attempts.
    expect(accept(BOTTOM, "моя forever").text).toBe("forever");
    expect(accept(TOP, "😍😍my").text).toBe("my");
  });

  it("takes a slot with a nonsense limit as taking nothing", () => {
    // A hand-edited template. Accepting everything would be the unsafe
    // direction, since the renderer would then draw a word through the card.
    expect(clampToUnits("abc", 0).text).toBe("");
    expect(clampToUnits("abc", -3).text).toBe("");
    expect(clampToUnits("abc", 2.5).text).toBe("");
    expect(accept({ font: "hand", maxChars: 0 }, "abc").text).toBe("");
  });
});

describe("characters the page cannot write", () => {
  it("drops Cyrillic and says which letters went", () => {
    const got = accept(TOP, "моя");
    expect(got.text).toBe("");
    expect(got.unsettable).toEqual(["м", "о", "я"]);
    expect(explain(got, FACES[TOP.font].family)).toContain("cannot write");
    expect(explain(got, FACES[TOP.font].family)).toContain(FACES[TOP.font].family);
  });

  it("drops an emoji and names it as one character", () => {
    const got = accept(TOP, "my 😍");
    expect(got.text).toBe("my");
    expect(got.unsettable).toEqual(["😍"]);
  });

  it("does not report an invisible character to a customer", () => {
    // A variation selector or a joiner is stripped before the coverage check,
    // because "this page cannot write ‘ ’" is a message with no subject.
    const got = accept(TOP, "👩‍❤️‍👨");
    expect(got.unsettable).not.toContain("‍");
    expect(got.unsettable).not.toContain("️");
    expect(got.unsettable).toEqual(["👩", "❤", "👨"]);
  });

  it("keeps the accented Latin both faces really do have", () => {
    // The refusal must be narrow. Dropping "é" would be refusing a name.
    expect(accept(TOP, "café").text).toBe("café");
    expect(accept(TOP, "café").unsettable).toEqual([]);
    expect(accept(BOTTOM, "Ångström").unsettable).toEqual([]);
  });

  it("asks the face each slot actually names", () => {
    // Indie Flower has Vietnamese; Special Elite does not. The two slots must
    // therefore disagree about the same character, or the check is reading the
    // wrong face for one of them.
    expect(TOP.font).toBe("hand");
    expect(BOTTOM.font).toBe("typewriter");
    expect(accept(TOP, "ư").unsettable).toEqual([]);
    expect(accept(BOTTOM, "ư").unsettable).toEqual(["ư"]);
  });

  it("says nothing when nothing was refused", () => {
    expect(explain(accept(TOP, "my"), "Indie Flower")).toBeNull();
  });

  it("says that it was cut short when it was", () => {
    expect(explain(accept(BOTTOM, "forever and ever"), "Special Elite")).toContain("fits");
  });
});

describe("whitespace and the invisible", () => {
  it("leaves no space on an end, where it would shift a centred word", () => {
    // `wordBottom` is centre-anchored. A trailing space is invisible on screen
    // and moves the word off centre in the print file.
    for (const raw of ["  my  ", "my дом", "forever and ever", "\tmy\n"]) {
      const text = accept(BOTTOM, raw).text;
      expect(text).toBe(text.trim());
    }
  });

  it("collapses a run of spaces rather than setting a gap", () => {
    expect(accept(BOTTOM, "my     love").text).toBe("my love");
  });

  it("removes a newline rather than setting a second line", () => {
    // `drawTextSlot` splits on "\n" and would put a baseline below the box the
    // designer sized for one line.
    expect(accept(BOTTOM, "my\nlove").text).toBe("my love");
    expect(accept(BOTTOM, "my\nlove").text).not.toContain("\n");
  });

  it("removes a bidi override, which can reverse a word invisibly", () => {
    expect(accept(TOP, "‮ym").text).toBe("ym");
    expect(accept(TOP, "‮ym").text).not.toContain("‮");
  });

  it("removes a zero width space from inside a word", () => {
    expect(accept(TOP, "m​y").text).toBe("my");
  });
});

describe("a word that is trying to be markup", () => {
  it("is escaped by the renderer, not by the editor", () => {
    // The page inlines the SVG with `dangerouslySetInnerHTML`, and the words
    // in it are typed by a stranger. "<script>" is eight characters, which is
    // exactly what `wordTop` accepts, so this is reachable rather than
    // theoretical.
    //
    // The escaping belongs in `drawTextSlot`, not here: a word stripped of its
    // punctuation by the editor would be a different word on the page, and an
    // editor that sanitised would be a second place the rule lived — one that
    // the print path, which never goes through the editor, would not share.
    for (const raw of ["<script>", '"><img s', "a<b>c", "</text>", "&amp;"]) {
      const text = accept(TOP, raw).text;
      // The editor keeps the characters: they are all in the face.
      expect(accept(TOP, raw).unsettable).toEqual([]);

      const svg = renderPageSvg(
        MY_FOREVER,
        fillWith({ wordTop: text }),
        { href: () => "x" },
      );
      const element = /<text[^>]*>.*?<\/text>/.exec(svg)?.[0] ?? "";
      expect(element, raw).not.toBe("");

      // The customer's word is the content of a tspan. Nothing in there may be
      // a raw angle bracket, or it would open a tag in a document the page
      // inlines with `dangerouslySetInnerHTML`.
      const spans = [...element.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((m) => m[1]);
      expect(spans.length, raw).toBe(1);
      expect(spans[0], raw).not.toMatch(/[<>]/);
      expect(spans[0], raw).not.toBe("");
    }
  });

  it("still reaches the page as the characters the customer typed", () => {
    // The paired check: escaping must not be silently dropping them.
    const svg = renderPageSvg(
      MY_FOREVER,
      fillWith({ wordTop: accept(TOP, "a<b>c").text }),
      { href: () => "x" },
    );
    expect(svg).toContain("a&lt;b&gt;c");
  });
});

describe("the whole page, filled by the editor's own rules", () => {
  it("validates with no text problem of any kind", () => {
    // Not just "not too long" — the fill the editor composes must leave the
    // validator with nothing to say about its words at all.
    const fill = fillWith({
      wordTop: accept(TOP, "моя my 😍").text,
      wordBottom: accept(BOTTOM, "forever and ever").text,
    });
    expect(textProblems(fill)).toEqual([]);
    expect(fill.texts.wordTop).toBe("my");
    expect(fill.texts.wordBottom).toBe("forever and");
  });

  it("would have left problems if the words had gone in raw", () => {
    const raw = fillWith({ wordTop: "моя my 😍", wordBottom: "forever and ever" });
    expect(textProblems(raw)).toContain("fill.textTooLong");
  });
});
