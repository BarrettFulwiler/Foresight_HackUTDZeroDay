// The signed-in member's monthly income sources and expenses (lib/member-accounts.ts), stored as Nessie bills.
// GET  /api/flows → { flows, accounts }   POST /api/flows { kind, name, amount, accountId, day, category? }
import { NextRequest, NextResponse } from "next/server";
import { currentMember } from "../../../lib/auth";
import { addFlow, fail, memberFlows } from "../../../lib/member-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in to see your income and expenses." }, { status: 401 });
  try {
    return NextResponse.json(await memberFlows(m));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ flow: await addFlow(m, await req.json().catch(() => ({}))) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
