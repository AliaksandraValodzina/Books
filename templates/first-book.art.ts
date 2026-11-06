/**
 * **The captain's uploaded artwork, by content hash — written by a script, not
 * by hand.**
 *
 * `npm run looks:import -- <dir>` validates a folder against
 * `docs/look-upload-contract.md`, copies every page into the content-addressed
 * asset store, and rewrites this file. Nothing in it is ever typed by a person
 * and no coordinate is ever transcribed: where the slots go is
 * `./first-book.ts`, which does not change when artwork lands.
 *
 * **`null` is the state before any artwork exists**, and it is a real state
 * rather than a missing file. With it null, `./first-book.ts` draws every page
 * from the numbers in its own `SCENES` and puts the chosen look's placeholder
 * baby in it — so the chooser, the whole-book preview and a genuine 3600 px
 * print file all work, are deployed and are tested before a single PNG has been
 * generated. That is the brief's "build against fixtures", expressed as one
 * export.
 *
 * The moment it is not null the book is drawn from the uploaded images instead,
 * the placeholder babies stop being consulted, and the only things that changed
 * are this file and the book's `rev`.
 */

import type { UploadedArt } from "./first-book.art.types";

export const UPLOADED: UploadedArt | null = null;

export default UPLOADED;
