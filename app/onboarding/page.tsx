import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, authConfigured, currentMember } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { summarize } from "../../lib/summary";
import Onboarding from "./onboarding";

export const metadata: Metadata = { title: `Set up · ${BRAND}` };
export const dynamic = "force-dynamic";

// Step 3 of landing → sign in (or skip to the demo) → onboarding → dashboard. Signed-in members and demo visitors
// get in; anyone else is sent to sign in first. Without Clerk configured, it stays open so the demo still works.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const member = await currentMember();
  const demo = Boolean(sp.demo) || (await cookies()).get(DEMO_COOKIE)?.value === "1";
  if (authConfigured() && !member && !demo) redirect("/start?mode=signin&error=signin_required");
  return (
    <Onboarding
      summary={summarize(getDashboardData("C005"))}
      member={member ? { name: member.name, type: member.type } : undefined}
      resume={Boolean(sp.resume)}
    />
  );
}
