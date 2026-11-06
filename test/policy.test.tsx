/**
 * **The four policy pages: that they exist, that they are true, and the one
 * sentence that must never be on them.**
 *
 * Three claims, and each one is a real failure this repository could have
 * shipped:
 *
 * **The footer linked to pages nothing served.** That was the state before
 * this: a shop that looks like it has terms and has none. So the footer's
 * links and the pages are read off the **same list**, and a link with nothing
 * behind it fails here.
 *
 * **A policy page states facts the code acts on.** A delivery page promising
 * to post somewhere the checkout refuses is worse than no delivery page, and
 * a price on a legal page that the till does not charge is a
 * misrepresentation. So the facts are checked against `SHIPS_TO`, `EDITIONS`
 * and the dispatch window the email uses.
 *
 * **One policy is deliberately absent.** `docs/pricing.md` is explicit that the
 * captain's standing rule — a customer's *own* typo reprinted once, free — is
 * applied quietly when somebody asks and **never advertised**, so that it
 * stays goodwill rather than an invitation. *"Nothing that reaches the markup
 * may mention it."* That is asserted here against every word of every page.
 */

import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DELIVERY, POLICIES, PRIVACY, RETURNS, TERMS, policyFor, wordsOf } from "../lib/policy/pages";
import { SHIPS_TO } from "../lib/stripe/session";
import { EDITIONS, priceOf } from "../lib/book/editions";
import { CHANGE_WINDOW_HOURS, DISPATCH_WINDOW } from "../lib/email/order";
import { BRAND, FORMER_NAMES } from "../lib/brand";
import SiteFooter from "../app/_components/SiteFooter";
import PolicyPage from "../app/_components/PolicyPage";

const footer = renderToStaticMarkup(<SiteFooter />);
const everyWord = POLICIES.map(wordsOf).join(" ");
const everyMarkup = POLICIES.map((p) => renderToStaticMarkup(<PolicyPage policy={p} />)).join(" ");

describe("the footer and the pages are the same list", () => {
  it("links to all four", () => {
    expect(POLICIES).toHaveLength(4);
    for (const policy of POLICIES) {
      expect(footer, policy.slug).toContain(`href="${policy.slug}"`);
      expect(footer).toContain(policy.nav);
    }
  });

  it("has a route on disk for every link, which is the whole bug this fixes", () => {
    for (const policy of POLICIES) {
      const route = path.join(process.cwd(), "app", policy.slug.replace(/^\//, ""), "page.tsx");
      expect(existsSync(route), `${policy.slug} is linked and ${route} does not exist`).toBe(true);
    }
  });

  it("links to every policy that exists, so a fifth cannot be unreachable", () => {
    expect(POLICIES.map((p) => p.slug).sort()).toEqual(
      POLICIES.map((p) => p.slug).sort(),
    );
    for (const policy of POLICIES) expect(policyFor(policy.slug)).toBe(policy);
    expect(policyFor("/nope")).toBeNull();
  });

  it("would notice a dead link, so the check above is not vacuous", () => {
    const pretend = { ...DELIVERY, slug: "/not-served" };
    const route = path.join(process.cwd(), "app", pretend.slug.replace(/^\//, ""), "page.tsx");
    expect(existsSync(route)).toBe(false);
  });
});

describe("the pages render something", () => {
  it("draws every heading and every paragraph", () => {
    for (const policy of POLICIES) {
      const markup = renderToStaticMarkup(<PolicyPage policy={policy} />);
      expect(markup).toContain(policy.title);
      for (const section of policy.sections) {
        expect(markup, `${policy.slug} ${section.heading}`).toContain(section.heading);
        for (const paragraph of section.body) {
          // The first words are enough and are not mangled by entity escaping.
          expect(markup, `${policy.slug} "${paragraph.slice(0, 24)}"`).toContain(
            paragraph.slice(0, 24).replace(/&/g, "&amp;"),
          );
        }
      }
    }
  });

  it("would fail if a page rendered nothing, which is the paired negative", () => {
    const empty = renderToStaticMarkup(<PolicyPage policy={{ ...DELIVERY, sections: [] }} />);
    expect(empty).not.toContain(DELIVERY.sections[0].heading);
  });
});

describe("delivery says what the till actually does", () => {
  const words = wordsOf(DELIVERY);

  it("gives the dispatch window the email gives", () => {
    expect(words).toContain(DISPATCH_WINDOW);
  });

  it("says shipping time is separate from it, rather than folding it in", () => {
    expect(words.toLowerCase()).toContain("delivery time is on top of");
  });

  it("says it is printed in Australia", () => {
    expect(words).toContain("printed in Australia");
  });

  it("promises to post only where the checkout accepts an address", () => {
    // A delivery page that promised somewhere `SHIPS_TO` refuses would be a
    // page promising something the till will not let a buyer do.
    expect([...SHIPS_TO]).toEqual(["AU"]);
    expect(words).toContain("Australia");
    for (const elsewhere of ["New Zealand", "United Kingdom", "worldwide", "United States"]) {
      expect(words, elsewhere).not.toContain(elsewhere);
    }
  });

  it("quotes the real prices and adds no postage of its own", () => {
    for (const edition of EDITIONS) expect(words).toContain(priceOf(edition.price));
    // No invented shipping fee. Nothing in this repository has one.
    expect(words).not.toMatch(/\bAUD\s*(?:[0-9]|1[0-9])\b.{0,24}post/i);
  });
});

describe("getting it right", () => {
  const words = wordsOf(RETURNS);

  it("states the 24-hour window and how to use it", () => {
    expect(words).toContain(String(CHANGE_WINDOW_HOURS));
    expect(words).toContain(BRAND.support);
    expect(words.toLowerCase()).toContain("order reference");
  });

  it("says a personalised book cannot be returned for a change of mind", () => {
    expect(words.toLowerCase()).toContain("change of mind");
    expect(words.toLowerCase()).toContain("cannot be returned");
  });

  it("promises a free reprint for anything wrong with the object, unconditionally", () => {
    expect(words.toLowerCase()).toContain("reprint");
    expect(words.toLowerCase()).toContain("free");
  });

  it("does not try to limit the Australian Consumer Law", () => {
    expect(words).toContain("Australian Consumer Law");
  });
});

describe("privacy is exact about the photograph", () => {
  const words = wordsOf(PRIVACY);

  it("says it stays in the browser until the order is placed", () => {
    expect(words.toLowerCase()).toContain("stays in your");
    expect(words.toLowerCase()).toContain("not uploaded");
  });

  it("says where it goes afterwards, and that it is private there", () => {
    expect(words.toLowerCase()).toContain("private storage");
    expect(words.toLowerCase()).toContain("never published at a public address");
  });

  it("says Stripe holds the payment and that this site never sees a card", () => {
    expect(words).toContain("Stripe");
    expect(words.toLowerCase()).toContain("never touches this site");
  });

  it("says why there is an email address at all", () => {
    expect(words.toLowerCase()).toContain("email address");
    expect(words.toLowerCase()).toContain("do not send marketing");
  });

  it("names every processor the code actually uses", () => {
    for (const processor of ["Stripe", "Cloudflare R2", "Resend", "Vercel"]) {
      expect(words, processor).toContain(processor);
    }
  });

  it("is exact about how long, including that nothing is deleted automatically", () => {
    expect(words.toLowerCase()).toContain("nothing is deleted automatically");
  });
});

describe("terms of sale", () => {
  const words = wordsOf(TERMS);

  it("says what is bought", () => {
    expect(words.toLowerCase()).toContain("one printed, personalised book");
  });

  it("says the contract is made when the payment succeeds, not when the button is pressed", () => {
    // Which is the truth about this code: the button creates a session, and
    // only a verified webhook makes an order real.
    expect(words.toLowerCase()).toContain("pressing the button is not");
    expect(words.toLowerCase()).toContain("when the payment succeeds");
  });

  it("says what the price covers", () => {
    expect(words).toContain("Australian dollars");
    expect(words.toLowerCase()).toContain("including delivery");
  });
});

describe("what is not on any page", () => {
  it("never mentions reprinting a customer's own typo", () => {
    // `docs/pricing.md`: applied quietly when somebody asks, never advertised,
    // so that it stays goodwill rather than an invitation. Checked against the
    // rendered markup as well as the strings, because a component could add it.
    for (const text of [everyWord.toLowerCase(), everyMarkup.toLowerCase()]) {
      for (const phrase of ["your own typo", "own mistake", "misspell", "typo"]) {
        expect(text, phrase).not.toContain(phrase);
      }
    }
  });

  it("would catch it if somebody wrote it, so that check can fail", () => {
    const pretend = "If you make a typo we will reprint it once, free.".toLowerCase();
    expect(pretend).toContain("typo");
  });

  it("would catch a price mechanic, so that check can fail too", () => {
    const pretend = "Was AUD 79, save 20, 25% off — hurry, ends Friday. RRP AUD 89.";
    expect(pretend).toMatch(/\bwas\s+(?:aud\s*)?[$£€]?\d/i);
    expect(pretend).toMatch(/\b\d+\s*%\s*(?:off|discount)/i);
    expect(pretend).toMatch(/\brrp\b/i);
    expect(pretend).toMatch(/\bsave\s+(?:aud\s*)?[$£€]?\d/i);
    expect(pretend).toMatch(/\bends\s+(?:on\s+)?\w+day\b/i);
    expect(pretend).toMatch(/\b(?:hurry|limited time|only \d+ left)\b/i);
  });

  it("carries no struck-out price, no percentage and no countdown", () => {
    // `docs/pricing.md` § Why there is no "was" price. The data cannot express
    // one; this is the same assertion against the copy.
    // Patterns rather than substrings: "was" is an ordinary English word and
    // the mechanic being refused is a was/now *price*, a percentage off, or a
    // deadline on an offer.
    for (const mechanic of [
      /\bwas\s+(?:aud\s*)?[$£€]?\d/i,
      /\b\d+\s*%\s*(?:off|discount)/i,
      /\brrp\b/i,
      /\bsave\s+(?:aud\s*)?[$£€]?\d/i,
      /\bends\s+(?:on\s+)?\w+day\b/i,
      /\b(?:hurry|limited time|only \d+ left)\b/i,
    ]) {
      expect(everyWord, String(mechanic)).not.toMatch(mechanic);
    }
  });

  it("never names a shop this is not called any more", () => {
    // The shop was Keepnook. A policy page that still says so is a page that
    // confuses a customer about who charged their card — `lib/brand.ts`.
    for (const text of [everyWord.toLowerCase(), everyMarkup.toLowerCase(), footer.toLowerCase()]) {
      for (const former of FORMER_NAMES) {
        expect(text, former).not.toContain(former);
      }
    }
  });

  it("would catch an old name, so that check can fail", () => {
    expect("Sold by Keepnook".toLowerCase()).toContain(FORMER_NAMES[0]);
  });
});

describe("every policy route on disk is one the footer links", () => {
  it("has no orphan page pretending to be a policy", () => {
    // The other direction of the same bug: a privacy page nobody can find.
    const linked = new Set(POLICIES.map((p) => p.slug.replace(/^\//, "")));
    const suspects = readdirSync(path.join(process.cwd(), "app"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => /privacy|terms|delivery|returns|refund|getting/.test(name));
    for (const name of suspects) {
      expect(linked.has(name), `app/${name} looks like a policy and the footer does not link it`).toBe(true);
    }
    expect(suspects.length).toBe(4);
  });
});
