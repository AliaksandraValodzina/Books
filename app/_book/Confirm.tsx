"use client";

/**
 * **Confirm the spelling: the name, large and alone, and they have to click
 * past it.**
 *
 * The captain's own instruction, and the reasoning is a single observation that
 * is worth taking seriously because it is about reading rather than about
 * design: **a name inside artwork gets skimmed; a name alone gets read.** The
 * buyer has just spent several minutes looking at twenty-five pages of a book
 * with their child's name set into illustrations, a story and a cover. Their
 * eye has stopped checking it — it is part of the picture now. Taking it out of
 * the picture, setting it on nothing, and refusing to go on until they press a
 * button is the only thing that makes them actually look.
 *
 * **This is where typos die, and it is the last place they can.** Everything
 * downstream is irreversible in the way only a physical object is: the file is
 * rendered, a human uploads it, a press prints it, and a book arrives with a
 * misspelled name in it six times. The captain's standing policy is to reprint
 * a customer's own typo once, free, which is the right policy and costs about
 * AUD 20 a time — this screen is what keeps that rare.
 *
 * **It is not a wall.** The research's strongest finding is that the book is
 * shown with no watermark, no account and no gate, and that is untouched: the
 * whole book is already read by the time anybody arrives here, this sits after
 * `Continue` rather than before the preview, and "Let me change it" goes
 * straight back. A confirmation step inside a checkout is not a gate in front
 * of a product.
 *
 * **The name is set in the face it will print in.** `app/layout.tsx` injects
 * the `@font-face` rules from `lib/render/fonts.ts` — the same table the
 * rasteriser reads its file paths from — so the letterforms here are the
 * letterforms on the cover. Showing it in the page's UI font would be showing
 * them a different thing and asking them to approve this one.
 *
 * **The button is here and the request is not.** It takes `onConfirm` rather
 * than owning a `fetch`, because sending the order means reading the fill, the
 * edition and the photograph's bytes out of `useBook()` — and a component that
 * reached into context could only ever be rendered with an empty order in this
 * suite, since `BookProvider` loads from `localStorage` in an effect and
 * effects do not run in a server render. `./Bar.tsx` makes the request; this
 * screen stays the one assertion that matters, *the name the buyer typed is
 * what is shown*, and stays testable.
 */

import { priceOf, type Edition } from "../../lib/book/editions";

/**
 * **It takes what it shows rather than reading it out of context**, which is
 * why this file has a test.
 *
 * `CLAUDE.md`'s rule for the editor applies here exactly: the arithmetic is
 * pure and the React is glue, so the React is tested without a browser. A
 * component that reached into `useBook()` could only be rendered with an empty
 * order — the provider loads from `localStorage` in an effect and effects do
 * not run in a server render — so the one assertion that matters, *the name
 * the buyer typed is what this screen shows*, would have been untestable
 * without adding a DOM to the suite.
 */
export default function Confirm({
  name,
  face,
  edition,
  onBack,
  onConfirm,
  busy = false,
  problem = null,
}: {
  /** The name exactly as it will print — `BookFill.name`, never the raw field. */
  name: string;
  /** The CSS family of the face it is set in, or undefined to use the page's. */
  face?: string;
  edition: Edition;
  onBack: () => void;
  /** Send the order to the till. `./Bar.tsx` owns the request. */
  onConfirm: () => void;
  /** True while the till is being opened, so the button cannot be pressed twice. */
  busy?: boolean;
  /**
   * What went wrong, in the buyer's words.
   *
   * Shown here rather than navigated to, because a buyer whose card never got
   * asked for has lost nothing and should not lose their place either. The
   * refusals that are *about the shop* rather than about this order send them
   * to `/checkout`, which is the page that explains those — see `./Bar.tsx`.
   */
  problem?: string | null;
}) {
  return (
    <div data-testid="confirm" role="group" aria-labelledby="confirm-heading">
      <p id="confirm-heading" className="text-center text-sm opacity-70">
        This is how it will be printed:
      </p>

      {/*
        Alone on a line, as large as the bar can carry, and nothing beside it.
        No cover thumbnail, no story, no price on this line — anything else here
        is something for the eye to go to instead.
      */}
      <p
        data-testid="confirm-name"
        lang="en"
        className="mt-1 break-words text-center text-4xl leading-tight sm:text-5xl"
        style={face ? { fontFamily: `"${face}", serif` } : undefined}
      >
        {name}
      </p>

      <p className="mt-2 text-center text-[0.78rem] opacity-70">
        It is printed on the cover and inside the book exactly as spelled here. Check the accents
        and the capitals — a printed page cannot be changed.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse">
        {/*
          The one way on. It posts the order to `/api/checkout`, which writes
          the order down and opens a hosted Stripe Checkout Session — or, with
          the shop not configured, refuses and says plainly that nothing has
          been charged. Never a crash, and never a fake success.
        */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          data-testid="confirm-yes"
          className="w-full rounded-xl bg-[#B22741] px-5 py-3.5 text-lg font-semibold text-white shadow-lg disabled:opacity-60 sm:flex-1"
        >
          {busy ? "Opening the till…" : "Yes — that is right"}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          data-testid="confirm-back"
          className="rounded-xl border-2 border-current/25 px-5 py-3.5 font-medium disabled:opacity-60 sm:flex-1"
        >
          Let me change it
        </button>
      </div>

      <p className="mt-1.5 text-center text-[0.78rem] opacity-70" role="status">
        {problem ? (
          <span data-testid="confirm-problem" className="font-medium text-[#8e1c33]">
            {problem}
          </span>
        ) : (
          <>
            {edition.label}, {priceOf(edition.price)}. The card is typed on Stripe&rsquo;s own
            page — this site never sees it.
          </>
        )}
      </p>
    </div>
  );
}
