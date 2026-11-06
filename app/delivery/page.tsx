/**
 * Delivery, served from `lib/policy/pages.ts`.
 *
 * The route is four lines because the policy is data and
 * `app/_components/PolicyPage.tsx` is the one renderer — see those two files
 * for everything worth knowing. The footer links here, which was the whole
 * problem: it has linked to this path since the landing page was built and
 * nothing answered it.
 */

import type { Metadata } from "next";
import { pageTitle } from "../../lib/brand";
import PolicyPage from "../_components/PolicyPage";
import { DELIVERY } from "../../lib/policy/pages";

export const metadata: Metadata = {
  title: pageTitle(DELIVERY.title),
  description: DELIVERY.lede,
};

export default function Page() {
  return <PolicyPage policy={DELIVERY} />;
}
