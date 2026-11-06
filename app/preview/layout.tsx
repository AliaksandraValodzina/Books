/**
 * The preview's own title.
 *
 * `./page.tsx` is a client component — the book it draws comes entirely from an
 * order in `localStorage`, and a server render could only ever show an empty
 * book and then replace it — and a client component cannot export `metadata`.
 * A layout can, so the title lives here rather than the page losing its own.
 */

import type { Metadata } from "next";
import { FIRST_BOOK } from "../../templates/first-book";

export const metadata: Metadata = {
  title: `${FIRST_BOOK.name} — every page, before you pay`,
  description:
    "The whole book, personalised, with no watermark and no account. Read it before you order.",
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
