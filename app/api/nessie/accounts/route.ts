import { NextResponse } from "next/server";
import { getDashboardData } from "../../../../lib/finance";
import { withLiveBalances } from "../../../../lib/live-accounts";

export const dynamic = "force-dynamic";

// GET /api/nessie/accounts → every account, with live Nessie balances where linked.
export async function GET() {
  const live = await withLiveBalances(getDashboardData("C005").accounts);
  return NextResponse.json(live);
}
