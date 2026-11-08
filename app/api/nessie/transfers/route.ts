import { NextRequest, NextResponse } from "next/server";
import { currentMember } from "../../../../lib/auth";
import { memberAccounts } from "../../../../lib/member-accounts";
import { BIZ_TAG } from "../../../../lib/companies";
import { NessieError, createTransfer, getAccount, nessieGet, settleEarly } from "../../../../lib/nessie";
import { invalidateLiveBalances, linkedNessieIds } from "../../../../lib/live-accounts";

export const dynamic = "force-dynamic";

// Nessie has no idempotency keys yet, so remember recent requests to stop double-clicks making two transfers.
const recent = new Map<string, { at: number; body: unknown }>();
const REPLAY_MS = 2 * 60 * 1000;

// POST /api/nessie/transfers { fromId, toId, amount, requestId, companyId? } → the pending Nessie transaction.
// Without companyId: only the personal demo's linked accounts. With companyId: only that company's own accounts.
export async function POST(req: NextRequest) {
  const { fromId, toId, amount, requestId, note, companyId } = (await req.json().catch(() => ({}))) as {
    fromId?: string; toId?: string; amount?: number; requestId?: string; note?: string; companyId?: string;
  };

  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > REPLAY_MS) recent.delete(k);
  if (requestId && recent.has(requestId)) return NextResponse.json(recent.get(requestId)!.body);

  const cents = Math.round(Number(amount) * 100);
  if (!fromId || !toId) return bad("Pick two linked accounts.");
  if (fromId === toId) return bad("Choose two different accounts.");
  if (!Number.isFinite(cents) || cents < 1) return bad("Enter an amount greater than $0.");
  // A signed-in member can only move money between their own accounts (never the hidden loan holder).
  const member = await currentMember();
  if (!member && !companyId) {
    const allowed = linkedNessieIds();
    if (!allowed.has(fromId) || !allowed.has(toId)) return bad("Pick two linked accounts.");
  }

  try {
    if (member) {
      const { list } = await memberAccounts(member);
      if (!list.some((a) => a.id === fromId) || !list.some((a) => a.id === toId)) return bad("Pick two of your own accounts.");
    }
    const from = await getAccount(fromId);
    if (companyId && !member) {
      // Both accounts must belong to this company, and it must be one of the seeded "[Biz]" companies.
      const [to, owner] = await Promise.all([getAccount(toId), nessieGet<{ first_name?: string }>(`/customers/${encodeURIComponent(companyId)}`)]);
      if (!owner?.first_name?.endsWith(BIZ_TAG) || from.customer_id !== companyId || to.customer_id !== companyId) return bad("Pick two of the company's accounts.");
    }
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
