/**
 * **The shape of an artwork import.** Separate from the import itself because
 * `./first-book.art.ts` is *written by a script* and a generated file should
 * declare nothing — it imports this, assigns one constant, and is otherwise
 * data a reviewer can read in a diff.
 */

import type { AssetRef } from "../lib/template/types";
import type { Look } from "../lib/book/types";

export interface UploadedArt {
  /** The day it was imported, so "is this stale" is answerable. Never rendered. */
  importedAt: string;
  /** The looks the upload declared, with their genders, in `looks.json` order. */
  looks: Look[];
  /** Page id -> look id -> the page image. Keys are `cover`, `page-001`, … */
  pages: Record<string, Record<string, AssetRef>>;
}
