"use client";

/**
 * **The whole book, every page, with no wall in front of it.**
 *
 * `kn-whole-book-preview` measured thirteen sellers and this is the strongest
 * single finding in the research: Wonderbly shows **36 of 36 pages**
 * personalised, unwatermarked, with no account; Hooray Heroes shows 29 of 29.
 * The photo-book sellers who *do* wall their editor behind an email address
 * wall it because the editor *is* the funnel there. This is a narrative book,
 * so it is in the first group, and **there is no watermark, no account and no
 * wall anywhere in this component.**
 *
 * **One page or two, and two is the default on a wide screen.** A bound book
 * shows two pages at a time and the artwork is drawn as spreads; one page at a
 * time is what a phone can actually show. `spreads()` in `lib/book/derive.ts`
 * does the pairing, so the preview, the gutter rule in the upload contract and
 * the print file all agree about which page faces which.
 *
 * **The controls are on the pages they affect** — see `./Controls.tsx`, which
 * asks the template which page carries which slot rather than being told.
 */

import { useState } from "react";
import {
  pageSequence,
  pageWithSlot,
  spreads as spreadsOf,
} from "../../lib/book/derive";
import { SLOT } from "../../lib/book/slots";
import BookPage from "./BookPage";
import Bar from "./Bar";
import { DedicationControl, UpgradeControl } from "./Controls";
import { useBook } from "./BookProvider";

/** How a page is referred to out loud. The cover is not page zero to a buyer. */
function nameOf(id: string): string {
  return id === "cover" ? "Cover" : `Page ${Number(id.replace("page-", ""))}`;
}

export default function Preview() {
  const { book } = useBook();
  const [two, setTwo] = useState(true);
  const sequence = pageSequence(book);
  const groups = two ? spreadsOf(book) : sequence.map((_, i) => [i]);

  const photoPage = pageWithSlot(book, SLOT.photo);
  const dedicationPage = pageWithSlot(book, SLOT.dedication);
  /**
   * Where the upgrade is offered: the group **after** the one the dedication is
   * on.
   *
   * "Offered exactly once" is therefore a property of mounting rather than a
   * flag the card checks — there is one group whose index is this, so there is
   * one card. The position is MyStoryTale's and it is the one thing worth
   * taking from them: after the dedication, before the cart.
   */
  const dedicationGroup = groups.findIndex((g) => g.includes(dedicationPage));
  const upgradeGroup = dedicationGroup >= 0 ? dedicationGroup + 1 : -1;

  /**
   * The controls this group of pages carries, if any.
   *
   * The photograph and the dedication are one panel on one page — see
   * `./Controls.tsx` — so the photo page is asked about only to assert that the
   * template still agrees with that. If somebody moves the photo slot to
   * another spread the panel stays with the dedication and the note below says
   * so, rather than the photograph silently losing its control.
   */
  const controlsFor = (group: number[], index: number) => (
    <>
      {group.includes(dedicationPage) ? <DedicationControl pageIndex={photoPage} /> : null}
      {group.includes(photoPage) && !group.includes(dedicationPage) ? (
        <p className="mt-3 text-sm opacity-70">
          The photograph for this page is set with the dedication, earlier in the book.
        </p>
      ) : null}
      {index === upgradeGroup ? <UpgradeControl /> : null}
    </>
  );

  return (
    <section aria-label="Your whole book">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold">Your whole book</h2>
        <div
          className="flex rounded-full border-2 border-current/20 p-0.5 text-sm"
          role="group"
          aria-label="How many pages at a time"
        >
          <button
            type="button"
            onClick={() => setTwo(false)}
            aria-pressed={!two}
            data-testid="one-page"
            className={`rounded-full px-3 py-1 font-medium ${!two ? "bg-[#2b1d14] text-[#efe9df]" : ""}`}
          >
            One page
          </button>
          <button
            type="button"
            onClick={() => setTwo(true)}
            aria-pressed={two}
            data-testid="two-page"
            className={`rounded-full px-3 py-1 font-medium ${two ? "bg-[#2b1d14] text-[#efe9df]" : ""}`}
          >
            Two pages
          </button>
        </div>
      </div>

      <p className="mt-1 text-sm opacity-65">
        All {sequence.length} pages, exactly as they will print. No watermark, no account.
      </p>

      <ol className="mt-5 space-y-8" data-testid="pages">
        {groups.map((group, index) => (
          <li key={group.join("-")}>
            <div
              className={`grid gap-1 overflow-hidden rounded-xl shadow-xl shadow-black/15 ${
                group.length === 2 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {group.map((index) => (
                <BookPage key={index} index={index} label={nameOf(sequence[index].id)} />
              ))}
            </div>
            <p className="mt-1.5 text-[0.72rem] uppercase tracking-wide opacity-50">
              {group.map((i) => nameOf(sequence[i].id)).join(" · ")}
            </p>
            {controlsFor(group, index)}
          </li>
        ))}
      </ol>

      <Bar />
    </section>
  );
}
