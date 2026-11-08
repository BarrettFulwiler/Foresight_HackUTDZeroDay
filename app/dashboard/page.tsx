import type { Metadata } from "next";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { withLiveBalances } from "../../lib/live-accounts";
import Dashboard from "./dashboard";

export const metadata: Metadata = { title: `Dashboard · ${BRAND}` };
export const dynamic = "force-dynamic"; // balances are read live from Nessie on every visit

// Demo user is hardcoded to synthetic customer C005 (all 8 PNC account types).
export default async function DashboardPage() {
  const data = getDashboardData("C005");
  const live = await withLiveBalances(data.accounts);
  return <Dashboard data={{ ...data, accounts: live.accounts }} source={live.source} sourceError={live.error} />;
}
