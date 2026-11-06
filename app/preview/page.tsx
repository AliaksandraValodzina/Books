/**
 * **The whole book, every page, with no wall in front of it.**
 *
 * The second and last screen of the buyer flow. `./_book/Preview.tsx` carries
 * the argument for what is on it; this is the route.
 *
 * It is a **client page**, which is unusual in this repository and is the right
 * answer here for one reason: the book that is drawn depends entirely on an
 * order that lives in `localStorage`. A server render could only ever show an
 * empty book and then replace it, which is a flash of the wrong book on the one
 * screen the buyer is being asked to approve.
 *
 * There is no gate. A visitor who arrives here with no order sees the book with
 * no name in it and a bar saying what is still to do, which is the honest state
 * and is recoverable in one tap — a redirect would be a wall, and the whole
 * point of this screen is that there is not one.
 */

"use client";

import { FIRST_BOOK } from "../../templates/first-book";
import BookProvider from "../_book/BookProvider";
import Preview from "../_book/Preview";
import Downloads from "../_book/Downloads";

export default function PreviewPage() {
  return (
    <main className="mx-auto w-full max-w-[46rem] px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-sm">
        <a className="underline opacity-70" href="/">
          ← Change the name or the baby
        </a>
      </p>

      <BookProvider book={FIRST_BOOK}>
        <div className="mt-4">
          <Preview />
        </div>
        <Downloads />
      </BookProvider>
    </main>
  );
}
