import { NextRequest, NextResponse } from "next/server";
import { BIZ_TAG } from "../../../../../lib/companies";
import { invalidateLiveBalances, linkedNessieIds } from "../../../../../lib/live-accounts";
import { cancelTransaction, getAccount, getTransaction, nessieGet } from "../../../../../lib/nessie";

export const dynamic = "force-dynamic";

// GET /api/nessie/transactions/:id → current status of a transfer (the app polls this until it completes).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^txn_[a-z0-9]+$/i.test(id)) return NextResponse.json({ error: "Bad transaction id" }, { status: 400 });
  try {
    const t = await getTransaction(id);
    if (t.status !== "pending") invalidateLiveBalances(); // money moved: the next balance read must be fresh
    return NextResponse.json({ id: t.id, status: t.status, amount: t.amount_cents / 100, decisionReason: t.decision_reason || "", updatedAt: t.updated_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Nessie request failed" }, { status: 502 });
  }
}

// POST /api/nessie/transactions/:id { action: "cancel" } → cancels a pending transfer the app made, releasing the hold.
// Only transfers out of the personal demo's linked accounts or out of a seeded "[Biz]" company's own account.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (!/^txn_[a-z0-9]+$/i.test(id) || body.action !== "cancel") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const t = await getTransaction(id);
    if (t.kind !== "transfer" || !t.payer_id) return NextResponse.json({ error: "Only transfers can be cancelled here." }, { status: 400 });
    if (t.status !== "pending") return NextResponse.json({ id: t.id, status: t.status, amount: t.amount_cents / 100, decisionReason: t.decision_reason || "", updatedAt: t.updated_at });
    const linked = await linkedNessieIds().catch(() => new Set<string>());
    if (!linked.has(t.payer_id)) {
      const payer = await getAccount(t.payer_id);
      const owner = await nessieGet<{ first_name?: string }>(`/customers/${encodeURIComponent(payer.customer_id)}`);
      if (!owner?.first_name?.endsWith(BIZ_TAG)) return NextResponse.json({ error: "That transfer isn't from one of your accounts." }, { status: 403 });
    }
    const c = await cancelTransaction(id);
    invalidateLiveBalances();
    return NextResponse.json({ id: c.id, status: c.status, amount: c.amount_cents / 100, decisionReason: c.decision_reason || "", updatedAt: c.updated_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Nessie request failed" }, { status: 502 });
  }
}
