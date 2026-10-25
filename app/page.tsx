/**
 * **The selling page, which is the editor.**
 *
 * The order of what follows is the argument, not a layout preference. For a
 * gift like this the buyer's real question is not "is this nice" — it is *"will
 * mine look as good as yours?"*. Every example uses beautiful couples and
 * beautiful photographs, and the customer has blurry phone pictures and doubts.
 * You answer that by letting them put **their own two photographs into the
 * hearts before paying anything**, so:
 *
 * 1. **The object**, small and honest — see the note on `ObjectBand` for what
 *    this is a picture *of*, which is a real weakness and is flagged rather
 *    than papered over.
 * 2. **One line** saying who it is for.
 * 3. **The editor**, which is the hero and is above the fold on a phone.
 * 4. **What you get**, plainly, with everything nobody has a number for marked
 *    as such instead of guessed.
 * 5. **When it arrives** — the one a gift stands or falls on, and a clearly
 *    marked placeholder because the real window is not known here.
 * 6. **The order button.**
 *
 * The static sections stay **server components**: `DraftProvider` is a client
 * component wrapping server-rendered children, so the facts and the guarantees
 * cost no JavaScript while the button at the bottom still knows whether the
 * editor at the top is finished.
 *
 * **It draws nothing itself.** The page the customer edits comes from
 * `renderPageSvg` — the same call the print path makes.
 */

import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import {
  DELIVERY,
  GUARANTEES,
  PLACEHOLDER,
  WHAT_YOU_GET,
  WHO_IT_IS_FOR,
  type Fact,
} from "../lib/product";
import DraftProvider from "./_components/DraftProvider";
import Editor from "./_components/Editor";
import BuyButton from "./_components/BuyButton";

export const dynamic = "force-dynamic";

const template = MY_FOREVER;

/**
 * **1. The object.**
 *
 * This is a *render*, not a photograph of a printed book, because there is no
 * photograph of a printed book in this repository — nothing has been printed
 * yet. That is a real weakness and the caption says so rather than letting a
 * flat picture imply an object: a render does not feel like a thing you can
 * hold, and "here is the page" sells worse than a photograph of it in
 * somebody's hands. **The captain needs to take that photograph.** When there
 * is one it replaces this and the caption goes.
 *
 * It is the finished example — the fixture fill — deliberately kept small and
 * beside the line of copy. Showing "ours" next to the editor's "yours" is the
 * selling mechanism; showing it large would push the editor below the fold,
 * which costs more than the picture gains.
 */
function ObjectBand({ guides }: { guides: boolean }) {
  const svg = renderPageSvg(template, FIXTURE_FILL, { href: assetUrl, guides });
  return (
    <div className="flex items-center gap-4">
      <div
        className="w-[7.5rem] shrink-0 overflow-hidden rounded-lg shadow-xl shadow-black/25 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{template.name}</h1>
        <p className="mt-1 text-sm opacity-75">{WHO_IT_IS_FOR}</p>
        <p className="mt-1.5 text-[0.7rem] opacity-50">
          A render of the page, not a photograph of the printed book — nothing has been printed
          yet.
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ guides?: string }>;
}) {
  // The one screen affordance the print path does not have. `renderPrintSvg`
  // takes no such argument, so a trim mark cannot reach a printed book — see
  // the note on `RenderOptions.guides`.
  const guides = (await searchParams).guides === "1";

  return (
    <main className="mx-auto w-full max-w-[42rem] px-4 py-6 sm:px-6 sm:py-10">
      <ObjectBand guides={guides} />

      <DraftProvider template={template}>
        <section className="mt-6" aria-label="Make your page">
          <Editor guides={guides} />
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold">What you get</h2>
          <dl className="mt-3">
            {WHAT_YOU_GET.map((fact) => (
              <FactRow key={fact.label} fact={fact} />
            ))}
          </dl>
          <ul className="mt-4 space-y-1.5 text-sm opacity-80">
            {GUARANTEES.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.72rem] opacity-55">
            The marked rows are the ones nobody here has a number for. Writing a plausible price
            and tidying it later would be a made-up commercial claim on a public page, and a
            customer cannot tell a guess from a quote.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{DELIVERY.label}</h2>
          <div className="mt-3 rounded-xl border-2 border-dashed border-[#B22741]/40 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#8e1c33]">
              {PLACEHOLDER}
            </p>
            <p className="mt-2 text-sm opacity-80">
              {DELIVERY.confirmed ? DELIVERY.value : DELIVERY.needs}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <BuyButton />
        </section>
      </DraftProvider>

      <footer className="mt-14 border-t border-current/10 pt-5 text-xs opacity-55">
        <p>
          {template.name} — {template.id} @ {template.rev}. The page above and the print file are
          one renderer reading one description; see <code>docs/template-format.md</code> and{" "}
          <code>docs/print.md</code>.
        </p>
        <p className="mt-2">
          <a className="underline" href={guides ? "/" : "/?guides=1"}>
            {guides ? "Hide the trim and safe guides" : "Show the trim and safe guides"}
          </a>{" "}
          — a screen affordance only. The print path does not offer the option, so a trim mark
          cannot reach a printed book.
        </p>
      </footer>
    </main>
  );
}
