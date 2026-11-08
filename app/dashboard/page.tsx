import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, authConfigured, currentMember } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { withLiveBalances } from "../../lib/live-accounts";
import Dashboard from "./dashboard";

export const metadata: Metadata = { title: `Dashboard · ${BRAND}` };
export const dynamic = "force-dynamic"; // balances are read live from Nessie on every visit

// Demo user is hardcoded to synthetic customer C005 (all 8 PNC account types).
// Signed-in members and demo visitors ("Try the demo") get in; everyone else goes to sign in.
// When Clerk isn't configured on this machine, the dashboard stays open so the demo still works.
export default async function DashboardPage() {
  const member = await currentMember();
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  if (authConfigured() && !member && !demo) redirect("/start?mode=signin&error=signin_required");
  if (member?.type === "company") redirect("/dashboard/company"); // a business account goes to its own dashboard
  const data = getDashboardData("C005");
  const live = await withLiveBalances(data.accounts);
  return <Dashboard data={{ ...data, accounts: live.accounts }} source={live.source} sourceError={live.error} member={member ? { name: member.name, type: member.type } : undefined} />;
}
