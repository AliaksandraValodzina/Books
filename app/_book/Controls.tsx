"use client";

/**
 * **One control, on the spread it affects: "Personalise your dedication".**
 *
 * This is the detail the research says to copy precisely and the one most
 * easily lost to a tidy settings panel. Wonderbly does not put "add a photo" in
 * a sidebar — it puts a single button **on the opening spread** that opens a
 * panel holding the photograph *and* the dedication together, and the captain
 * chose that shape from their own capture of it. The buyer never hunts for a
 * control: they turn the pages and the book asks.
 *
 * **Why the two are one panel and not two.** They are on the same page of the
 * same spread — see `templates/first-book.ts` § `page-002` — and they are the
 * same decision: "make the front of the book mine". Splitting them into two
 * dashed boxes under one spread read as two chores; together they read as one.
 * The structural half of that is that the photograph and the dedication *must*
 * be on the look-independent spread, so there is no arrangement of this book
 * in which they are on different spreads.
 *
 * **Which spread it appears on is not written down anywhere.**
 * `pageWithSlot` asks the template which page carries the dedication slot, so
 * moving those layers in `templates/first-book.ts` moves this panel. A
 * component that knew it was page two would be a second copy of a fact the
 * template already holds, and the day they disagreed the buyer would be offered
 * a photograph on a page with nowhere to put one.
 *
 * The **cover** is not here: the captain put the colourway in the persistent
 * bar, because it is a property of the object rather than of a page, and the
 * cover spread is the one spread where a panel would cover the thing being
 * chosen. See `./Bar.tsx`.
 */

import { useMemo, useRef, useState } from "react";
import { acceptLines, explainLines } from "../../lib/editor/lines";
import { dedicationSlot, fromSlot } from "../../lib/book/order";
import { photoFloor } from "../../lib/book/photo";
import { EDITIONS, differenceOf, editionOf, priceOf, upgradeFrom } from "../../lib/book/editions";
import { FACES } from "../../lib/render/fonts";
import CropSurface from "./CropSurface";
import { useBook } from "./BookProvider";

function Panel({
  title,
  done,
  children,
  testId,
}: {
  title: string;
  done: boolean;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="mt-3 rounded-xl border-2 border-dashed border-current/25 p-4"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] ${
            done ? "bg-[#1f7a4d] text-white" : "border-2 border-current/30"
          }`}
        >
          {done ? "✓" : ""}
        </span>
        {title}
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The photograph: upload, crop, delete.
 *
 * The floor it quotes is **derived from the slot's own size**, so the sentence
 * a buyer reads and the refusal that produced it are the same arithmetic —
 * `lib/book/photo.ts`. A message that named a number a check did not use is the
 * commonest way a refusal becomes unanswerable.
 *
 * *"Choose the highest quality one you have"* is the captain's own wording and
 * it is doing work a specification cannot: a photograph too small to print is
 * refused at the moment of upload rather than printed soft, and the cheapest
 * way to avoid that conversation is to ask for the good one first.
 */
function PhotoField({ pageIndex }: { pageIndex: number }) {
  const { order, choosePhoto, removePhoto, busy, notice, book } = useBook();
  const input = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState(false);
  const floor = photoFloor(book);

  return (
    <div className="mt-4 border-t border-current/15 pt-3">
      <p className="text-sm font-medium">Upload a photo</p>
      <p className="mt-0.5 text-sm opacity-70">
        Choose the highest quality one you have. It is printed{" "}
        {floor.inches.toFixed(0)} inches square above your words, so it needs at least{" "}
        {floor.minEdge} pixels on its shorter side — anything straight off a phone will be.
      </p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        data-testid="photo-input"
        onChange={(e) => {
          void choosePhoto(e.target.files?.[0]);
          // Cleared so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
        className="sr-only"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          data-testid="choose-photo"
          className="rounded-lg bg-[#2b1d14] px-4 py-2 text-sm font-semibold text-[#efe9df] disabled:opacity-60"
        >
          {busy ? "Reading it…" : order.photo ? "Choose a different one" : "Upload a photo"}
        </button>

        {order.photo ? (
          <>
            <button
              type="button"
              onClick={() => setCropping((was) => !was)}
              aria-pressed={cropping}
              data-testid="crop-photo"
              className="rounded-lg border-2 border-current/25 px-4 py-2 text-sm font-medium"
            >
              {cropping ? "Done cropping" : "Crop"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCropping(false);
                removePhoto();
              }}
              data-testid="remove-photo"
              className="rounded-lg border-2 border-current/20 px-4 py-2 text-sm font-medium"
            >
              Delete
            </button>
          </>
        ) : null}
      </div>

      {order.photo && cropping ? (
        <div className="mt-3">
          <CropSurface pageIndex={pageIndex} />
        </div>
      ) : null}

      <p role="status" className="mt-2 text-sm">
        {notice ? (
          <span data-testid="photo-notice" className="font-medium text-[#8e1c33]">
            {notice}
          </span>
        ) : order.photo ? (
          <span className="opacity-70">
            {order.photo.asset.px[0]} × {order.photo.asset.px[1]}. It is on the page above —
            nothing has been uploaded anywhere.
          </span>
        ) : (
          <span className="opacity-70">
            Your photograph stays in this browser until you order. It is optional — the book is
            complete without one.
          </span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * **The one panel on the opening spread: the dedication, the from-line and the
 * photograph.**
 *
 * **A hard limit, shown live, and a plain warning to look at the page.** That
 * is Wonderbly's own design — ten lines, a running character count, and a line
 * telling the buyer to check the preview — and the research says to copy it
 * exactly rather than improve on it. Text overflow on a printed page cannot be
 * undone: the book simply arrives wrong.
 *
 * The counter and the limit are **one function**. `acceptLines` produces both
 * what will print and the numbers beside the box, so there is no second
 * implementation of "how much fits" to disagree with the first in front of a
 * paying customer. It is enforced three times for the reasons
 * `TextSlotLayer.maxLines` lays out — here, in `validateBookFill` before money
 * changes hands, and in the renderer itself, which throws.
 *
 * It clamps on blur rather than on every keystroke. Clamping as they type
 * fights the cursor whenever somebody edits the middle of a line; clamping when
 * they look away, with the page above already showing the clamped version, is
 * the same guarantee without the fight.
 */
export function DedicationControl({ pageIndex }: { pageIndex: number }) {
  const { book, order, setDedication, setFrom, done } = useBook();
  const slot = dedicationSlot(book);
  const signature = fromSlot(book);
  const [touched, setTouched] = useState(false);
  const accepted = useMemo(
    () => (slot ? acceptLines(slot, order.dedication) : null),
    [slot, order.dedication],
  );
  const acceptedFrom = useMemo(
    () => (signature ? acceptLines(signature, order.from) : null),
    [signature, order.from],
  );

  if (!slot || !accepted) return null;
  const face = FACES[slot.font]?.family ?? "This face";
  const explanation = explainLines(accepted, face);
  const fromFace = signature ? (FACES[signature.font]?.family ?? signature.font) : "";
  const fromExplanation = acceptedFrom && signature ? explainLines(acceptedFrom, fromFace) : null;

  return (
    <Panel
      title="Personalise your dedication"
      done={done.dedication}
      testId="dedication-control"
    >
      <p className="mt-1 text-sm opacity-70">
        A message in the front of the book, and one of your own photographs above it. Both are on
        the page above, exactly as they will print.
      </p>

      <label className="mt-3 block">
        <span className="text-sm font-medium">Your message</span>
        <textarea
          value={order.dedication}
          onChange={(e) => setDedication(e.target.value)}
          onBlur={() => {
            setTouched(true);
            // What will print, put back in the box. The page above has been
            // showing it all along; this makes the box agree.
            if (accepted.text !== order.dedication) setDedication(accepted.text);
          }}
          rows={6}
          data-testid="dedication"
          aria-describedby="dedication-count"
          placeholder={"For Rosalind,\nwho arrived on a Tuesday\nand changed everything."}
          className="mt-1.5 w-full rounded-lg border-2 border-current/20 bg-transparent px-3 py-2 outline-none focus:border-[#B22741]"
        />
      </label>
      <p id="dedication-count" role="status" className="mt-1 flex flex-wrap gap-x-4 text-sm">
        <span data-testid="dedication-count" className="opacity-70">
          {`${accepted.lines} of ${slot.maxLines ?? 1} lines · ${accepted.chars} of ${slot.maxChars} characters`}
        </span>
        {explanation ? (
          <span data-testid="dedication-notice" className="font-medium text-[#8e1c33]">
            {explanation}
          </span>
        ) : null}
      </p>

      {/*
        The signature, one line, in the handwritten face.

        Its own field rather than the dedication's last line because it is
        optional and set differently — `SLOT.from` carries the argument. The
        hint is the captain's: a buyer shown "e.g. Grandma, Mum, Dad" knows
        within a second what the line is for, where a bare box labelled "From"
        gets a full name typed into it.
      */}
      {signature && acceptedFrom ? (
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            From <span className="font-normal opacity-60">— optional</span>
          </span>
          <input
            type="text"
            value={order.from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={() => {
              if (acceptedFrom.text !== order.from) setFrom(acceptedFrom.text);
            }}
            data-testid="from"
            aria-describedby="from-count"
            placeholder="e.g. Grandma, Mum, Dad"
            className="mt-1.5 w-full rounded-lg border-2 border-current/20 bg-transparent px-3 py-2 outline-none focus:border-[#B22741]"
          />
          <span id="from-count" role="status" className="mt-1 block text-sm">
            <span data-testid="from-count" className="opacity-70">
              {acceptedFrom.chars} of {signature.maxChars} characters, in {fromFace}
            </span>
            {fromExplanation ? (
              <span data-testid="from-notice" className="ml-3 font-medium text-[#8e1c33]">
                {fromExplanation}
              </span>
            ) : null}
          </span>
        </label>
      ) : null}

      <PhotoField pageIndex={pageIndex} />

      <p className="mt-3 text-[0.78rem] opacity-60">
        {touched || order.dedication.length > 0
          ? "Read it back on the page above before you order. What is on that page is what is printed, and a printed page cannot be changed."
          : "Whatever you write is set on the page above as you type. Read it back there before you order."}
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

/**
 * **The hardcover upgrade, offered exactly once.**
 *
 * After the dedication and before the cart, which is the one thing worth taking
 * from MyStoryTale: a buyer who has just written a message to a child is the
 * buyer most willing to have it bound hard, and asking earlier is asking before
 * they care. `./Preview.tsx` renders this on the spread *after* the one the
 * dedication is on and nowhere else — "exactly once" is a property of where it
 * is mounted, not a flag it checks.
 *
 * **It is an offer, not a mechanic.** Two real prices and the difference
 * between them, stated plainly. There is no struck-out total, no percentage, no
 * countdown and nothing that expires, because `lib/book/editions.ts` has
 * nowhere to put any of those — the register is premium and honest, and the
 * legal reasoning is in `docs/pricing.md`.
 *
 * It renders nothing when there is nothing above what the buyer already has,
 * so a third edition would appear here without this component changing.
 */
export function UpgradeControl() {
  const { order, setEdition } = useBook();
  const current = editionOf(order.editionId);
  const up = upgradeFrom(EDITIONS[0].id);
  if (!up) return null;
  const base = EDITIONS[0];
  const upgraded = current.id === up.id;

  return (
    <Panel title="How should it be bound?" done testId="upgrade-control">
      <p className="mt-1 text-sm opacity-70">
        The same twenty-four pages either way. This is the only thing left to choose.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[base, up].map((edition) => (
          <button
            key={edition.id}
            type="button"
            onClick={() => setEdition(edition.id)}
            aria-pressed={current.id === edition.id}
            data-testid={`edition-${edition.id}`}
            className={`rounded-xl border-2 p-3 text-left transition ${
              current.id === edition.id ? "border-[#B22741]" : "border-current/20"
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{edition.label}</span>
              <span className="tabular-nums">{priceOf(edition.price)}</span>
            </span>
            <span className="mt-1 block text-[0.78rem] opacity-70">{edition.note}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[0.78rem] opacity-60" role="status">
        {upgraded
          ? `Hardcover it is. ${differenceOf(base, up)} more than the softcover.`
          : `The hardcover is ${differenceOf(base, up)} more. It is the one that survives being read every night.`}
      </p>
    </Panel>
  );
}
