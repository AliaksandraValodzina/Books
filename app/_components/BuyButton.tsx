"use client";

/**
 * The order button, and the price that does not exist yet.
 *
 * It sits at the bottom of the page, after the facts and the delivery window,
 * and it knows the state of the editor at the top because both read the one
 * draft out of `DraftProvider`.
 *
 * **It says what is missing instead of failing.** A disabled button with no
 * explanation is the commonest way a checkout loses a sale that was already
 * made: the customer presses it, nothing happens, and they leave believing the
 * site is broken. So when the page is not finished, the button names the thing
 * that is not done.
 *
 * It is a real form `POST` rather than a link. `/api/checkout` is where the
 * environment is read, and a `GET` that changed state — or that a browser
 * prefetched — would be the wrong shape for the step that eventually takes
 * money.
 *
 * **The accent is here because this is the desirable thing.** `#B22741` is the
 * lipstick kiss out of `templates/my-forever.ts`, and §8(d) of
 * `data/bk-landing-design-research/report.md` found that the only red on the
 * old page was four `TO CONFIRM` badges and a dashed warning box — the one
 * place it should have meant "press this" was disabled on first paint. The
 * badges are ochre now and this button is the red.
 */

import { useDraft } from "./DraftProvider";
import { PLACEHOLDER, REASSURANCE, WHAT_YOU_GET } from "../../lib/product";
import type { PhotoSlotLayer, TextSlotLayer } from "../../lib/template/types";

/**
 * The price slot.
 *
 * §9's layout puts the price above the CTA in the display face and again
 * *inside* the button, which is Ugmonk's pattern and a good one. Neither can
 * happen yet, and the sketch's `From £—` is not the fallback: a currency
 * symbol is as much somebody else's decision as the number beside it, and
 * `lib/product.ts` exists to make writing one impossible. So the slot is built
 * and shows the admission.
 *
 * When the captain supplies a number, `Price` in `lib/product.ts` flips to the
 * `confirmed: true` arm and `fact.value` renders here — both the arm and the
 * value, never one without the other.
 */
function Price() {
  const price = WHAT_YOU_GET.find((f) => f.label === "Price");
  if (price?.confirmed) {
    return (
      <p className="flex items-baseline gap-2">
        <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          From
        </span>
        <span className="font-display text-[1.625rem] leading-none text-accent-ink">
          {price.value}
        </span>
      </p>
    );
  }
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          From
        </span>
        <span aria-hidden="true" className="font-display text-[1.625rem] leading-none text-ink-soft">
          —
        </span>
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-caution">
          {PLACEHOLDER}
        </span>
      </p>
      <p className="mt-2 text-[0.9375rem] text-ink-soft">
        Nobody has set a price yet, so this page states none. You can finish your page and take the
        print file away regardless.
      </p>
    </div>
  );
}

export default function BuyButton() {
  const { template, draft, ready } = useDraft();

  const missing: string[] = [];
  for (const layer of template.layers) {
    if (layer.kind === "photoSlot" && !draft.photos[(layer as PhotoSlotLayer).slot]?.asset) {
      missing.push(`a photo for “${(layer as PhotoSlotLayer).prompt ?? layer.id}”`);
    }
    if (layer.kind === "textSlot" && !(draft.texts[(layer as TextSlotLayer).slot] ?? "").length) {
      missing.push("a word");
    }
  }

  return (
    <div>
      <Price />

      <form method="post" action="/api/checkout" className="mt-6">
        <button
          type="submit"
          disabled={!ready}
          data-testid="buy"
          // 56px and a 10px radius, per §9's CTA row. Disabled is a flat wash
          // of ink rather than a greyed-out accent: a dimmed red still reads as
          // the button, and a customer presses it and concludes the site is
          // broken.
          className="flex h-14 w-full items-center justify-center rounded-[10px] bg-accent text-[1.0625rem] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink-soft"
        >
          {ready ? "Order this page" : "Finish your page first"}
        </button>

        <p className="mt-3 text-center text-[0.9375rem] text-ink-soft" role="status">
          {ready
            ? "Payments are not switched on yet — the next screen says so plainly, and nothing is charged."
            : `Still needed: ${[...new Set(missing)].join(", ")}.`}
        </p>
      </form>

      {/*
        The three doubts, answered where the thumb is. Each line restates a
        promise a test already enforces — see `REASSURANCE` in
        `lib/product.ts`, which carries the provenance of all three.
      */}
      {/*
        One per line on a phone, one line with separators from `sm` up.

        The three do not fit across 390px, and wrapping a separated row strands
        the dot at the start of the second line, which reads as a bullet nobody
        meant. Stacking them is also simply easier to take in at the moment the
        thumb is over the button, which is the only moment this strip is for.
      */}
      <ul className="mt-5 flex flex-col items-center gap-y-1.5 text-[0.8125rem] text-ink-soft sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3">
        {REASSURANCE.map((line, i) => (
          <li key={line} className="flex items-center gap-3">
            {i > 0 ? (
              <span aria-hidden="true" className="hidden text-rule sm:inline">
                ·
              </span>
            ) : null}
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
