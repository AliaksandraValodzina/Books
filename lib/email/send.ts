/**
 * **Sending the one email, or saying honestly that it was not sent.**
 *
 * The project has no email service. The brief's instruction is to *send it
 * through whatever the project already has, or name the service needed in
 * `.env.example` and leave it unconfigured rather than guessing* — so this
 * names one, and with nothing configured it reports `"unconfigured"` and the
 * order records `emailed: false`. The admin page shows that column, which is
 * the point: an unsent confirmation is a thing the captain has to know about,
 * not a silent zero.
 *
 * **It never throws into the webhook.** The webhook is the only thing that may
 * mark an order paid, and an email provider having a bad afternoon must not
 * turn a successful payment into a retried event and an order that looks
 * abandoned. So every failure here is a returned value.
 *
 * ## Why Resend
 *
 * One HTTP call, no SDK, and a free tier that covers a shop sending one email
 * per order. Swapping it is this file: the shape above and below is a
 * `{subject, text}` and a result.
 */

import { value } from "../env";
import type { Email } from "./order";

export const EMAIL_REQUIRED = ["RESEND_API_KEY", "ORDER_EMAIL_FROM"] as const;

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "unconfigured"; missing: string[] }
  | { sent: false; reason: "refused"; detail: string };

export async function sendEmail(options: {
  to: string;
  email: Email;
  env: Record<string, string | undefined>;
  fetchLike?: typeof fetch;
}): Promise<SendResult> {
  const key = value(options.env, "RESEND_API_KEY");
  const from = value(options.env, "ORDER_EMAIL_FROM");
  const missing = EMAIL_REQUIRED.filter((name) => !value(options.env, name));
  if (!key || !from) return { sent: false, reason: "unconfigured", missing };
  if (!options.to) return { sent: false, reason: "refused", detail: "no address to send to" };

  try {
    const response = await (options.fetchLike ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.email.subject,
        text: options.email.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // The provider's message, never the key. The repository is public and so
      // are its logs.
      return { sent: false, reason: "refused", detail: `HTTP ${response.status} ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "refused", detail: (error as Error).message };
  }
}
