/**
 * **The facts the shop states, checked against the artefact they describe.**
 *
 * Two different failures live here.
 *
 * A **confirmed** fact can drift. "3150 × 3150 px, 300 DPI" typed into copy is
 * true until somebody changes the template, and then it is a wrong claim on a
 * public page that no test notices. So the confirmed rows are derived from
 * `MY_FOREVER` and asserted against it.
 *
 * An **unconfirmed** one can be quietly filled in. A plausible price is a
 * fabricated commercial claim, and a customer cannot tell a guess from a
 * quote. The type makes writing one impossible — only the `confirmed: true`
 * arm has a `value` field — and these tests make *deleting the type's help*
 * visible: every unconfirmed fact must still say what it needs and from whom.
 */

import { describe, expect, it } from "vitest";
import {
  DELIVERY,
  GUARANTEES,
  PLACEHOLDER,
  SAFE_INSET_PT,
  UNCONFIRMED,
  WHAT_YOU_GET,
  WHO_IT_IS_FOR,
} from "../lib/product";
import { MY_FOREVER } from "../templates/my-forever";
import { safeBox, trimBox } from "../lib/template/defaults";
import { validateTemplate } from "../lib/template/validate";

describe("the facts the page states", () => {
  it("are derived from the template, so the copy cannot drift from the file", () => {
    const printFile = WHAT_YOU_GET.find((f) => f.label === "Print file");
    expect(printFile?.confirmed).toBe(true);
    if (printFile?.confirmed) {
      expect(printFile.value).toContain(`${MY_FOREVER.print.pixels.width}`);
      expect(printFile.value).toContain(
        `${Math.round((MY_FOREVER.print.pixels.width / MY_FOREVER.canvas.width) * 72)} DPI`,
      );
      expect(printFile.value).toContain("sRGB");
    }
  });

  it("would notice the template changing underneath them", () => {
    // The paired negative: the claim is only worth making because a different
    // template would produce a different sentence.
    const printFile = WHAT_YOU_GET.find((f) => f.label === "Print file");
    expect(printFile?.confirmed && printFile.value).not.toContain("2400");
    expect(MY_FOREVER.print.pixels.width).not.toBe(2400);
  });

  it("carry a source for every claim, because a claim with no provenance is a guess", () => {
    for (const fact of WHAT_YOU_GET) {
      if (fact.confirmed) {
        expect(fact.source.length, `${fact.label} has no source`).toBeGreaterThan(10);
        expect(fact.value.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the facts the page admits it does not have", () => {
  it("include the four nobody here has a number for", () => {
    const labels = UNCONFIRMED.map((f) => f.label);
    expect(labels).toContain("Price");
    expect(labels).toContain("Pages");
    expect(labels).toContain("Paper and binding");
    expect(labels).toContain("When it arrives");
  });

  it("state no value, because the type has nowhere to put one", () => {
    for (const fact of UNCONFIRMED) {
      expect("value" in fact, `${fact.label} carries a value`).toBe(false);
      expect(fact.needs.length, `${fact.label} does not say what it needs`).toBeGreaterThan(20);
    }
  });

  it("never read as a number in disguise", () => {
    // "around £30" or "about a fortnight" is a quote with a hedge in front of
    // it, and a customer plans a birthday around it just the same.
    for (const fact of UNCONFIRMED) {
      expect(fact.needs, fact.label).not.toMatch(/[£$€]\s?\d/);
      expect(fact.needs, fact.label).not.toMatch(/within\s+\d+\s+(days|weeks)/i);
    }
  });

  it("say when it arrives is a real window somebody must supply before launch", () => {
    // A gift that misses the date is a refund and a bad review, so this one is
    // called out by name rather than left in the list.
    expect(DELIVERY.confirmed).toBe(false);
    if (!DELIVERY.confirmed) {
      expect(DELIVERY.needs).toContain("Printify");
      expect(DELIVERY.needs.toLowerCase()).toContain("shipping");
      expect(DELIVERY.needs.toLowerCase()).toContain("refund");
    }
  });

  it("have a marker that could not be mistaken for a value", () => {
    expect(PLACEHOLDER).toMatch(/^[A-Z ]+$/);
    expect(PLACEHOLDER).not.toMatch(/\d/);
  });
});

describe("the guarantees", () => {
  it("say the safe-area one in the template's own numbers", () => {
    expect(SAFE_INSET_PT).toBe(MY_FOREVER.canvas.bleed + MY_FOREVER.canvas.safe);
    const inches = (SAFE_INSET_PT / 72).toFixed(2).replace(/\.?0+$/, "");
    expect(GUARANTEES.some((g) => g.includes(`${inches} in`))).toBe(true);
  });

  it("are true: nothing a customer can see crosses the safe area", () => {
    // Asserted against the validator rather than against the sentence, so the
    // promise on the page is the same fact the build enforces.
    expect(validateTemplate(MY_FOREVER).filter((p) => p.code === "slot.outsideSafeArea")).toEqual([]);
    const safe = safeBox(MY_FOREVER.canvas);
    const trim = trimBox(MY_FOREVER.canvas);
    expect(safe.width).toBeLessThan(trim.width);
    expect(trim.width).toBeLessThan(MY_FOREVER.canvas.width);
  });

  it("promise no upload, which is what the editor actually does", () => {
    expect(GUARANTEES.some((g) => /not? upload|stay in your browser/i.test(g))).toBe(true);
    expect(GUARANTEES.some((g) => /no account/i.test(g))).toBe(true);
  });
});

describe("the line that says who it is for", () => {
  it("names the people, not the category", () => {
    expect(WHO_IT_IS_FOR.toLowerCase()).toContain("two of you");
    expect(WHO_IT_IS_FOR.toLowerCase()).not.toContain("personalised photo product");
    expect(WHO_IT_IS_FOR.length).toBeLessThan(140);
  });
});
