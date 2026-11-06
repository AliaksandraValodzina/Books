/**
 * **The roles a slot in this book can have, and nothing else.**
 *
 * A single page's format lets a template invent any slot name it likes, and
 * that is right there: a page is authored and filled together, so a slot called
 * `wordTop` means whatever the one editor of that page decides it means.
 *
 * A book is not like that. The buyer fills **a handful of fields on one form** and
 * those fields are then drawn on twenty-five pages they never see individually.
 * So the relationship has to run the other way: the *roles* are fixed and a
 * page says which of them it carries. A page that invented a fourth slot name
 * would print a dashed placeholder box in a finished book, because there is
 * nothing on the form that could ever fill it — and `./validate.ts` refuses
 * exactly that.
 *
 * It is also what makes "the extras live on the page they affect" buildable
 * rather than hand-maintained: the flow asks *which page carries the photo
 * slot* and puts the `Personalise with a photo` control on that spread. Nobody
 * writes down that it is page twenty-one.
 */

/**
 * The slot names a book page may use.
 *
 * These strings are **published**: they are keys in a stored `PageFill`, so
 * renaming one invalidates every order composed before the rename. Treat them
 * the way `Look.id` is treated.
 */
export const SLOT = {
  /** The baby's name. Appears on several pages; the cover is one of them. */
  name: "babyName",
  /** The buyer's one photograph. Exactly one page in the book carries it. */
  photo: "photo",
  /** The dedication. Exactly one page carries it, and it is multi-line. */
  dedication: "dedication",
  /**
   * The authored narrative line or two for a spread.
   *
   * **The one role the buyer does not fill.** Its words come from the page's
   * own `story` field — the captain writes them once, for every order — and it
   * is a slot rather than paint so that a typo is one edit rather than a
   * re-render of twenty-four images, and so that a second language stays
   * possible. `docs/look-upload-contract.md` § 3 is the same rule addressed to
   * whoever generates the artwork: no text, burned in, anywhere.
   */
  story: "storyText",
  /**
   * The optional line under the dedication — "Grandma", "Mum and Dad".
   *
   * Its own role rather than the last line of the dedication, because it is
   * set differently (one line, the handwritten face, smaller) and because it
   * is **optional**: a dedication with no signature is a complete dedication,
   * and folding the two together would make the bar unable to say which of
   * them is still missing.
   */
  from: "fromLine",
} as const;

export type SlotRole = (typeof SLOT)[keyof typeof SLOT];

export const TEXT_ROLES: readonly SlotRole[] = [SLOT.name, SLOT.dedication, SLOT.story, SLOT.from];
export const PHOTO_ROLES: readonly SlotRole[] = [SLOT.photo];

export function isTextRole(name: string): name is Exclude<SlotRole, typeof SLOT.photo> {
  return TEXT_ROLES.includes(name as SlotRole);
}

export function isPhotoRole(name: string): name is typeof SLOT.photo {
  return name === SLOT.photo;
}

/**
 * What the buyer is asked for, in the order the persistent bar lists it.
 *
 * The bar tracks *what is done* rather than *where you are*, which is the shape
 * all three sellers studied arrived at — there is no step two to be on. So this
 * is a checklist and not a route table, and it lives here because the bar, the
 * `Continue` button and the completeness check must agree about what "done"
 * means.
 */
export const ASKS = [
  { id: "name", label: "Name", required: true },
  { id: "look", label: "Baby", required: true },
  { id: "cover", label: "Cover", required: true },
  { id: "dedication", label: "Dedication", required: true },
  /**
   * Both **optional**, and the bar says so rather than ticking them silently.
   *
   * A parent with no photograph they are happy with still gets the book, and a
   * dedication with no signature is a complete dedication. Blocking `Continue`
   * on either would turn a nice-to-have into a reason to leave — which is the
   * opposite of what a checklist is for.
   */
  { id: "photo", label: "Photo", required: false },
  { id: "from", label: "From", required: false },
] as const;

/**
 * The name-substitution token a page's `story` may carry.
 *
 * One token and no expression language. A story line is copy somebody types in
 * a document and pastes into a template, and the moment it can contain a
 * conditional it is a program nobody tests — which would then be running inside
 * a printed book. `{name}` is the whole of it, and `./validate.ts` checks that
 * a line carrying one still fits with the longest name the form will take.
 */
export const NAME_TOKEN = "{name}";

export type AskId = (typeof ASKS)[number]["id"];
