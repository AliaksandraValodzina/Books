"use client";

/**
 * The sticky order bar, on phones only.
 *
 * §9 of `data/bk-landing-design-research/report.md` takes it from Artifact
 * Uprising's `au-05`, and the reason it is worth having is that the page is
 * long on a phone: by the time somebody has read the specification, the thing
 * they came to do is two screens behind them.
 *
 * **It is not a second buy button.** It is an anchor to the real one. Two
 * submit buttons posting the same form is two places for the checkout to
 * change, and `data-testid="buy"` would stop identifying one element — which
 * is what `test/funnel.test.tsx` uses to prove the editor comes before the
 * price.
 *
 * **It appears only when it is not in the way.** A bar pinned to the bottom of
 * a phone from first paint eats 60-odd pixels of the editor, and the editor is
 * the hero — §9 is explicit that the object band already spends about 300px of
 * scroll and that the budget is gone. So it shows only while all three of the
 * editor, the order section and the footer are off-screen, which is exactly the
 * stretch where a customer is reading the specification with no way back.
 *
 * It renders nothing at all when hidden rather than fading out. A `fixed`
 * element at `opacity: 0` still takes keyboard focus, so a tab from the
 * specification would land on an invisible button.
 */

import { useEffect, useState } from "react";

export default function StickyOrderBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const watched = ["editor", "order", "page-footer"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    // Server-rendered as nothing and left that way if the browser cannot
    // observe: a bar that appears and never hides is worse than no bar.
    if (watched.length === 0 || typeof IntersectionObserver !== "function") return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setShow(visible.size === 0);
      },
      { threshold: 0 },
    );
    for (const el of watched) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface/95 backdrop-blur sm:hidden">
      <div
        className="mx-auto max-w-[42rem] px-4 py-3"
        // The home-button strip on a modern phone sits under the bar, so the
        // tap target needs to end above it.
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <a
          href="#order"
          className="flex h-12 w-full items-center justify-center rounded-[10px] bg-accent text-[1rem] font-semibold text-white"
        >
          Order this page
        </a>
      </div>
    </div>
  );
}
