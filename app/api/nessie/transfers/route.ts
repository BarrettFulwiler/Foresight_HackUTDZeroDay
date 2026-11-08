import { NextRequest, NextResponse } from "next/server";
import { NessieError, createTransfer, getAccount, settleEarly } from "../../../../lib/nessie";
import { invalidateLiveBalances, linkedNessieIds } from "../../../../lib/live-accounts";

export const dynamic = "force-dynamic";

// Nessie has no idempotency keys yet, so remember recent requests to stop double-clicks making two transfers.
const recent = new Map<string, { at: number; body: unknown }>();
const REPLAY_MS = 2 * 60 * 1000;

// POST /api/nessie/transfers { fromId, toId, amount, requestId } → the pending Nessie transaction.
export async function POST(req: NextRequest) {
  const { fromId, toId, amount, requestId, note } = (await req.json().catch(() => ({}))) as {
    fromId?: string; toId?: string; amount?: number; requestId?: string; note?: string;
  };

  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > REPLAY_MS) recent.delete(k);
  if (requestId && recent.has(requestId)) return NextResponse.json(recent.get(requestId)!.body);

  const allowed = linkedNessieIds();
  const cents = Math.round(Number(amount) * 100);
  if (!fromId || !toId || !allowed.has(fromId) || !allowed.has(toId)) return bad("Pick two linked accounts.");
  if (fromId === toId) return bad("Choose two different accounts.");
  if (!Number.isFinite(cents) || cents < 1) return bad("Enter an amount greater than $0.");

  try {
    const from = await getAccount(fromId);
    if (from.type === "Credit Card") return bad("Money can't be moved out of a credit card here.");
    if (cents > from.available_cents) return bad(`Only $${(from.available_cents / 100).toFixed(2)} is available in ${from.nickname}.`);

    const txn = await createTransfer(fromId, toId, cents, (note || "Moved with Foresight").slice(0, 120));
    await settleEarly(txn.id).catch(() => undefined); // best effort: shortens the wait, the sweep still settles it
    invalidateLiveBalances(); // the hold on the sending account should show on the next read
    const body = { transaction: txn, fromBalanceBefore: from.balance_cents / 100 };
    if (requestId) recent.set(requestId, { at: now, body });
    return NextResponse.json(body);
  } catch (e) {
    const status = e instanceof NessieError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Nessie request failed" }, { status: status >= 500 ? 502 : status });
  }
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
