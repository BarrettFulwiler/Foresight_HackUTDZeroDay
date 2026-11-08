// The signed-in member's own accounts (lib/member-accounts.ts). Every request is checked against their sign-in.
// GET  /api/accounts                → { accounts: MemberAccount[] } for the Accounts tab
// GET  /api/accounts?for=dashboard  → { accounts: Account[], source } for refreshing the dashboard after a transfer
// POST /api/accounts { product, name, values } → the new account, or 400 with { errors } per field
import { NextRequest, NextResponse } from "next/server";
import { currentMember } from "../../../lib/auth";
import { addAccount, dashboardAccounts, fail, memberAccounts } from "../../../lib/member-accounts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in to see your accounts." }, { status: 401 });
  try {
    const { list, customer } = await memberAccounts(m);
    if (req.nextUrl.searchParams.get("for") === "dashboard") return NextResponse.json({ accounts: dashboardAccounts(list, customer), source: "nessie" });
    return NextResponse.json({ accounts: list, type: m.type });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in to add accounts." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ account: await addAccount(m, body) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
