/**
 * **The captain's list: every order, newest first.**
 *
 * The smallest page on the list and the one without which nothing ships —
 * there is no other way to find out that somebody has bought a book. Six
 * columns, which is what the brief asks for and is also exactly what is needed
 * to decide what to do next: reference, name, edition, price, paid, date.
 *
 * **It is behind `allowed()` before it is anything else.** Behind this page is
 * every customer's address and every customer's photograph of their own child,
 * and `lib/admin/guard.ts` § fails closed is the property that matters: with
 * no `ADMIN_SECRET` set, nobody gets in at all. `test/admin-guard.test.ts`
 * reads every file under `app/admin/` and `app/api/admin/` and fails if one of
 * them does not call the guard, so the page added next year is protected by
 * the test rather than by somebody remembering.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { pageTitle } from "../../lib/brand";
import { COOKIE, allowed } from "../../lib/admin/guard";
import { storeFromEnv, summaries } from "../../lib/orders/store";
import { chargedAs } from "../../lib/orders/record";
import { editionOf, priceOf } from "../../lib/book/editions";
import Gate from "./_Gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Orders"),
  robots: { index: false, follow: false },
};

/** The most this page asks the store for. A shop this size will not reach it. */
const LIMIT = 200;

export default async function Admin() {
  const access = allowed({ env: process.env, cookie: (await cookies()).get(COOKIE)?.value });
  if (!access.ok) return <Gate access={access} next="/admin" />;

  const storeState = storeFromEnv(process.env);
  if (storeState.kind !== "ready") {
    return (
      <main className="mx-auto w-full max-w-[40rem] px-5 py-14">
        <h1 className="text-2xl font-semibold">No order store</h1>
        <p className="mt-3 opacity-85">
          There is nowhere for orders to be kept, so there are none to show and the checkout is
          refusing. Set these in the hosting environment:
        </p>
        <ul className="mt-3 list-disc pl-5 text-sm">
          {storeState.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const rows = await summaries(storeState.store, LIMIT);

  return (
    <main className="mx-auto w-full max-w-[58rem] px-5 py-10">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm opacity-65">
        {rows.length} {rows.length === 1 ? "order" : "orders"}, newest first, from{" "}
        <code>{storeState.store.describe}</code>.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 opacity-75" data-testid="no-orders">
          Nothing yet. An order appears here the moment one is started, and is marked paid only
          when Stripe&rsquo;s webhook confirms the payment.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-testid="orders">
            <thead>
              <tr className="border-b border-current/20 text-left">
                <th className="py-2 pr-4 font-semibold">Reference</th>
                <th className="py-2 pr-4 font-semibold">Name on the book</th>
                <th className="py-2 pr-4 font-semibold">Edition</th>
                <th className="py-2 pr-4 font-semibold">Price</th>
                <th className="py-2 pr-4 font-semibold">Paid</th>
                <th className="py-2 pr-4 font-semibold">Ordered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ref} className="border-b border-current/10" data-testid={`order-${row.ref}`}>
                  <td className="py-2 pr-4 font-mono">
                    <a className="underline" href={`/admin/${row.ref}`}>
                      {row.ref}
                    </a>
                  </td>
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">{editionOf(row.editionId).label}</td>
                  <td className="py-2 pr-4 tabular-nums">{chargedAs(row.charged) ?? priceOf(row.asked)}</td>
                  <td className="py-2 pr-4">
                    {row.payment === "paid" ? (row.dispatched ? "paid, dispatched" : "paid") : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
