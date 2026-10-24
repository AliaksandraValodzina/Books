/**
 * The page on screen.
 *
 * **It draws nothing itself.** It asks `renderPageSvg` for the same string the
 * print path asks for, and puts it in the document. The only difference is the
 * `href` function: here a URL the browser can fetch, there a `data:` URI the
 * rasteriser can read. Everything about what the page *looks like* is decided
 * one call down, which is what "one renderer" has to mean if it is to mean
 * anything.
 *
 * There is no editor here, and there is not meant to be — it is the next task.
 * What is on screen is the fixture in `fixtures/order.ts`, which is the same
 * document an editor will eventually write.
 */

import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPageSvg } from "../lib/render/svg";
import { assetUrl } from "../lib/assets/resolve";
import { blockingProblems, validateFill, validateTemplate } from "../lib/template/validate";
import { safeBox, trimBox } from "../lib/template/defaults";

export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-black/10 py-1.5 text-sm">
      <dt className="opacity-60">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ guides?: string }>;
}) {
  const guides = (await searchParams).guides === "1";
  const t = MY_FOREVER;
  const svg = renderPageSvg(t, FIXTURE_FILL, { href: assetUrl, guides });

  const problems = [
    ...validateTemplate(t),
    ...blockingProblems(validateFill(t, FIXTURE_FILL)),
  ];
  const dpi = (t.print.pixels.width / t.canvas.width) * 72;
  const trim = trimBox(t.canvas);
  const safe = safeBox(t.canvas);
  const inches = (pt: number) => `${(pt / 72).toFixed(3)}″`;

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <div
          className="w-full overflow-hidden rounded-xl shadow-2xl shadow-black/30 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-3 text-sm opacity-60">
          {t.name} — rendered from <code>templates/my-forever.ts</code> and{" "}
          <code>fixtures/order.ts</code> by <code>lib/render/svg.ts</code>.
        </p>
      </section>

      <aside className="text-sm">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="mt-2 opacity-70">
          The page you are looking at and the file that goes to Printify are the same
          renderer reading the same description. This one is scaled to your screen; that one
          is scaled to {t.print.pixels.width} pixels.
        </p>

        <dl className="mt-6">
          <Fact label="Template" value={`${t.id} @ ${t.rev}`} />
          <Fact label="Artboard" value={`${inches(t.canvas.width)} × ${inches(t.canvas.height)}`} />
          <Fact label="Print file" value={`${t.print.pixels.width} × ${t.print.pixels.height} px`} />
          <Fact label="Resolution" value={`${Math.round(dpi)} DPI (derived)`} />
          <Fact label="Colour" value="sRGB, stamped into the PNG" />
          <Fact label="Bleed" value={`${inches(t.canvas.bleed)} (assumed — see docs/print.md)`} />
          <Fact label="Trim" value={`${inches(trim.width)} square`} />
          <Fact label="Safe area" value={`${inches(safe.width)} square`} />
          <Fact label="Layers" value={`${t.layers.length}`} />
          <Fact
            label="Problems"
            value={problems.length === 0 ? "none" : problems.map((p) => p.code).join(", ")}
          />
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          <a
            className="rounded-lg bg-[#2b1d14] px-4 py-2.5 text-center font-medium text-[#efe9df] hover:opacity-90"
            href="/api/print"
          >
            Download the print file
          </a>
          <a
            className="rounded-lg border border-current/20 px-4 py-2.5 text-center hover:opacity-70"
            href={guides ? "/" : "/?guides=1"}
          >
            {guides ? "Hide trim and safe guides" : "Show trim and safe guides"}
          </a>
        </div>

        <p className="mt-4 text-xs opacity-50">
          The guides are a screen affordance only. <code>renderPrintSvg</code> does not offer
          the option, so a trim mark cannot reach a printed book.
        </p>
      </aside>
    </main>
  );
}
