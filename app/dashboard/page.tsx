import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, authConfigured, currentMember } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { withLiveBalances } from "../../lib/live-accounts";
import { memberDashboard } from "../../lib/member-accounts";
import AccountsShell from "./accounts-shell";
import Dashboard from "./dashboard";

export const metadata: Metadata = { title: `Dashboard · ${BRAND}` };
export const dynamic = "force-dynamic"; // balances are read live from Nessie on every visit

// Signed-in members and demo visitors ("Try the demo") get in; everyone else goes to sign in.
// When Clerk isn't configured on this machine, the dashboard stays open so the demo still works.
export default async function DashboardPage() {
  const member = await currentMember();
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  if (authConfigured() && !member && !demo) redirect("/start?mode=signin&error=signin_required");

  // Signed-in members see their own accounts from Nessie; companies have their own dashboard.
  if (member) {
    if (member.type === "company") redirect("/dashboard/company");
    const own = await memberDashboard(member).catch(() => null);
    if (!own) return <AccountsShell name={member.name} audience={member.type} />;
    return <Dashboard data={own.data} source="nessie" member={{ name: member.name, type: member.type, ready: own.ready, missing: own.missing }} />;
  }

  // The demo: synthetic PNC customer C005 with live balances on the six shared Nessie accounts.
  const data = getDashboardData("C005");
  const live = await withLiveBalances(data.accounts);
  return <Dashboard data={{ ...data, accounts: live.accounts }} source={live.source} sourceError={live.error} />;
}
