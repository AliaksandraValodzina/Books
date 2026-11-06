"use client";

/**
 * **The persistent bar: what is done, what it costs, and the one way on.**
 *
 * It tracks *what has been supplied* rather than *where you are*, because there
 * is no step two to be on — the whole book is already in front of them. A tick
 * per ask and a single `Continue` is the shape all three sellers studied
 * arrived at, and the research is explicit that the bar is how a buyer knows
 * the book is finished without being told it is not.
 *
 * **The optional asks are ticked, not gated.** `ASKS` marks which are required
 * and `isComplete` reads the same table, so the photograph and the from-line
 * show as done when they are done and never stop `Continue`. A nice-to-have
 * that blocks the button is a reason to leave.
 *
 * **The cover colourway lives here**, which is the captain's decision and the
 * one place the "extras live on the page they affect" rule is deliberately not
 * applied. Two reasons, and the second is the real one: a cover is a property
 * of the *object* rather than of a page, and the cover spread is the one spread
 * where a panel below the page would sit under the thing being chosen while the
 * buyer is trying to compare three of them. In the bar it is visible from
 * anywhere in the book, which is where they actually make up their mind.
 *
 * **It says what is missing rather than failing silently.** `BuyButton` on the
 * single page already records why: a disabled button with no explanation is the
 * commonest way a checkout loses a sale that was already made — the buyer
 * presses it, nothing happens, and they leave believing the site is broken.
 *
 * `Continue` goes to `./Confirm.tsx` first and to the till after it. That is
 * the one interruption in the whole flow and `Confirm` argues for it: a name
 * inside artwork gets skimmed, and this is the last moment a typo is free.
 *
 * **The request to the till lives here**, because it needs the fill, the
 * edition and the photograph's bytes, which are what `useBook()` holds.
 * `Confirm` takes a callback instead so that it stays renderable without a
 * browser — `./Confirm.tsx` § the button is here and the request is not.
 *
 * Two refusals, told apart deliberately:
 *
 * - **about the shop** (no Stripe key, no order store, Stripe would not
 *   answer): the buyer goes to `/checkout`, which is the page that explains
 *   those and says nothing has been charged.
 * - **about this order** (a photograph the server will not accept, an order
 *   that no longer validates): the message appears under the button and the
 *   buyer keeps their place, because nothing is wrong with the shop and
 *   navigating away would lose them the screen they can fix it on.
 */

import { useCallback, useState } from "react";
import { ASKS } from "../../lib/book/slots";
import { editionOf, priceOf } from "../../lib/book/editions";
import { bytesOf, outstanding } from "../../lib/book/order";
import { nameSlotFont } from "../../lib/book/name";
import { FACES } from "../../lib/render/fonts";
import Confirm from "./Confirm";
import { useBook } from "./BookProvider";

export default function Bar() {
  const { book, order, fill, setCover, done, ready, persistence } = useBook();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const missing = outstanding(order, book);
  const edition = editionOf(order.editionId);

  /**
   * Send the order and go where the answer says.
   *
   * **It never renders anything resembling a confirmation itself.** The only
   * two destinations are Stripe's own hosted page and `/checkout`, which is
   * the honest refusal — `lib/checkout.ts` exists to make sure there is no
   * third.
   */
  const buy = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fill, editionId: order.editionId, photos: bytesOf(order) }),
      });
      const answer: unknown = await response.json().catch(() => null);
      const url = (answer as { url?: string } | null)?.url;
      if (response.ok && typeof url === "string") {
        // Stripe's hosted page. A replace rather than an assign, so the back
        // button from the card form returns to the book and not to a POST.
        window.location.assign(url);
        return;
      }

      const ref = (answer as { ref?: string } | null)?.ref;
      if (response.status === 409 && ref) {
        setProblem(`That order has already been paid for — it is ${ref}. Check your email.`);
        return;
      }
      if (response.status === 422) {
        const problems = (answer as { problems?: Array<{ code?: string }> } | null)?.problems;
        setProblem(
          "The shop would not accept this order: " +
            (problems?.map((p) => p.code).filter(Boolean).join(", ") ?? "it did not validate") +
            ". Nothing has been charged.",
        );
        return;
      }
      // Everything else is about the shop rather than about this order, and
      // `/checkout` is the page that says so plainly.
      window.location.assign("/checkout");
    } catch {
      setProblem("The till could not be reached. Nothing has been charged — try again.");
    } finally {
      setBusy(false);
    }
  }, [fill, order]);

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-10 border-t border-current/15 bg-[var(--ground)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {confirming ? (
        <Confirm
          // `fill.name`, never `typedName`: this screen shows what will be
          // printed, and the two differ exactly when the press cannot write
          // what was typed.
          name={fill.name}
          face={FACES[nameSlotFont(book)]?.family}
          edition={edition}
          onBack={() => setConfirming(false)}
          onConfirm={() => void buy()}
          busy={busy}
          problem={problem}
        />
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="progress">
            {ASKS.map((ask) => (
              <li
                key={ask.id}
                data-testid={`ask-${ask.id}`}
                data-done={done[ask.id] ? "yes" : "no"}
                data-required={ask.required ? "yes" : "no"}
                className={`flex items-center gap-1.5 text-sm ${done[ask.id] ? "" : "opacity-55"}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] ${
                    done[ask.id] ? "bg-[#1f7a4d] text-white" : "border-2 border-current/40"
                  }`}
                >
                  {done[ask.id] ? "✓" : ""}
                </span>
                <span className="sr-only">{done[ask.id] ? "done:" : "still to do:"}</span>
                {ask.label}
                {ask.required ? null : <span className="opacity-60"> (optional)</span>}
              </li>
            ))}
          </ul>

          {/* ---- the cover colourway, chosen from anywhere in the book ---- */}
          <fieldset className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <legend className="sr-only">The cover colour</legend>
            <span className="text-sm opacity-70">Cover</span>
            {book.covers.map((cover) => (
              <button
                key={cover.id}
                type="button"
                onClick={() => setCover(cover.id)}
                aria-pressed={order.coverId === cover.id}
                data-testid={`cover-${cover.id}`}
                className={`flex items-center gap-1.5 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-medium transition ${
                  order.coverId === cover.id ? "border-[#B22741]" : "border-current/20"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ background: cover.colour }}
                />
                {cover.label}
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            data-testid="continue"
            className="mt-3 w-full rounded-xl bg-[#B22741] px-5 py-3.5 text-lg font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:bg-[#2b1d14]/25 disabled:text-[#2b1d14]/70 disabled:shadow-none"
          >
            {ready
              ? `Continue — ${edition.label.toLowerCase()}, ${priceOf(edition.price)}`
              : "Finish the book first"}
          </button>

          <p className="mt-1.5 text-center text-[0.78rem] opacity-70" role="status">
            {ready
              ? "One more screen to check the spelling, then the till. Nothing is charged yet."
              : `Still to do: ${missing.join(", ")}.`}
          </p>
        </>
      )}

      {persistence && !persistence.saved ? (
        <p className="mt-1 text-center text-[0.72rem] text-[#8e1c33]">
          {persistence.reason === "quota" && persistence.wordsKept
            ? "This browser would not keep the photograph — the words are saved, the photograph is only in this tab."
            : "This browser will not remember the book. It is still here until you close the tab."}
        </p>
      ) : null}
    </div>
  );
}
