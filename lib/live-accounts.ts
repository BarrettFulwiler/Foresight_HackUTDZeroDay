import type { Account } from "./finance";
import { type NessieAccount, getAccount, listCustomerAccounts, nessieConfigured, nessieGet } from "./nessie";

// Which app accounts are mirrored in Nessie. PNC's history and analysis come from PNC's CSVs; Nessie holds the
// live balances and moves the money. The IDs can be pinned in .env (they belong to one Nessie key); any left empty
// are found by name: the demo customer (NESSIE_DEMO_CUSTOMER, default "Alex Rivera") and each account's nickname.
const LINKS: { accountId: string; env: string; nickname: string }[] = [
  { accountId: "A-C005-CHECKING", env: "NESSIE_PNC_CHECKING_ID", nickname: "PNC Checking" },
  { accountId: "A-C005-SAVINGS", env: "NESSIE_PNC_SAVINGS_ID", nickname: "PNC Savings" },
  { accountId: "A-C005-CREDIT_CARD", env: "NESSIE_PNC_CARD_ID", nickname: "PNC Credit card" },
  { accountId: "COF-CHECKING", env: "NESSIE_CHECKING_ID", nickname: "Capital One Checking" },
  { accountId: "COF-SAVINGS", env: "NESSIE_SAVINGS_ID", nickname: "Capital One Savings" },
  { accountId: "COF-CARD", env: "NESSIE_CARD_ID", nickname: "Capital One Credit card" },
];

export type LiveResult = { accounts: Account[]; source: "nessie" | "demo"; error?: string };

type Customer = { id: string; first_name?: string; last_name?: string };
let demoCustomer: Promise<string> | null = null;

/** The demo customer's Nessie ID: NESSIE_CUSTOMER_ID if set, otherwise looked up by name once and remembered. */
function demoCustomerId(): Promise<string> {
  if (process.env.NESSIE_CUSTOMER_ID) return Promise.resolve(process.env.NESSIE_CUSTOMER_ID);
  demoCustomer ??= (async () => {
    const want = (process.env.NESSIE_DEMO_CUSTOMER || "Alex Rivera").toLowerCase();
    let cursor = "";
    do {
      const page = await nessieGet<{ items: Customer[]; next_cursor?: string }>(`/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      const hit = page.items.find((c) => `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim().toLowerCase() === want);
      if (hit) return hit.id;
      cursor = page.next_cursor ?? "";
    } while (cursor);
    return "";
  })().catch((e) => {
    demoCustomer = null; // try again on the next request
    throw e;
  });
  return demoCustomer;
}

/** The Nessie account IDs the app is allowed to move money between (the demo customer's linked accounts). */
export async function linkedNessieIds(): Promise<Set<string>> {
  const byId = await liveById();
  return new Set([...byId.values()].map((a) => a.id));
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
  const customer = await demoCustomerId();
  const owned = customer ? await listCustomerAccounts(customer) : [];
  const byNessieId = new Map(owned.map((a) => [a.id, a]));
  const byNickname = new Map(owned.map((a) => [a.nickname.toLowerCase(), a]));
  const byId = new Map<string, NessieAccount>();
  for (const l of LINKS) {
    const id = process.env[l.env];
    // A pinned ID wins (per-account call only if the customer's list missed it); otherwise match the nickname.
    const account = id ? (byNessieId.get(id) ?? (await getAccount(id))) : byNickname.get(l.nickname.toLowerCase());
    if (account) byId.set(l.accountId, account);
  }
  if (byId.size === 0) throw new Error("No linked Nessie accounts: set NESSIE_CUSTOMER_ID, or seed the demo customer");
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
