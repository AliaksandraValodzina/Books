/**
 * **Stripe's API takes form-encoded nested parameters, so this encodes them.**
 *
 * `line_items[0][price_data][unit_amount]=5900`. It is the whole of why this
 * repository can talk to Stripe without their SDK: the two calls it makes are
 * a `POST` of these pairs and a `GET`, and the only non-obvious part is the
 * bracket notation, which is forty lines once.
 *
 * Pure, so `test/stripe-session.test.ts` can read the exact body that would go
 * on the wire and assert the currency, the amount and the address collection
 * without a network or a mock of one.
 */

type Scalar = string | number | boolean;
export type Nested = { [key: string]: Scalar | Nested | Array<Scalar | Nested> | undefined };

/**
 * Nested parameters as `a[b][0][c]=v` pairs.
 *
 * `undefined` is **dropped rather than sent empty**, which is the difference
 * between "do not set this" and "set this to nothing" — and Stripe treats an
 * empty string as an instruction to clear a field.
 */
export function formPairs(input: Nested, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(input)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    push(name, raw, out);
  }
  return out;
}

function push(name: string, raw: unknown, out: Array<[string, string]>): void {
  if (raw === undefined || raw === null) return;
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => push(`${name}[${index}]`, item, out));
    return;
  }
  if (typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      push(`${name}[${key}]`, value, out);
    }
    return;
  }
  out.push([name, String(raw)]);
}

export function formEncode(input: Nested): string {
  return formPairs(input)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
