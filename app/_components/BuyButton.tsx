"use client";

/**
 * The order button.
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
 */

import { useDraft } from "./DraftProvider";
import type { PhotoSlotLayer, TextSlotLayer } from "../../lib/template/types";

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
    <form method="post" action="/api/checkout">
      <button
        type="submit"
        disabled={!ready}
        data-testid="buy"
        className="w-full rounded-xl bg-[#B22741] px-5 py-4 text-lg font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:bg-[#2b1d14]/25 disabled:text-[#2b1d14]/70 disabled:shadow-none"
      >
        {ready ? "Order this page" : "Finish your page first"}
      </button>

      <p className="mt-2 text-center text-sm opacity-70" role="status">
        {ready
          ? "Payments are not switched on yet — the next screen says so plainly, and nothing is charged."
          : `Still needed: ${[...new Set(missing)].join(", ")}.`}
      </p>
    </form>
  );
}
