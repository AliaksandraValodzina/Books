/**
 * **The door, drawn.**
 *
 * One shared secret, typed into one field. It is not an account system and the
 * copy does not pretend it is — there is no "sign in", no email and no "forgot
 * your password", because there is no account to have forgotten the password
 * of. `lib/admin/guard.ts` carries the reasoning and the limits.
 *
 * With `ADMIN_SECRET` unset there is **no field at all**: nothing could be
 * typed that would work, so offering a box would be an invitation to guess at
 * a lock with no key. It says what is missing to whoever is deploying it
 * instead.
 */

import { REFUSAL, type Access } from "../../lib/admin/guard";

export default function Gate({ access, next }: { access: Extract<Access, { ok: false }>; next?: string }) {
  return (
    <main className="mx-auto w-full max-w-[28rem] px-5 py-16">
      <h1 className="text-2xl font-semibold">{access.reason === "denied" ? "The owner's page" : "Not set up"}</h1>
      <p className="mt-3 text-sm opacity-80">{REFUSAL[access.reason]}</p>

      {access.reason === "denied" ? (
        <form method="post" action="/api/admin/session" className="mt-6">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <label className="block text-sm font-medium" htmlFor="secret">
            Owner secret
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            autoComplete="off"
            data-testid="gate-secret"
            className="mt-1 w-full rounded-lg border-2 border-current/20 bg-transparent px-3 py-2"
          />
          <button
            type="submit"
            data-testid="gate-submit"
            className="mt-3 w-full rounded-xl bg-[#2b1d14] px-5 py-3 font-semibold text-[#efe9df]"
          >
            Open
          </button>
        </form>
      ) : null}

      <p className="mt-10 border-t border-current/10 pt-5 text-xs opacity-55">
        Nothing behind this page is reachable without the secret — not the list, not an order, not
        a print file. See <code>lib/admin/guard.ts</code>.
      </p>
    </main>
  );
}
