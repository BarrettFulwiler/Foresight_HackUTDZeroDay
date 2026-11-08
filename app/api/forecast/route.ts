import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "../../../lib/finance";
import { runForecast, type Scenario } from "../../../lib/forecast";
import { withLiveBalances } from "../../../lib/live-accounts";

export const dynamic = "force-dynamic";

// GET  /api/forecast        → the "as is" forecast from today's live balances.
// POST /api/forecast { scenario } → the same forecast with a what-if applied.
// Returns a compact summary plus month-end points (daily checking points with ?daily=1).
async function forecast(scenario: Scenario, daily: boolean) {
  const data = getDashboardData("C005");
  const live = await withLiveBalances(data.accounts);
  const f = runForecast(live.accounts, data.schedule, data.asOf, scenario);
  return {
    source: live.source,
    start: f.start,
    end: f.end,
    monthly: f.monthly,
    liquidNow: f.liquidNow,
    cashLastsMonths: f.cashLastsMonths,
    lowest: f.lowest,
    firstNegative: f.firstNegative,
    moves: f.moves,
    months: f.months.map((m) => ({ month: m.month, liquid: m.liquid, netWorth: m.netWorth, checking: m.balances[f.checkingId], balances: m.balances })),
    ...(daily ? { checkingDaily: f.checkingDaily } : {}),
  };
}

export async function GET(req: NextRequest) {
  return NextResponse.json(await forecast({}, req.nextUrl.searchParams.get("daily") === "1"));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { scenario?: Scenario; daily?: boolean };
  return NextResponse.json(await forecast(body.scenario ?? {}, Boolean(body.daily)));
}
