/**
 * **books.keepnook.app — the baby book.**
 *
 * The captain's decision of 6 November: *"the baby book takes
 * books.keepnook.app."* "My Forever", the heart-and-photograph keepsake page
 * that used to be here, steps back to being the technical spine and lives at
 * [`/my-forever`](./my-forever/page.tsx). It is not deleted — it is the proven
 * template-and-renderer example and may return as a second title.
 *
 * The order of what follows is the argument, not a layout preference, and it is
 * the shape three narrative-book sellers independently arrived at:
 *
 * 1. **The object**, small and honest — a render of the cover, captioned as a
 *    render, because nothing has been printed yet.
 * 2. **One line** saying what it is.
 * 3. **The form**, labelled *Step 1 of 1*: a name, the question before the
 *    grid, and the grid of babies. `./_book/Chooser.tsx` carries the reasoning.
 * 4. **Straight into the whole book** at `/preview` — every page, no watermark,
 *    no account, no wall.
 *
 * The static parts stay **server components**: `BookProvider` is a client
 * component wrapping server-rendered children, so the facts cost no JavaScript
 * while the form above them knows the state of the order.
 *
 * **It draws nothing itself.** The cover comes from `renderPageSvg` — the same
 * call the print path makes.
 */

import type { Metadata } from "next";
import { FIRST_BOOK } from "../templates/first-book";
import { pageFillFor, pageTemplateFor } from "../lib/book/derive";
import { renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import { PLACEHOLDER, type Fact } from "../lib/product";
import { BOOK_FACTS, BOOK_GUARANTEES, BOOK_PROMISES } from "../lib/book/product";
import { EDITIONS, priceOf } from "../lib/book/editions";
import BookProvider from "./_book/BookProvider";
import Chooser from "./_book/Chooser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Book of You — a printed book with their name in it",
  description:
    "Twelve spreads of a day in their life, with their name through the story, one of your own photographs, and a dedication in the front.",
};

const book = FIRST_BOOK;

/**
 * **1. The object.**
 *
 * A *render* of the cover, not a photograph of a printed book, because there is
 * no photograph of a printed book in this repository — nothing has been printed
 * yet. The caption says so rather than letting a flat picture imply an object.
 * **The captain needs to take that photograph**; when there is one it replaces
 * this and the caption goes.
 *
 * It carries a real name because a blank cover sells nothing, and it is the
 * fixture's name rather than an empty slot so that what a visitor sees first is
 * a finished book.
 */
function CoverBand() {
  const svg = renderPageSvg(
    pageTemplateFor(book, 0, { lookId: book.looks[0].id, coverId: book.covers[0].id }),
    pageFillFor(book, 0, {
      schema: 1,
      bookId: book.id,
      bookRev: book.rev,
      lookId: book.looks[0].id,
      coverId: book.covers[0].id,
      name: "Rosalind",
      dedication: "",
    }),
    { href: assetUrl },
  );

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-[8rem] shrink-0 overflow-hidden rounded-lg shadow-xl shadow-black/25 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{book.name}</h1>
        <p className="mt-1 text-sm opacity-75">{book.blurb}</p>
        <p className="mt-1.5 text-[0.7rem] opacity-50">
          A render of the cover, not a photograph of the printed book — nothing has been printed
          yet, and the artwork here is a placeholder.
        </p>
      </div>
    </div>
  );
}

/**
 * A fact, or the admission that there is not one yet.
 *
 * An unconfirmed `Fact` has no `value` field to render — the type has no room
 * for one — so this cannot accidentally print a plausible number. See
 * `lib/product.ts`.
 */
function FactRow({ fact }: { fact: Fact }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-current/10 py-2">
      <dt className="text-sm opacity-70">{fact.label}</dt>
      {fact.confirmed ? (
        <dd className="text-sm font-medium">{fact.value}</dd>
      ) : (
        <dd className="max-w-[26rem] text-right text-sm">
          <span className="rounded bg-[#B22741]/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-[#8e1c33]">
            {PLACEHOLDER}
          </span>
          <span className="mt-1 block text-[0.72rem] opacity-60">{fact.needs}</span>
        </dd>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[42rem] px-4 py-6 sm:px-6 sm:py-10">
      <CoverBand />

      <BookProvider book={book}>
        <Chooser />
      </BookProvider>

      <section className="mt-14">
        <h2 className="text-lg font-semibold">What you get</h2>
        <dl className="mt-3">
          {BOOK_FACTS.map((fact) => (
            <FactRow key={fact.label} fact={fact} />
          ))}
        </dl>
        <ul className="mt-4 space-y-1.5 text-sm opacity-80">
          {BOOK_GUARANTEES.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.72rem] opacity-55">
          The marked rows are the ones nobody here has a number for. Writing a plausible price and
          tidying it later would be a made-up commercial claim on a public page, and a customer
          cannot tell a guess from a quote.
        </p>
      </section>

      {/*
        **One real price, and the upgrade beside it rather than above it.**

        No struck-out "was", no percentage, no countdown, and nothing in
        `lib/book/editions.ts` that could express one — the register the captain
        settled is premium and honest, and `docs/pricing.md` carries the legal
        reasoning for why a fabricated comparison is not merely tasteless. The
        launch offer they intend is real but has no end date yet, and an offer
        with no stated end is exactly the mechanic being avoided, so it is
        absent rather than approximated.
      */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">What it costs</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {EDITIONS.map((edition) => (
            <li key={edition.id} className="rounded-xl border border-current/15 p-3">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{edition.label}</span>
                <span className="tabular-nums">{priceOf(edition.price)}</span>
              </p>
              <p className="mt-1 text-sm opacity-70">{edition.note}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-1.5 text-sm opacity-80">
          {BOOK_PROMISES.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-14 border-t border-current/10 pt-5 text-xs opacity-55">
        <p>
          {book.name} — {book.id} @ {book.rev}. {book.pages.length} interior pages and a cover, all
          drawn by one renderer from one description; see <code>docs/template-format.md</code>,{" "}
          <code>docs/look-upload-contract.md</code> and <code>docs/print.md</code>.
        </p>
        <p className="mt-2">
          <a className="underline" href="/my-forever">
            My Forever
          </a>{" "}
          — the single keepsake page this book&rsquo;s machinery was built on, still here.
        </p>
      </footer>
    </main>
  );
}
