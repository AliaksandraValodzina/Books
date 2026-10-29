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
 * 1. **The object** — the finished example, and now the largest thing on the
 *    page rather than a 120px thumbnail. See `ObjectBand` for what this is a
 *    picture *of*, which is still a real weakness and is captioned rather than
 *    papered over.
 * 2. **One line** saying who it is for.
 * 3. **The editor**, which is the hero and is one thumb-scroll away.
 * 4. **What you get**, plainly, with everything nobody has a number for marked
 *    as such instead of guessed.
 * 5. **When it arrives** — the one a gift stands or falls on, and a clearly
 *    marked placeholder because the real window is not known here.
 * 6. **The order button.**
 *
 * **The dressing is `data/bk-landing-design-research/report.md` §9**, which
 * measured eight sites at phone width and named the palette, the type pairing
 * and these proportions. The funnel it describes is the funnel that was already
 * here; what it changed is the register. Three of its findings are worth
 * knowing before editing anything below:
 *
 * - The finished object must be the biggest thing on screen (§8b). It was the
 *   smallest.
 * - The accent red must only ever mark something **desirable** (§8d). It used
 *   to appear five times as a warning and once, disabled, on the buy button, so
 *   the only red a customer saw on load was five alarm marks.
 * - The ground must not be the same cream as the artwork (§8e), or the object
 *   has no frame and bleeds into the chrome.
 *
 * The static sections stay **server components**: `DraftProvider` is a client
 * component wrapping server-rendered children, so the facts and the guarantees
 * cost no JavaScript while the button at the bottom still knows whether the
 * editor at the top is finished.
 *
 * **It draws nothing itself.** The page the customer edits comes from
 * `renderPageSvg` — the same call the print path makes. Every shadow, rotation
 * and frame below is CSS *around* that string: put any of it inside the
 * renderer and the committed 3150px print file ships with a drop shadow, which
 * is what `test/one-renderer.test.ts` exists to catch.
 */

import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import {
  DELIVERY,
  GUARANTEES,
  PLACEHOLDER,
  UNCONFIRMED,
  WHAT_YOU_GET,
  WHO_IT_IS_FOR,
  type Fact,
} from "../lib/product";
import DraftProvider from "./_components/DraftProvider";
import Editor from "./_components/Editor";
import BuyButton from "./_components/BuyButton";
import StickyOrderBar from "./_components/StickyOrderBar";

export const dynamic = "force-dynamic";

const template = MY_FOREVER;

/**
 * The section label. 12px, 600, `+0.12em`, uppercase, soft ink — §9's eyebrow
 * row, with the accent as a short rule beside it.
 *
 * The text is given in sentence case and uppercased **by CSS**, deliberately:
 * `test/funnel.test.tsx` looks for the literal string "What you get" and
 * `DELIVERY.label` in the markup to prove the page's order, and a heading
 * shouted in the HTML would also be shouted by a screen reader.
 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="h-px w-5 shrink-0 bg-accent-ink" />
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {children}
      </h2>
    </div>
  );
}

/**
 * The title, with its last word in italic.
 *
 * Studio Gwyn and Papier both carry the emotion of a headline on one or two
 * italic words rather than on a colour, and §9 asks for the same trick here.
 *
 * **Changed from the report**: its sketch splits mid-word — `My For*ever*` —
 * which is a lovely thing to do to the word "Forever" and nonsense for any
 * other template's name. The last word is the same effect and survives a second
 * template, which is the rule `lib/template/types.ts` sets for everything else
 * on this page.
 */
function DisplayName({ name }: { name: string }) {
  const cut = name.lastIndexOf(" ");
  if (cut < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, cut + 1)}
      <em>{name.slice(cut + 1)}</em>
    </>
  );
}

/**
 * **1. The object.**
 *
 * This is a *render*, not a photograph of a printed book, because there is no
 * photograph of a printed book in this repository — nothing has been printed
 * yet. Every good page in the study leads with a photograph and §10 is blunt
 * that no amount of typography closes that gap.
 *
 * What it does instead is §10's first option, the only one that costs nothing
 * and claims nothing: **give the render a surface.** The card sits at ~86vw on
 * the page ground with a soft warm shadow and a degree and a half of rotation,
 * as if it were lying on a table. That is a picture of a card, which is what it
 * is. The composite — warping the render onto a photographed open book — is
 * §10's option 3 and is *not* done here, because it is the one that would read
 * as a photograph of a product that does not exist.
 *
 * The caption moved. It used to sit under the title at `0.7rem` and
 * `opacity-50`, the faintest text in the hero, where it read as an apology
 * attached to the product's name; it now sits under the picture, where it reads
 * as a note about the picture. The sentence is unchanged and
 * `test/funnel.test.tsx` requires it to be here and to come before the editor.
 *
 * **The captain has to take the real photograph.** §10's recommendation is a
 * real test print of this exact file, on a table, in afternoon light — honest,
 * warm, and an afternoon's work. When it exists it replaces this and the
 * caption goes with it.
 */
function ObjectBand({ guides }: { guides: boolean }) {
  const svg = renderPageSvg(template, FIXTURE_FILL, { href: assetUrl, guides });
  return (
    <section aria-label="The finished page">
      <div className="flex justify-center px-2 pt-2">
        <div
          className="w-[86vw] max-w-[26rem] rotate-[-1.5deg] overflow-hidden rounded-[0.35rem] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          style={{
            // Warm rather than black, and offset downward: a black shadow under
            // a cream card reads as grey dirt, and this has to look like
            // daylight falling past an object onto a table.
            boxShadow:
              "0 1.5rem 2.5rem -0.75rem rgba(43, 29, 20, 0.28), 0 0.15rem 0.4rem rgba(43, 29, 20, 0.14)",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <p className="mx-auto mt-5 max-w-[22rem] text-center text-[0.8125rem] leading-snug text-ink-soft">
        A render of the page, not a photograph of the printed book — nothing has been printed yet.
      </p>

      <h1 className="mt-7 font-display text-[2.125rem] font-normal leading-[1.05] tracking-[-0.02em]">
        <DisplayName name={template.name} />
      </h1>
      <p className="mt-3 text-[1.0625rem] leading-[1.5] text-ink-soft">{WHO_IT_IS_FOR}</p>
    </section>
  );
}

/**
 * A fact, or the admission that there is not one yet.
 *
 * The Social Print Studio shape from §9: a tracked-caps label, the value beside
 * it, a hairline between rows, no boxes. An unconfirmed `Fact` has no `value`
 * field to render — the type has no room for one — so this cannot accidentally
 * print a plausible number. See `lib/product.ts`.
 *
 * **The marker is ochre, not red.** It used to be crimson on crimson, which
 * made the accent mean "something is wrong here" on a page where it has to mean
 * "this is the desirable thing" (§8d). The admission is just as present at
 * 11px in `--caution`; it is simply no longer the loudest thing in the
 * section. The sentence saying what each one needs is in the accordion below
 * the table, where there is room for it.
 */
function FactRow({ fact }: { fact: Fact }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-3 last:border-b-0">
      <dt className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {fact.label}
      </dt>
      {fact.confirmed ? (
        <dd className="text-right">{fact.value}</dd>
      ) : (
        <dd className="text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-caution">
          {PLACEHOLDER}
        </dd>
      )}
    </div>
  );
}

/** A disclosure. See the `details` rules in `globals.css` for why the marker is CSS. */
function Accordion({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-rule py-3">
      <summary className="text-[0.9375rem] font-medium">{summary}</summary>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-[1.55] text-ink-soft">{children}</div>
    </details>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ guides?: string; type?: string }>;
}) {
  const params = await searchParams;
  // The one screen affordance the print path does not have. `renderPrintSvg`
  // takes no such argument, so a trim mark cannot reach a printed book — see
  // the note on `RenderOptions.guides`.
  const guides = params.guides === "1";

  // §12(a) is a decision only the captain can make and it is a picture
  // question, so both pictures exist. `?type=serif` sets the display face to
  // Instrument Serif instead of Fraunces; the footer links both ways. The
  // `data-display` attribute is read by one block in `globals.css`.
  const serif = params.type === "serif";
  const display = serif ? "instrument-serif" : "fraunces";
  const here = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { guides: guides ? "1" : undefined, type: serif ? "serif" : undefined, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div data-display={display}>
      <main className="mx-auto w-full max-w-[42rem] px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Keepnook</p>

        <div className="mt-6">
          <ObjectBand guides={guides} />
        </div>

        <DraftProvider template={template}>
          {/*
            The editor. §9 keeps it exactly where it was in the funnel and only
            dresses it: the object band above costs roughly 300px of scroll,
            which is affordable precisely because the hero is now worth looking
            at. It would not be affordable if the hero had both stayed a
            thumbnail and grown.
          */}
          <section id="editor" className="mt-12 scroll-mt-4" aria-label="Make your page">
            <Eyebrow>Make yours</Eyebrow>
            <div className="mt-5">
              <Editor guides={guides} />
            </div>
          </section>

          {/*
            The one alternating band on the page. It is what makes the
            specification read as a different kind of information from the
            editor above it, which is the Social Print Studio structure §4 of
            the report calls the most copyable thing in the study.
          */}
          <section className="mt-16 -mx-4 bg-band px-4 py-9 sm:-mx-6 sm:px-6">
            <Eyebrow>What you get</Eyebrow>

            <dl className="mt-5">
              {WHAT_YOU_GET.map((fact) => (
                <FactRow key={fact.label} fact={fact} />
              ))}
            </dl>

            <div className="mt-6">
              <Accordion summary="Why some of these are not settled yet">
                <p>
                  The marked rows are the ones nobody here has a number for. Writing a plausible
                  price and tidying it later would be a made-up commercial claim on a public page,
                  and a customer cannot tell a guess from a quote.
                </p>
                <dl className="space-y-3">
                  {WHAT_YOU_GET.filter((f) => !f.confirmed).map((fact) => (
                    <div key={fact.label}>
                      <dt className="font-medium text-ink">{fact.label}</dt>
                      <dd>{fact.confirmed ? null : fact.needs}</dd>
                    </div>
                  ))}
                </dl>
              </Accordion>

              <Accordion summary="How your photographs are handled">
                <ul className="space-y-2">
                  {GUARANTEES.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent-ink">
                        ·
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Accordion>
            </div>
          </section>

          {/*
            When it arrives. One line, and the explanation in the accordion
            under it — not a dashed red box, which was the second place the
            accent used to shout a warning.
          */}
          <section className="mt-14">
            <Eyebrow>{DELIVERY.label}</Eyebrow>
            <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-caution">
              {PLACEHOLDER}
            </p>
            <p className="mt-2 text-ink-soft">
              Nobody has verified a window yet, so this page states none.
            </p>
            <div className="mt-4">
              <Accordion summary="What the window depends on">
                <p>{DELIVERY.confirmed ? DELIVERY.value : DELIVERY.needs}</p>
              </Accordion>
            </div>
          </section>

          <section id="order" className="mt-14 scroll-mt-6">
            <BuyButton />
          </section>
        </DraftProvider>

        <footer
          id="page-footer"
          className="mt-16 border-t border-rule pt-6 text-[0.8125rem] leading-relaxed text-ink-soft"
        >
          <p>
            {template.name} — {template.id} @ {template.rev}. The page above and the print file are
            one renderer reading one description; see <code>docs/template-format.md</code> and{" "}
            <code>docs/print.md</code>.
          </p>
          <p className="mt-3">
            <a className="underline decoration-rule underline-offset-2" href={here({ guides: guides ? undefined : "1" })}>
              {guides ? "Hide the trim and safe guides" : "Show the trim and safe guides"}
            </a>{" "}
            — a screen affordance only. The print path does not offer the option, so a trim mark
            cannot reach a printed book.
          </p>
          {/*
            §12(a), rendered rather than described. Both faces are on the real
            page over the real artwork, which is the only way this question gets
            answered. Delete this paragraph and the Instrument Serif
            `@font-face` rules once the captain has chosen.
          */}
          <p className="mt-3">
            <a
              className="underline decoration-rule underline-offset-2"
              href={here({ type: serif ? undefined : "serif" })}
            >
              {serif ? "Set the titles in Fraunces" : "Set the titles in Instrument Serif"}
            </a>{" "}
            — the two display faces this page could use, and the one thing on it nobody has decided.
            Titles are currently {serif ? "Instrument Serif" : "Fraunces"}; the body is Instrument
            Sans either way.
          </p>
        </footer>
      </main>

      <StickyOrderBar />

      {/*
        A statement about this page that only a render can check, kept honest by
        a test rather than by a comment: `test/funnel.test.tsx` asserts there are
        exactly two `<svg>` elements here — the object and the editor's own page
        — so no decorative icon can quietly become a third, and the count stays
        a proof that both of the real ones drew something.
      */}
    </div>
  );
}
