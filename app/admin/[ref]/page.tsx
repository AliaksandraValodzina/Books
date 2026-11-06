/**
 * **One order, everything the captain needs to make the book, and the file.**
 *
 * The brief's three asks for this page, in the order they are used: see
 * everything that was chosen, download the print-ready PDF, mark it dispatched
 * with a tracking note. Nothing else — there is no editing, because an order
 * is what the customer approved and the way to change one is to talk to them.
 *
 * **Behind `allowed()` before anything else**, like every other admin entry
 * point, and the file links below are behind it too: `app/api/admin/print/`
 * and `app/api/admin/photo/` each check for themselves rather than trusting
 * that the only links to them are on a protected page. A protected page that
 * links to an unprotected file is the usual way this goes wrong.
 *
 * **The photograph is shown through a route, not a public URL.** It lives
 * under a private prefix in the bucket — `lib/orders/store.ts` § Photographs
 * are private — so the only way to look at it is a signed read on the server,
 * which is what `app/api/admin/photo/[ref]` does.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { pageTitle } from "../../../lib/brand";
import { COOKIE, allowed } from "../../../lib/admin/guard";
import { storeFromEnv } from "../../../lib/orders/store";
import { addressLines, chargedAs, isReference } from "../../../lib/orders/record";
import { editionOf, priceOf } from "../../../lib/book/editions";
import { FIRST_BOOK } from "../../../templates/first-book";
import { lookOf } from "../../../lib/book/derive";
import Gate from "../_Gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Order"),
  robots: { index: false, follow: false },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="py-1.5 pr-4 font-semibold">{label}</dt>
      <dd className="py-1.5 whitespace-pre-wrap">{children}</dd>
    </>
  );
}

export default async function AdminOrder(props: { params: Promise<{ ref: string }> }) {
  const { ref } = await props.params;
  const access = allowed({ env: process.env, cookie: (await cookies()).get(COOKIE)?.value });
  if (!access.ok) return <Gate access={access} next={`/admin/${ref}`} />;

  if (!isReference(ref)) notFound();
  const storeState = storeFromEnv(process.env);
  if (storeState.kind !== "ready") notFound();
  const record = await storeState.store.get(ref);
  if (!record) notFound();

  const edition = editionOf(record.editionId);
  const look = lookOf(FIRST_BOOK, record.fill.lookId);
  const cover = FIRST_BOOK.covers.find((c) => c.id === record.fill.coverId);
  const address = addressLines(record.address);

  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 py-10">
      <p className="text-sm">
        <a className="underline opacity-70" href="/admin">
          ← All orders
        </a>
      </p>

      <h1 className="mt-5 font-mono text-2xl font-semibold">{record.ref}</h1>
      <p className="mt-1 text-sm opacity-70">
        {record.payment === "paid" ? "Paid" : "Not paid"}
        {record.paidAt ? ` on ${record.paidAt.slice(0, 16).replace("T", " ")}` : ""} ·{" "}
        {record.dispatch ? `dispatched ${record.dispatch.at.slice(0, 10)}` : "not dispatched"}
      </p>

      <h2 className="mt-9 text-lg font-semibold">What was chosen</h2>
      <dl className="mt-2 grid grid-cols-[11rem_1fr] border-t border-current/15 text-sm">
        <Row label="Name on the book">{record.fill.name}</Row>
        <Row label="Look">{`${look.label} (${look.id})`}</Row>
        <Row label="Cover">{cover ? `${cover.label} (${cover.id})` : record.fill.coverId}</Row>
        <Row label="Dedication">{record.fill.dedication}</Row>
        <Row label="From">{record.fill.from || "—"}</Row>
        <Row label="Edition">
          {edition.label} — {edition.blueprint}
        </Row>
        <Row label="Photograph">
          {record.fill.photo?.asset ? (
            <a className="underline" href={`/api/admin/photo/${record.ref}`} data-testid="photo-link">
              {record.fill.photo.asset.px[0]} × {record.fill.photo.asset.px[1]}{" "}
              {record.fill.photo.asset.mime}
              {record.fill.photo.crop ? " · cropped by the buyer" : " · uncropped"}
            </a>
          ) : (
            "none"
          )}
        </Row>
      </dl>

      <h2 className="mt-9 text-lg font-semibold">The money</h2>
      <dl className="mt-2 grid grid-cols-[11rem_1fr] border-t border-current/15 text-sm">
        <Row label="Listed price">{priceOf(record.asked)}</Row>
        <Row label="Actually charged">{chargedAs(record.charged) ?? "nothing yet"}</Row>
        <Row label="Stripe session">{record.sessionId ?? "—"}</Row>
        <Row label="Stripe payment">{record.paymentIntentId ?? "—"}</Row>
        <Row label="Email">
          {record.email ?? "—"}
          {record.email ? (record.emailed ? " · confirmation sent" : " · CONFIRMATION NOT SENT") : ""}
        </Row>
      </dl>

      <h2 className="mt-9 text-lg font-semibold">Where it goes</h2>
      <p className="mt-2 text-sm whitespace-pre-wrap" data-testid="address">
        {address.length ? address.join("\n") : "Stripe has not sent an address for this order yet."}
      </p>

      <h2 className="mt-9 text-lg font-semibold">The print file</h2>
      <p className="mt-2 text-sm opacity-75">
        The whole book as one PDF at {FIRST_BOOK.page.print.pixels.width} ×{" "}
        {FIRST_BOOK.page.print.pixels.height} a page, rendered from this order — about half a
        minute. It is the same renderer that drew the preview the buyer approved, and it can be
        made again from this record at any time.
      </p>
      <p className="mt-3">
        <a
          className="inline-block rounded-lg bg-[#2b1d14] px-5 py-3 font-semibold text-[#efe9df]"
          href={`/api/admin/print/${record.ref}`}
          data-testid="print-link"
        >
          Download the print-ready PDF
        </a>
      </p>

      <h2 className="mt-9 text-lg font-semibold">Dispatch</h2>
      {record.payment === "paid" ? (
        <form method="post" action="/api/admin/dispatch" className="mt-2">
          <input type="hidden" name="ref" value={record.ref} />
          <label className="block text-sm font-medium" htmlFor="tracking">
            Tracking number or note
          </label>
          <input
            id="tracking"
            name="tracking"
            defaultValue={record.dispatch?.tracking ?? ""}
            data-testid="tracking"
            className="mt-1 w-full rounded-lg border-2 border-current/20 bg-transparent px-3 py-2"
          />
          <button
            type="submit"
            data-testid="dispatch"
            className="mt-3 rounded-xl border-2 border-current/25 px-5 py-3 font-semibold"
          >
            {record.dispatch ? "Update the dispatch note" : "Mark dispatched"}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-sm opacity-75">
          Not paid for, so it cannot be dispatched. Nothing to post.
        </p>
      )}
    </main>
  );
}
