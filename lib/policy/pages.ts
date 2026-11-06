/**
 * **The four policies, written from what this site actually does.**
 *
 * The footer has linked to these since the landing page was built and nothing
 * served them, which is the worst of both: a shop that looks like it has
 * policies and has none. They are here as **data** for the same reason a page
 * template is data — one component renders all four, the footer's links come
 * out of this same list, and `test/policy.test.tsx` can read the words without
 * rendering anything. A policy page that disagreed with the footer, or a
 * footer link with nothing behind it, is now a failing test rather than a
 * thing somebody notices in six months.
 *
 * **Every fact is derived where a fact exists to derive.** The dispatch window
 * comes from `lib/email/order.ts`, the change window from the same place, the
 * prices from `EDITIONS`, and the countries from `SHIPS_TO` — the list the
 * Checkout Session is actually created with. So the delivery page cannot
 * promise to post to a country the till refuses, and a price change does not
 * leave a stale number on a legal page.
 *
 * **No brand string is typed here.** The shop's name, domain and support
 * address come from `lib/brand.ts`, because the shop has already been renamed
 * once and the fifteenth copy of a name is always the one left stale on a
 * legal page. `test/policy.test.tsx` asserts no former name survives in any
 * of this copy.
 *
 * **What is deliberately not on any of these pages:** the captain's standing
 * rule that a customer's *own* typo is reprinted once, free. `docs/pricing.md`
 * § What the page says about delivery is explicit — it is applied quietly when
 * somebody asks and never advertised, so that it stays goodwill rather than an
 * invitation. `test/policy.test.tsx` asserts its absence from every string
 * this module produces.
 *
 * ## These are first drafts
 *
 * Written from the product's real behaviour by whoever built the money path,
 * not by a lawyer. Privacy and terms especially deserve a professional read
 * before real money flows, and the PR that introduced them says so. Nothing
 * here claims otherwise, and nothing here invents a fact the repository does
 * not have — a retention period nobody has decided is described as what the
 * code does, which is to keep the order until the owner deletes it.
 */

import { BRAND } from "../brand";
import { EDITIONS, priceOf } from "../book/editions";
import { SHIPS_TO } from "../stripe/session";
import { CHANGE_WINDOW_HOURS, DISPATCH_WINDOW } from "../email/order";

export interface PolicySection {
  heading: string;
  /** Paragraphs. A list is a list of short paragraphs, not a bullet format. */
  body: string[];
}

export interface Policy {
  /** The path it is served at, and the href the footer uses. One source. */
  slug: string;
  /** The page's own heading. */
  title: string;
  /** What the footer calls it. Shorter. */
  nav: string;
  /** One sentence under the heading. */
  lede: string;
  sections: PolicySection[];
}

const COUNTRIES: Record<string, string> = { AU: "Australia" };
const shipsTo = SHIPS_TO.map((code) => COUNTRIES[code] ?? code).join(", ");
const prices = EDITIONS.map((e) => `${e.label.toLowerCase()} ${priceOf(e.price)}`).join(", ");

export const DELIVERY: Policy = {
  slug: "/delivery",
  title: "Delivery",
  nav: "Delivery",
  lede: "What happens after you order, and when the book turns up.",
  sections: [
    {
      heading: "Printing and dispatch",
      body: [
        `Your book is printed in Australia and dispatched within ${DISPATCH_WINDOW} of your ` +
          "order. There is a person between your order and the press — that is what makes the " +
          "change window below possible — so the days are working days.",
        "Delivery time is on top of the dispatch window and depends on where you are. We do " +
          "not quote a delivery date, because the carrier sets it and we would be guessing.",
      ],
    },
    {
      heading: "What it costs to get it to you",
      body: [
        `Nothing extra. The price you see is the price you pay — ${prices} — and no postage ` +
          "is added at the till.",
      ],
    },
    {
      heading: "Where we post to",
      body: [
        `${shipsTo}, for now. The checkout will only accept an address there, which is ` +
          "deliberate: we are not going to take money for a delivery time we have not " +
          "checked. If you are somewhere else and want one, write to us and we will find out " +
          "properly before saying yes.",
      ],
    },
    {
      heading: "If it does not arrive",
      body: [
        `Tell us at ${BRAND.support} and we will chase the carrier, and reprint and resend ` +
          "the book if it is lost. You do not pay twice for one book.",
      ],
    },
  ],
};

export const RETURNS: Policy = {
  slug: "/getting-it-right",
  title: "Getting it right",
  nav: "Getting it right",
  lede: "What we do when something is wrong, and the one thing we cannot undo.",
  sections: [
    {
      heading: `The first ${CHANGE_WINDOW_HOURS} hours`,
      body: [
        `We have not printed it yet when you order. For ${CHANGE_WINDOW_HOURS} hours after ` +
          `you order, write to ${BRAND.support} with your order reference and we will change ` +
          "anything in the book — the spelling, the dedication, the from-line, the " +
          "photograph, the cover — and it costs nothing.",
        "This is not a grudging concession. It is the honest consequence of the book being " +
          "made by a person rather than a machine, and it is the best moment to catch " +
          "anything, because after it the book exists as an object.",
      ],
    },
    {
      heading: "Anything wrong with the book itself",
      body: [
        "If the printing is poor, the binding is wrong, a page is missing or the book arrives " +
          "damaged, we reprint it and send it again, free, and you do not send the first one " +
          `back unless we ask. Send a photograph of the problem and your order reference to ` +
          `${BRAND.support}.`,
        "This is unconditional and it is not limited by anything below. Your rights under the " +
          "Australian Consumer Law are not affected by anything on this page.",
      ],
    },
    {
      heading: "Changing your mind",
      body: [
        "A personalised book cannot be returned for a change of mind. It is printed with one " +
          "child's name through it and there is nobody else it can be sold to, which is why " +
          "goods made to a customer's specification carry no cooling-off right.",
        `That is also why the ${CHANGE_WINDOW_HOURS}-hour window above exists and why every ` +
          "page of the book is shown to you, personalised and unwatermarked, before you are " +
          "asked for any money. You see exactly what you are buying first.",
      ],
    },
    {
      heading: "How to reach us",
      body: [
        `Reply to your order confirmation email, or write to ${BRAND.support}, quoting your ` +
          "order reference. It is the fastest way, because the reference is what we look the " +
          "order up by.",
      ],
    },
  ],
};

export const PRIVACY: Policy = {
  slug: "/privacy",
  title: "Privacy",
  nav: "Privacy",
  lede: `What ${BRAND.name} collects, who holds it, and for how long.`,
  sections: [
    {
      heading: "Your photograph stays in your browser until you order",
      body: [
        "While you are making the book, the photograph you choose is resized and held in your " +
          "own browser. It is not uploaded, and nothing on our side has a copy of it. Closing " +
          "the tab without ordering leaves us with nothing, because there was never anything " +
          "to leave.",
        "When you place the order, the photograph is sent to us and stored so the book can be " +
          "printed. It is kept in private storage that only the shop's own credentials can " +
          "read — it is never published at a public address and it is never used for anything " +
          "but printing your book.",
      ],
    },
    {
      heading: "What we hold about an order",
      body: [
        "The name as it will be printed, the dedication and from-line you wrote, which look " +
          "and cover you chose, your photograph, which edition you bought, the amount charged, " +
          "the delivery address and the email address you gave at the checkout. That is the " +
          "whole of it, and all of it exists to print and send one book.",
        "There is no account, no password and no tracking of you between visits. We do not " +
          "sell anything to anybody and we do not send marketing email.",
      ],
    },
    {
      heading: "Who else holds something",
      body: [
        "Stripe takes the payment. Your card number is typed on Stripe's own page and never " +
          "touches this site — we never see it, and there is nowhere in our records to put " +
          "one. Stripe gives us back the amount, the delivery address and your email address, " +
          "and keeps the payment record under its own privacy policy.",
        "Cloudflare R2 stores the order and the photograph. Resend sends the confirmation " +
          "email. Vercel hosts the site. Each of them handles the data only to do that job.",
      ],
    },
    {
      heading: "How long",
      body: [
        "The order and the photograph are kept while the book is being made and afterwards, " +
          "so that a damaged or lost book can be reprinted from exactly the same file. " +
          "Nothing is deleted automatically.",
        `Ask us at ${BRAND.support} to delete your order and we will, including the ` +
          "photograph — once it is gone we can no longer reprint that book, which is the only " +
          "reason it is kept at all.",
      ],
    },
    {
      heading: "Seeing what we hold",
      body: [
        `Write to ${BRAND.support} with your order reference and we will tell you everything ` +
          "we hold about the order, correct anything wrong, or delete it.",
      ],
    },
  ],
};

export const TERMS: Policy = {
  slug: "/terms",
  title: "Terms of sale",
  nav: "Terms",
  lede: `What you are buying from ${BRAND.name}, and when the sale becomes a sale.`,
  sections: [
    {
      heading: "What you are buying",
      body: [
        "One printed, personalised book, made to the content you entered: the name, the " +
          "dedication, the from-line, the photograph, the look and the cover shown to you in " +
          "the preview. Every page is shown before you pay, so what you approved is what is " +
          "printed.",
        `The price is ${prices}, in Australian dollars, including delivery to an address we ` +
          "post to.",
      ],
    },
    {
      heading: "When the contract is made",
      body: [
        "Putting a book together on this site is not an order and pressing the button is not " +
          "a purchase: it takes you to Stripe's payment page, and until a payment there " +
          "succeeds nothing has been ordered and nothing has been charged.",
        "The contract is made when the payment succeeds and we send you an order confirmation " +
          "with a reference on it. If we cannot make the book — a photograph that will not " +
          "print, or anything else — we will say so and refund you in full.",
      ],
    },
    {
      heading: "What you are responsible for",
      body: [
        "The spelling, and the right to use the photograph you upload. The name is shown to " +
          "you on its own, in the typeface it will be printed in, and you have to confirm it " +
          `before the checkout opens — and you have ${CHANGE_WINDOW_HOURS} hours after ` +
          "ordering to change anything.",
        "We will not print content that is unlawful, or that infringes somebody else's " +
          "rights. If we refuse an order on those grounds we refund it in full.",
      ],
    },
    {
      heading: "Changes, faults and refunds",
      body: [
        "Getting it right says what happens when something is wrong with the book and when it " +
          "can be changed. Nothing on this page limits your rights under the Australian " +
          "Consumer Law.",
      ],
    },
    {
      heading: "The book itself",
      body: [
        "The artwork and the story in the book remain ours. The book is yours: read it, give " +
          "it, keep it. What you may not do is reproduce the artwork or the text separately " +
          "from it.",
      ],
    },
  ],
};

/**
 * The four, in the order the footer lists them.
 *
 * Delivery and getting-it-right first because they are what a buyer looks for;
 * privacy and terms after, because they are what a buyer is told to have.
 */
export const POLICIES: readonly Policy[] = [DELIVERY, RETURNS, PRIVACY, TERMS] as const;

export function policyFor(slug: string): Policy | null {
  return POLICIES.find((p) => p.slug === slug) ?? null;
}

/** Every word of a policy as one string. For a test, and for nothing else. */
export function wordsOf(policy: Policy): string {
  return [policy.title, policy.lede, ...policy.sections.flatMap((s) => [s.heading, ...s.body])].join(
    " ",
  );
}
