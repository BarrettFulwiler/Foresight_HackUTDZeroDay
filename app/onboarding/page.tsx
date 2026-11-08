import type { Metadata } from "next";
import { currentMember } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { summarize } from "../../lib/summary";
import Onboarding from "./onboarding";

export const metadata: Metadata = { title: `Set up · ${BRAND}` };

export const dynamic = "force-dynamic";

// Signed-in members get an extra "Accounts" step, where they add their own accounts before finishing.
export default async function OnboardingPage() {
  const member = await currentMember().catch(() => null);
  return <Onboarding summary={summarize(getDashboardData("C005"))} memberType={member?.type} />;
}
