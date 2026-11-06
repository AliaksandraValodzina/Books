"use client";

/**
 * **Step 1 of 1 — the whole form, and it says so.**
 *
 * The shape is settled by research and is not a layout preference. Three
 * narrative-book sellers independently arrived at it, and the captain's own
 * specification copies it:
 *
 * **"Step 1 of 1" is doing real work.** It is Wonderbly's own label and it
 * removes the fear of a long form before the form starts. A buyer who believes
 * there are six steps leaves on step one.
 *
 * **The question comes before the grid.** The captain reversed the brief on
 * 6 November after reviewing two sellers that both ask it first; the grid then
 * shows only that answer's looks. The answers are a declared list and so are
 * the looks behind them, and **nothing here counts either** — how many per
 * gender is still being settled and arrives as data.
 *
 * **Every tile is the same page.** Each is page one of its own look, drawn by
 * the one renderer, so the pose is identical by construction and the choice
 * reads as *which baby* rather than *which picture*. That is the research's
 * specific instruction, implemented as "there is no tile image to supply"
 * rather than as a rule somebody has to keep remembering.
 *
 * **The name is refused, not corrected.** What is typed stays typed; the
 * message says what the press cannot print, and `Continue` will not go. See
 * `lib/book/name.ts` for why a name is the one field that must behave this way.
 */

import { useMemo } from "react";
import { looksFor, pageFillFor, pageTemplateFor, tileIndexOf } from "../../lib/book/derive";
import { nameLimit } from "../../lib/book/name";
import { renderPageSvg } from "../../lib/render/svg";
import { useBook } from "./BookProvider";

/**
 * One look's tile: **page one of the book, drawn with that look's baby.**
 *
 * Not a thumbnail, not a crop, not a separately supplied image — a tile that
 * was its own file is a tile that can drift from the book it is advertising,
 * and the first anybody would know is a buyer who chose a baby and got another.
 *
 * **Which page it is comes from the book**, not from this component.
 * `BookTemplate.tilePage` is declared because the opening spread of this book
 * is deliberately babyless — the one spread identical across every look, which
 * is what lets it carry the buyer's photograph and words — and tiles drawn from
 * it would be twelve identical pictures under the question "which baby?".
 *
 * It renders that page with no fill, so a half-typed name does not flicker
 * across twelve tiles while somebody is still deciding.
 */
function Tile({ lookId, label }: { lookId: string; label: string }) {
  const { book, order, setLook } = useBook();
  const chosen = order.lookId === lookId;

  const svg = useMemo(() => {
    const chose = { lookId, coverId: order.coverId };
    const index = tileIndexOf(book);
    const template = pageTemplateFor(book, index, chose);
    const fill = pageFillFor(book, index, {
      schema: 1,
      bookId: book.id,
      bookRev: book.rev,
      lookId,
      coverId: order.coverId,
      name: "",
      dedication: "",
    });
    return renderPageSvg(template, fill, { href: (ref) => `/api/assets/${ref.sha256}.png` });
  }, [book, lookId, order.coverId]);

  return (
    <button
      type="button"
      onClick={() => setLook(lookId)}
      aria-pressed={chosen}
      data-testid={`look-${lookId}`}
      className={`group rounded-xl p-1 text-left transition ${
        chosen ? "bg-[#B22741]" : "hover:bg-current/10"
      }`}
    >
      <div
        className="aspect-square w-full overflow-hidden rounded-lg bg-[#F3E7DA] shadow-md shadow-black/15 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className={`mt-1.5 block text-center text-sm font-medium ${chosen ? "text-white" : ""}`}>
        {label}
      </span>
    </button>
  );
}

export default function Chooser() {
  const { book, typedName, nameVerdict, setName, order, setGender, done } = useBook();
  const genders = book.genders ?? [];
  const grid = looksFor(book, order.genderId);
  const limit = nameLimit(book);
  const canContinue = done.name && done.look;

  return (
    <section aria-labelledby="step" className="mt-8">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] opacity-60">Step 1 of 1</p>
      <h2 id="step" className="mt-1 text-2xl font-semibold">
        Who is the book for?
      </h2>

      {/* ---- the name ---------------------------------------------------- */}
      <label className="mt-6 block">
        <span className="text-sm font-medium">Their name</span>
        <input
          type="text"
          value={typedName}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-testid="name"
          aria-invalid={typedName.length > 0 && !nameVerdict.ok}
          aria-describedby="name-note"
          placeholder="Rosalind"
          className="mt-1.5 w-full rounded-lg border-2 border-current/20 bg-transparent px-3 py-2.5 text-lg outline-none focus:border-[#B22741]"
        />
      </label>
      <p id="name-note" role="status" className="mt-1.5 text-sm">
        {typedName.length === 0 ? (
          <span className="opacity-60">
            It goes on the cover and through the story — up to {limit} letters.
          </span>
        ) : nameVerdict.ok ? (
          <span className="opacity-60">
            {typedName.length} of {limit} letters.
          </span>
        ) : (
          <span data-testid="name-refusal" className="font-medium text-[#8e1c33]">
            {nameVerdict.message}
          </span>
        )}
      </p>

      {/* ---- the question before the grid -------------------------------- */}
      {genders.length > 0 ? (
        <fieldset className="mt-8">
          <legend className="text-sm font-medium">Is the book for a girl or a boy?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {genders.map((gender) => (
              <button
                key={gender.id}
                type="button"
                onClick={() => setGender(gender.id)}
                aria-pressed={order.genderId === gender.id}
                data-testid={`gender-${gender.id}`}
                className={`rounded-full border-2 px-5 py-2 font-medium transition ${
                  order.genderId === gender.id
                    ? "border-[#B22741] bg-[#B22741] text-white"
                    : "border-current/20 hover:border-current/40"
                }`}
              >
                {gender.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* ---- the grid ---------------------------------------------------- */}
      {genders.length === 0 || order.genderId ? (
        <div className="mt-8" data-testid="look-grid">
          <h3 className="text-sm font-medium">Which baby?</h3>
          <p className="mt-1 text-sm opacity-60">
            Every tile is the same page of the same book. Only the baby changes.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {grid.map((look) => (
              <Tile key={look.id} lookId={look.id} label={look.label} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ---- on into the book -------------------------------------------- */}
      {/*
        An anchor rather than `router.push`, which is not a styling choice.
        It is a link to a page, so it should be a link: it works with no
        JavaScript, it can be opened in a new tab, a screen reader announces it
        as navigation, and the component stays renderable outside an App Router
        context — which is what lets `test/book-flow.test.tsx` read this markup
        at all. The disabled state is a real `<button>`, because a link that
        goes nowhere is worse than a button that says why.
      */}
      {canContinue ? (
        <a
          href="/preview"
          data-testid="see-the-book"
          className="mt-8 block w-full rounded-xl bg-[#B22741] px-5 py-4 text-center text-lg font-semibold text-white shadow-lg"
        >
          See the whole book
        </a>
      ) : (
        <button
          type="button"
          disabled
          data-testid="see-the-book"
          className="mt-8 w-full cursor-not-allowed rounded-xl bg-[#2b1d14]/25 px-5 py-4 text-lg font-semibold text-[#2b1d14]/70"
        >
          Name them, and pick a baby
        </button>
      )}
      <p className="mt-2 text-center text-sm opacity-70">
        Every page, no watermark, no account. Nothing is paid for until you say so.
      </p>
    </section>
  );
}
