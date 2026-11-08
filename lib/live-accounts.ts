import type { Account } from "./finance";
import { type NessieAccount, getAccount, listCustomerAccounts, nessieConfigured } from "./nessie";

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

// Nessie rate-limits bursts (a page load plus the dashboard right after it was enough), and a failed
// read used to drop the app back to PNC's snapshot balances, so the numbers jumped. Now: one request
// for all accounts, shared by calls within a few seconds, and the last good read is reused if Nessie
// says to slow down.
const FRESH_MS = 3000;
const STALE_OK_MS = 10 * 60 * 1000;
let lastGood: { at: number; byId: Map<string, NessieAccount> } | null = null;
let inFlight: Promise<Map<string, NessieAccount>> | null = null;

/** Call after moving money so the next read fetches fresh balances. */
export function invalidateLiveBalances() {
  if (lastGood) lastGood = { ...lastGood, at: 0 };
}

async function readNessie(): Promise<Map<string, NessieAccount>> {
  const customer = process.env.NESSIE_CUSTOMER_ID;
  const byNessieId = new Map<string, NessieAccount>();
  if (customer) for (const a of await listCustomerAccounts(customer)) byNessieId.set(a.id, a);
  const byId = new Map<string, NessieAccount>();
  for (const l of LINKS) {
    const id = process.env[l.env];
    if (!id) continue;
    byId.set(l.accountId, byNessieId.get(id) ?? (await getAccount(id))); // per-account call only if the list missed it
  }
  return byId;
}

async function liveById(): Promise<Map<string, NessieAccount>> {
  if (lastGood && Date.now() - lastGood.at < FRESH_MS) return lastGood.byId;
  inFlight ??= readNessie()
    .then((byId) => {
      lastGood = { at: Date.now(), byId };
      return byId;
    })
    .finally(() => {
      inFlight = null;
    });
  try {
    return await inFlight;
  } catch (e) {
    if (lastGood && Date.now() - lastGood.at < STALE_OK_MS) return lastGood.byId;
    throw e;
  }
}

/** Replaces the snapshot balances of linked accounts with live Nessie balances. Falls back to the snapshot. */
export async function withLiveBalances(base: Account[]): Promise<LiveResult> {
  if (!nessieConfigured()) return { accounts: base, source: "demo", error: "Nessie isn't configured (NESSIE_KEY missing)" };
  try {
    const byId = await liveById();
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
