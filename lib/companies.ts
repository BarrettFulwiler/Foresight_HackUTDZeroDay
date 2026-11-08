// Server-only: the company side of Foresight. Companies live in Nessie as customers whose first name ends in "[Biz]"
// (created by scripts/seed-companies.mjs). Every call picks one at random, then reads its accounts, loans and activity live.
import { NessieError, nessieConfigured, nessieGet, type NessieAccount } from "./nessie";

export const BIZ_TAG = "[Biz]";

type Page<T> = { items?: T[] | null; next_cursor?: string };
type Customer = { id: string; first_name: string; last_name: string; address?: { city?: string; state?: string } };
type NessieLoan = { id: string; account_id: string; type: string; status: string; amount_cents: number; monthly_payment_cents: number; description: string };
type NessieTxn = { id: string; kind: string; status: string; amount_cents: number; description?: string; payer_id?: string; payee_id?: string; created_at: string };

export type CompanyAccount = {
  id: string;
  type: NessieAccount["type"];
  nickname: string;
  mask: string; // last 4 of the account number
  balance: number; // dollars; for a card, the amount owed
  available: number;
  pending: number;
  limit?: number;
};
export type CompanyLoan = { id: string; type: string; status: string; amount: number; monthly: number; accountId: string; description?: string };
export type CompanyTxn = { id: string; kind: string; status: string; amount: number; direction: "in" | "out"; description: string; at: string; accountId: string; toId?: string; category?: string; day?: number; label?: string }; // toId: a transfer's receiving account. category/day/label: set for a member's own income and expenses
export type Company = {
  id: string;
  name: string;
  industry: string;
  city: string;
  accounts: CompanyAccount[];
  loans: CompanyLoan[];
  txns: CompanyTxn[];
  pool: number; // how many companies Nessie had to pick from
};
export type CompanyResult = { company: Company } | { error: string; kind: "not_configured" | "empty" | "failed" };

const itemsOf = <T>(r: Page<T> | T[] | null | undefined): T[] => (Array.isArray(r) ? r : (r?.items ?? []));

// Company ids rarely change, so remember them for a few minutes. Which one is shown is still random on every call.
let idCache: { at: number; customers: Customer[] } | null = null;
let lastPicked = "";

async function companyCustomers(): Promise<Customer[]> {
  if (idCache && Date.now() - idCache.at < 5 * 60_000) return idCache.customers;
  const all: Customer[] = [];
  let cursor = "";
  do {
    const page = await nessieGet<Page<Customer>>(`/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    all.push(...itemsOf(page));
    cursor = page.next_cursor ?? "";
  } while (cursor && all.length < 2000);
  const customers = all.filter((c) => c.first_name.endsWith(BIZ_TAG));
  idCache = { at: Date.now(), customers };
  return customers;
}

const NOT_CONFIGURED: CompanyResult = { kind: "not_configured", error: "Nessie isn't set up. Uncomment NESSIE_KEY in .env, then restart the dev server." };

export async function getRandomCompany(): Promise<CompanyResult> {
  if (!nessieConfigured()) return NOT_CONFIGURED;
  try {
    const customers = await companyCustomers();
    if (!customers.length) return { kind: "empty", error: "Nessie has no companies yet. Run: npm run seed:companies" };
    // Never show the same company twice in a row (when there's a choice).
    const choices = customers.length > 1 ? customers.filter((c) => c.id !== lastPicked) : customers;
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    lastPicked = chosen.id;
    return { company: await loadCompany(chosen, customers.length) };
  } catch (e) {
    return { kind: "failed", error: e instanceof NessieError || e instanceof Error ? e.message : "Nessie request failed" };
  }
}

/** One company by its Nessie customer id. Only "[Biz]" customers count, so this can't read the personal demo customer. */
export async function getCompany(id: string): Promise<CompanyResult> {
  if (!nessieConfigured()) return NOT_CONFIGURED;
  try {
    const customer = await nessieGet<Customer>(`/customers/${encodeURIComponent(id)}`);
    if (!customer?.first_name?.endsWith(BIZ_TAG)) return { kind: "failed", error: "That isn't a company in Nessie." };
    return { company: await loadCompany(customer, idCache?.customers.length ?? 0) };
  } catch (e) {
    return { kind: "failed", error: e instanceof NessieError || e instanceof Error ? e.message : "Nessie request failed" };
  }
}

/** Any Nessie customer's accounts, loans and recent activity, in the same shape as a company. Used for signed-in
 *  members (lib/member-accounts.ts); loansFrom limits which accounts are asked for loans (fewer Nessie calls). */
export async function loadCustomer(customerId: string, loansFrom?: string[]): Promise<Company> {
  const customer = await nessieGet<Customer>(`/customers/${encodeURIComponent(customerId)}`);
  return loadCompany(customer, 0, loansFrom);
}

async function loadCompany(chosen: Customer, pool: number, loansFrom?: string[]): Promise<Company> {
  const accounts = itemsOf(await nessieGet<Page<NessieAccount>>(`/customers/${chosen.id}/accounts?limit=100`));
  const [loans, txns] = await Promise.all([
    Promise.all(accounts.filter((a) => !loansFrom || loansFrom.includes(a.id)).map((a) => nessieGet<Page<NessieLoan>>(`/accounts/${a.id}/loans?limit=100`).then(itemsOf).catch(() => [] as NessieLoan[]))),
    Promise.all(accounts.map((a) => nessieGet<Page<NessieTxn> | NessieTxn[]>(`/accounts/${a.id}/transactions?limit=50`).then(itemsOf).catch(() => [] as NessieTxn[]))),
  ]);

  const seen = new Set<string>();
  const activity: CompanyTxn[] = [];
  txns.forEach((list, i) => {
    for (const t of list) {
      if (seen.has(t.id)) continue; // a transfer shows up under both of its accounts
      seen.add(t.id);
      const incoming = t.kind === "deposit" || t.kind === "refund" || t.kind === "interest_credit" || (t.kind === "transfer" && t.payee_id === accounts[i].id);
      const out = t.kind === "transfer" && t.payer_id ? t.payer_id : accounts[i].id;
      activity.push({ id: t.id, kind: t.kind, status: t.status, amount: t.amount_cents / 100, direction: incoming ? "in" : "out", description: t.description || t.kind, at: t.created_at, accountId: t.kind === "transfer" ? out : accounts[i].id, toId: t.kind === "transfer" ? t.payee_id : undefined });
    }
  });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    id: chosen.id,
    name: chosen.first_name.replace(BIZ_TAG, "").trim(),
    industry: chosen.last_name,
    city: [chosen.address?.city, chosen.address?.state].filter(Boolean).join(", "),
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      nickname: a.nickname,
      mask: (a.account_number ?? a.id).slice(-4),
      balance: a.balance_cents / 100,
      available: a.available_cents / 100,
      pending: a.pending_debits_cents / 100,
      limit: a.credit_limit_cents ? a.credit_limit_cents / 100 : undefined,
    })),
    loans: loans.flat().map((l) => ({ id: l.id, type: l.type, status: l.status, amount: l.amount_cents / 100, monthly: l.monthly_payment_cents / 100, accountId: l.account_id, description: l.description })),
    txns: activity,
    pool,
  };
}
