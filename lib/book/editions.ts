/**
 * **The two editions of the same book, and the one upgrade between them.**
 *
 * One artwork set serves both: Printify's **Softcover Photo Book** (8 × 8 in,
 * its only size) and its **Hardcover Photo Book** (8 × 8 in, one of four) take
 * the same twenty-four rasters and the same cover. So an edition is not a
 * different book, a different template or a different print file — it is a
 * line on an order that decides which product the captain uploads the file to.
 * There is exactly one of these lists and the flow offers the upgrade **once**,
 * which is the placement the captain took from MyStoryTale: after the
 * dedication and before the cart.
 *
 * ## Why this is not in the book template
 *
 * `BookTemplate.rev` is eight hex of the template's own content, and a
 * `BookFill` names `(bookId, bookRev)` so that a reprint of a year-old order
 * cannot pick up an edited book. A price belongs to the **shop** and changes
 * for commercial reasons; putting it in the hashed artefact would mean that
 * putting the launch offer on — or taking it off — restamped the book and
 * marked every order placed before it as stale. The covers and the looks are
 * in the template because they change what is *drawn*. A price does not.
 *
 * ## Why the numbers may be written at all
 *
 * `lib/product.ts` makes it impossible to write a number nobody supplied, and
 * that guard is still in force: these reach the page as `Fact`s and the
 * `confirmed: true` arm requires a `source`. The source is the captain's
 * settled specification of 6 November, which fixed AUD 59 and AUD 69 against
 * measured Printify landed costs (softcover AUD 11.67, hardcover AUD 16.50,
 * read off their own catalogue). That is a decision, not a guess, which is the
 * only thing `confirmed` has ever meant here.
 *
 * ## What is deliberately absent
 *
 * **There is no `was` price, no discount percentage and no deadline.** The
 * captain's register is "premium, honest, no theatre", and the legal reasoning
 * is in `docs/pricing.md`: under Australian Consumer Law a was/now comparison
 * where the higher price was never genuinely charged for a reasonable period is
 * a misleading representation about price. A genuine launch offer with a stated
 * end date is the honest way to the same urgency — and **the end date has not
 * been named**, so there is no offer here to carry one. The type has nowhere to
 * put a discount, which is the same trick `Fact` plays one level up.
 */

/** Minor units are not used: these are whole dollars and nothing charges them yet. */
export interface Money {
  currency: "AUD";
  amount: number;
}

export interface Edition {
  /** Published and permanent — an order names it. */
  id: string;
  /** What the buyer is offered. */
  label: string;
  price: Money;
  /**
   * The Printify blueprint this edition is fulfilled against.
   *
   * Recorded so that "which product do I upload this to" is answered by the
   * order rather than by memory, and **not** used to call anything: there is no
   * printer integration in this product and the brief forbids building one.
   */
  blueprint: string;
  /** One line on the upgrade card. Copy, not a claim. */
  note: string;
}

/**
 * Softcover first, because it is the listed price.
 *
 * The order of this list is the order the upgrade card shows, and the first
 * entry is what a fresh order starts as — an upgrade nobody has been offered
 * yet must not already be selected.
 */
export const EDITIONS: readonly Edition[] = [
  {
    id: "softcover",
    label: "Softcover",
    price: { currency: "AUD", amount: 59 },
    blueprint: "Printify Softcover Photo Book, 8 × 8 in",
    note: "Twenty-four pages and a printed cover. The listed price.",
  },
  {
    id: "hardcover",
    label: "Hardcover",
    price: { currency: "AUD", amount: 69 },
    blueprint: "Printify Hardcover Photo Book, 8 × 8 in",
    note: "The same book, bound hard. It survives being read at bedtime for years.",
  },
] as const;

export const DEFAULT_EDITION = EDITIONS[0].id;

export function isEdition(id: unknown): boolean {
  return typeof id === "string" && EDITIONS.some((e) => e.id === id);
}

export function editionOf(id: string): Edition {
  return EDITIONS.find((e) => e.id === id) ?? EDITIONS[0];
}

/** The upgrade on offer, or null when there is nothing above what they have. */
export function upgradeFrom(id: string): Edition | null {
  const index = EDITIONS.findIndex((e) => e.id === id);
  return index >= 0 && index + 1 < EDITIONS.length ? EDITIONS[index + 1] : null;
}

/** `AUD 59`. One formatting of a price, so two screens cannot show two. */
export function priceOf(money: Money): string {
  return `${money.currency} ${money.amount}`;
}

/** What the upgrade adds, as a price difference. Never shown as a struck-out total. */
export function differenceOf(from: Edition, to: Edition): string {
  return `${from.price.currency} ${to.price.amount - from.price.amount}`;
}
