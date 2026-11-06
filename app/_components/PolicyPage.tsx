/**
 * **One renderer for all four policies**, because a policy is data.
 *
 * `lib/policy/pages.ts` holds the words and derives every fact in them from
 * the code that acts on it — the dispatch window from the email, the countries
 * from the list the Checkout Session is created with, the prices from
 * `EDITIONS`. This draws them. Four hand-written pages would be four places
 * for a price to go stale.
 *
 * It is plain on purpose: the shop's visual design is being settled separately
 * and a later task restyles the whole site together, so this matches what is
 * already here and invents nothing.
 */

import type { Policy } from "../../lib/policy/pages";
import SiteFooter from "./SiteFooter";

export default function PolicyPage({ policy }: { policy: Policy }) {
  return (
    <main className="mx-auto w-full max-w-[42rem] px-5 py-12">
      <p className="text-sm">
        <a className="underline opacity-70" href="/">
          ← Back to the shop
        </a>
      </p>

      <h1 className="mt-6 text-3xl font-semibold">{policy.title}</h1>
      <p className="mt-2 opacity-80">{policy.lede}</p>

      {policy.sections.map((section) => (
        <section key={section.heading} className="mt-9">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className="mt-2.5 opacity-85">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <SiteFooter />
    </main>
  );
}
