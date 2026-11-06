/**
 * **The name of the shop, its domain and its address, in one place.**
 *
 * The shop was called Keepnook and is now **One Little Book**. That rename
 * happened while this money path was being built, which is the whole argument
 * for this file: a brand string is the single most likely thing in a codebase
 * to be typed out in fifteen places and then changed, and the fifteenth copy
 * is always the one on a customer's order confirmation.
 *
 * So **nothing anywhere else writes the name, the domain or the address.** The
 * policy pages, the confirmation email, the page titles and the metadata
 * inside the print file all read them from here, and the next rename is an
 * edit to this object. `test/policy.test.tsx` asserts the old names appear in
 * no copy a customer can read.
 *
 * ## What is a brand string and what is not
 *
 * **"The Book of You" is not here.** That is the *product's* title and it
 * lives on the book template, where a reprint of a year-old order still finds
 * the title that order was placed against. A shop can be renamed without
 * renaming its books.
 *
 * **The references to Keepnook in `lib/`, `docs/` and `test/` are not here
 * either**, and must not be removed: those are citations of a different
 * codebase whose prior art this one follows or deliberately departs from —
 * `docs/template-format.md` § Where this deliberately differs from Keepnook is
 * the clearest example. They are engineering history, not branding, and a
 * find-and-replace over them would destroy the reasoning they carry.
 */

export interface Brand {
  /** As a customer reads it. */
  name: string;
  /** The bare domain, for the metadata inside the print file. */
  domain: string;
  /** With the scheme, for a link. No trailing slash. */
  site: string;
  /**
   * **Where a customer writes when something is wrong.**
   *
   * The returns page tells people to use it and the 24-hour promise depends on
   * it, so it has to be a mailbox that somebody reads — it is a commitment
   * rather than a string. `ORDER_EMAIL_REPLY_TO` overrides it for the
   * confirmation email, which is what a deployment should set if the real
   * address differs.
   */
  support: string;
}

export const BRAND: Brand = {
  name: "One Little Book",
  domain: "onelittlebook.com",
  site: "https://onelittlebook.com",
  support: "hello@onelittlebook.com",
};

/**
 * Names this shop has traded under and must not be shown as trading under now.
 *
 * Kept as data so the check is a test rather than a memory: a page or an email
 * that still says "Keepnook" is a page that confuses a customer about who
 * charged their card.
 */
export const FORMER_NAMES = ["keepnook", "books.keepnook.app"] as const;

/** `One Little Book — Delivery`. One titling, so two pages cannot show two. */
export function pageTitle(what: string): string {
  return `${BRAND.name} — ${what}`;
}
