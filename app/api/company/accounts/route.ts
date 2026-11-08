import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "../../../../lib/companies";
import { companyAccounts } from "../../../../lib/company-dashboard";

export const dynamic = "force-dynamic";

// GET /api/company/accounts?id=<Nessie customer id> → that company's accounts with live balances (after a transfer).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const result = await getCompany(id);
  if (!("company" in result)) return NextResponse.json({ error: result.error }, { status: result.kind === "not_configured" ? 503 : 502 });
  return NextResponse.json({ accounts: companyAccounts(result.company), source: "nessie" });
}
