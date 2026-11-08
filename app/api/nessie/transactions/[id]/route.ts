import { NextRequest, NextResponse } from "next/server";
import { getTransaction } from "../../../../../lib/nessie";

export const dynamic = "force-dynamic";

// GET /api/nessie/transactions/:id → current status of a transfer (the app polls this until it completes).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^txn_[a-z0-9]+$/i.test(id)) return NextResponse.json({ error: "Bad transaction id" }, { status: 400 });
  try {
    const t = await getTransaction(id);
    return NextResponse.json({ id: t.id, status: t.status, amount: t.amount_cents / 100, decisionReason: t.decision_reason || "", updatedAt: t.updated_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Nessie request failed" }, { status: 502 });
  }
}
