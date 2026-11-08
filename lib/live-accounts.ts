import type { Account } from "./finance";
import { getAccount, nessieConfigured } from "./nessie";

// Which app accounts are mirrored in Nessie. The IDs live in .env.local (they belong to one Nessie key).
// PNC's history and analysis come from PNC's CSVs; Nessie holds the live balances and moves the money.
const LINKS: { accountId: string; env: string }[] = [
  { accountId: "A-C005-CHECKING", env: "NESSIE_PNC_CHECKING_ID" },
  { accountId: "A-C005-SAVINGS", env: "NESSIE_PNC_SAVINGS_ID" },
  { accountId: "A-C005-CREDIT_CARD", env: "NESSIE_PNC_CARD_ID" },
  { accountId: "COF-CHECKING", env: "NESSIE_CHECKING_ID" },
  { accountId: "COF-SAVINGS", env: "NESSIE_SAVINGS_ID" },
  { accountId: "COF-CARD", env: "NESSIE_CARD_ID" },
];

export type LiveResult = { accounts: Account[]; source: "nessie" | "demo"; error?: string };

/** The Nessie account IDs the app is allowed to move money between. */
export function linkedNessieIds() {
  return new Set(LINKS.map((l) => process.env[l.env]).filter((v): v is string => Boolean(v)));
}

/** Replaces the snapshot balances of linked accounts with live Nessie balances. Falls back to the snapshot. */
export async function withLiveBalances(base: Account[]): Promise<LiveResult> {
  if (!nessieConfigured()) return { accounts: base, source: "demo", error: "Nessie isn't configured (NESSIE_KEY missing)" };
  try {
    const live = await Promise.all(
      LINKS.map(async (l) => {
        const id = process.env[l.env];
        return id ? { accountId: l.accountId, acct: await getAccount(id) } : null;
      }),
    );
    const byId = new Map(live.filter((x) => x !== null).map((x) => [x!.accountId, x!.acct]));
    const accounts = base.map((a) => {
      const n = byId.get(a.id);
      if (!n) return a;
      return {
        ...a,
        nessieId: n.id,
        live: true,
        balance: n.balance_cents / 100,
        available: n.available_cents / 100,
        pending: n.pending_debits_cents / 100,
        // Capital One accounts show their real Nessie account number; PNC keeps the mask its history uses.
        mask: a.bank === "Capital One" ? n.account_number.slice(-4) : a.mask,
      };
    });
    return { accounts, source: "nessie" };
  } catch (e) {
    return { accounts: base, source: "demo", error: e instanceof Error ? e.message : "Nessie request failed" };
  }
}
