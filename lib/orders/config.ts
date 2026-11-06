/**
 * **Which variables the order store needs, on their own.**
 *
 * A separate file for one array, because the thing that needs to know whether
 * orders can be stored is `lib/checkout.ts` — read by a page — and the module
 * that *does* the storing reaches the renderer, which reaches `@resvg/resvg-js`
 * and the font files. Importing the implementation to read a list of four
 * strings would trace native code into every page that asks the harmless
 * question "is this shop open".
 */

export const STORE_REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/** Where the records and the photographs sit inside the bucket. */
export const ORDER_PREFIX = "orders/";
export const PHOTO_PREFIX = "photos/";
