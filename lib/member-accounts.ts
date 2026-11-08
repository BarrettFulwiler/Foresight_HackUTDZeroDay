// Server-only. A signed-in member's own accounts: added, edited and removed on the Accounts tab, and read by their
// dashboard, Move, Advising and what-ifs.
//
// Where each piece lives:
// - Nessie holds the money: checking/savings/card accounts with their balances and card limits, and loans with
//   the amount owed and monthly payment. Every account is shown under PNC.
// - The Clerk profile (public metadata) holds what Nessie can't: which kind of account it is (money market, CD,
//   IRA, ...) and its rate or APR, keyed by Nessie id.
// - Loans hang off one hidden Nessie checking account per member (the "loan holder"). Deleting a Nessie account
//   deletes its loans, so loans never sit on an account the member can remove.
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { Member } from "./auth";
import { type Audience, type FieldKey, type FlowInput, type FlowKind, type Product, type ProductId, type Values, PRODUCTS, product, validate, validateFlow } from "./account-products";
import { type Company, type CompanyTxn, loadCustomer } from "./companies";
import { companyDashboardData, todayIso } from "./company-dashboard";
import type { Account, DashboardData } from "./finance";
import { NessieError, nessieGet, nessieSend, type NessieAccount } from "./nessie";

type Terms = { product: ProductId; rate?: number; apr?: number; limit?: number };
type Meta = { loanHolderId?: string; accounts?: Record<string, Terms | null> };

/** One account as the Accounts tab shows it. */
export type MemberAccount = { id: string; product: ProductId; name: string; values: Values; mask: string };

export class AccountError extends Error {
  constructor(message: string, public status = 400, public errors?: Record<string, string>) {
    super(message);
  }
}

const cents = (n = 0) => Math.round(n * 100);
const LOAN_HOLDER_NAME = "Foresight loan holder";
const CREDIT_SCORE = 700; // Nessie requires one on every loan; Foresight doesn't use it

async function readMeta(userId: string): Promise<Meta> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return (user.publicMetadata ?? {}) as Meta;
}
async function writeMeta(userId: string, patch: Meta) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: patch }); // Clerk deep-merges; null removes a key
}

/** The member's kind of account for a Nessie account Foresight didn't make (e.g. the old $0 starter accounts). */
function guessProduct(type: NessieAccount["type"], audience: Audience): ProductId {
  if (type === "Credit Card") return audience === "company" ? "business_card" : "credit_card";
  if (type === "Savings") return audience === "company" ? "business_savings" : "savings";
  return audience === "company" ? "business_checking" : "checking";
}
function loanProduct(type: string, audience: Audience): ProductId {
  const match = PRODUCTS.find((p) => p.nessie === "Loan" && p.audience === audience && p.label === type);
  return match?.id ?? (audience === "company" ? "commercial_loan" : "personal_loan");
}

/** Everything the member has, read live from Nessie and combined with the terms on their profile. */
export async function memberAccounts(m: Member): Promise<{ list: MemberAccount[]; customer: Company; meta: Meta }> {
  const meta = await readMeta(m.userId);
  const customer = await loadCustomer(m.nessieCustomerId, meta.loanHolderId ? [meta.loanHolderId] : []);
  const terms = meta.accounts ?? {};
  const list: MemberAccount[] = [];
  for (const a of customer.accounts) {
    if (a.id === meta.loanHolderId) continue;
    const t = terms[a.id];
    const id = t?.product ?? guessProduct(a.type, m.type);
    const values: Values = a.type === "Credit Card" ? { owed: a.balance, limit: a.limit ?? 0, apr: t?.apr ?? 0 } : { balance: a.balance, rate: t?.rate ?? 0 };
    list.push({ id: a.id, product: id, name: a.nickname, values, mask: a.mask });
  }
  for (const l of customer.loans) {
    const t = terms[l.id];
    const id = t?.product ?? loanProduct(l.type, m.type);
    list.push({ id: l.id, product: id, name: l.description || l.type, values: { owed: l.amount, monthly: l.monthly, apr: t?.apr ?? 0, ...(t?.limit !== undefined ? { limit: t.limit } : {}) }, mask: "" }); // loans have no account number
  }
  return { list, customer, meta };
}
// (A loan's name is kept in its Nessie description; its Nessie type holds the product label.)

function check(m: Member, productId: unknown, name: unknown, raw: unknown) {
  const p = product(String(productId));
  if (p && p.audience !== m.type) throw new AccountError(`${p.label} accounts are only for ${p.audience === "company" ? "companies" : "individuals"}.`);
  const result = validate(p, name, (raw ?? {}) as Partial<Record<FieldKey, unknown>>);
  if (!result.ok) throw new AccountError("Some details need fixing.", 400, result.errors as Record<string, string>);
  return { p: p!, name: result.name, values: result.values };
}

function termsFor(p: Product, v: Values): Terms {
  const t: Terms = { product: p.id };
  if (p.fields.includes("rate")) t.rate = v.rate ?? 0;
  if (p.fields.includes("apr")) t.apr = v.apr ?? 0;
  if (p.nessie === "Loan" && p.fields.includes("limit")) t.limit = v.limit ?? 0;
  return t;
}

async function loanHolder(m: Member, meta: Meta): Promise<string> {
  if (meta.loanHolderId) return meta.loanHolderId;
  const holder = await nessieSend<NessieAccount>("POST", `/customers/${m.nessieCustomerId}/accounts`, { type: "Checking", nickname: LOAN_HOLDER_NAME, balance_cents: 0 });
  await writeMeta(m.userId, { loanHolderId: holder.id });
  return holder.id;
}

async function createInNessie(m: Member, p: Product, name: string, v: Values, meta: Meta): Promise<string> {
  if (p.nessie === "Loan") {
    const holder = await loanHolder(m, meta);
    const loan = await nessieSend<{ id: string }>("POST", `/accounts/${holder}/loans`, {
      type: p.label.slice(0, 40), status: "Active", credit_score: CREDIT_SCORE, amount_cents: cents(v.owed), monthly_payment_cents: cents(v.monthly), description: name,
    });
    return loan.id;
  }
  const body = p.nessie === "Credit Card"
    ? { type: "Credit Card", nickname: name, balance_cents: cents(v.owed), credit_limit_cents: cents(v.limit) }
    : { type: p.nessie, nickname: name, balance_cents: cents(v.balance) };
  const acct = await nessieSend<NessieAccount>("POST", `/customers/${m.nessieCustomerId}/accounts`, body);
  return acct.id;
}

export async function addAccount(m: Member, input: { product?: unknown; name?: unknown; values?: unknown }): Promise<MemberAccount> {
  const { p, name, values } = check(m, input.product, input.name, input.values);
  if (p.legacy) throw new AccountError(`${p.label} accounts can't be added anymore. Pick one from the list.`);
  const meta = await readMeta(m.userId);
  const id = await wrap(() => createInNessie(m, p, name, values, meta));
  await writeMeta(m.userId, { accounts: { [id]: termsFor(p, values) } });
  return { id, product: p.id, name, values, mask: "" }; // the list reloads with the real number
}

/** Finds one of the member's own accounts or loans, or throws 404 (also for anyone else's ids). */
async function owned(m: Member, id: string) {
  const { list, meta, customer } = await memberAccounts(m);
  const item = list.find((a) => a.id === id);
  if (!item) throw new AccountError("That account wasn't found.", 404);
  return { item, meta, nessie: customer.accounts.find((a) => a.id === id) };
}

/**
 * Saves changes. Names, card limits and loan amounts are updated in place. Nessie can't set a balance directly
 * (balance changes only arrive through transactions, which wait for its sweep), so a new balance replaces the
 * account with an identical one holding the new amount. Its id changes; the returned account has the new one.
 */
export async function updateAccount(m: Member, id: string, input: { name?: unknown; values?: unknown }): Promise<MemberAccount> {
  const { item, meta, nessie } = await owned(m, id);
  const { p, name, values } = check(m, item.product, input.name, input.values);
  let newId = id;
  await wrap(async () => {
    if (p.nessie === "Loan") {
      await nessieSend("PATCH", `/loans/${id}`, { amount_cents: cents(values.owed), monthly_payment_cents: cents(values.monthly), description: name });
      return;
    }
    const amountNow = nessie?.balance; // for a card, the amount owed
    const amountNew = p.nessie === "Credit Card" ? values.owed : values.balance;
    if (cents(amountNow) !== cents(amountNew)) {
      newId = await createInNessie(m, p, name, values, meta);
      // Income and expenses (Nessie bills) live on the account and would go with it, so move them first.
      for (const b of await billsOn([id])) {
        await nessieSend("POST", `/accounts/${newId}/bills`, { status: "recurring", payee: b.payee, payment_amount: b.payment_amount, recurring_date: b.recurring_date, nickname: b.nickname });
      }
      await nessieSend("DELETE", `/accounts/${id}`);
      return;
    }
    await nessieSend("PATCH", `/accounts/${id}`, { nickname: name, ...(p.nessie === "Credit Card" ? { credit_limit_cents: cents(values.limit) } : {}) });
  });
  await writeMeta(m.userId, { accounts: { ...(newId !== id ? { [id]: null } : {}), [newId]: termsFor(p, values) } });
  return { id: newId, product: p.id, name, values, mask: newId.slice(-4) };
}

export async function removeAccount(m: Member, id: string) {
  const { item } = await owned(m, id);
  const p = product(item.product);
  await wrap(() => nessieSend("DELETE", p?.nessie === "Loan" ? `/loans/${id}` : `/accounts/${id}`));
  await writeMeta(m.userId, { accounts: { [id]: null } });
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountError) throw e;
    const status = e instanceof NessieError ? e.status : 502;
    throw new AccountError(`Nessie couldn't save that${e instanceof Error && e.message ? ` (${e.message})` : ""}. Try again.`, status === 429 ? 429 : 502);
  }
}

/** The member's accounts in the dashboard's shape (lib/finance.ts Account), all under PNC. */
export function dashboardAccounts(list: MemberAccount[], live: Company): Account[] {
  const byId = new Map(live.accounts.map((a) => [a.id, a]));
  const out: Account[] = list.map((a) => {
    const p = product(a.product)!;
    const n = byId.get(a.id);
    const loan = p.nessie === "Loan";
    return {
      id: a.id,
      bank: "PNC",
      type: p.appType,
      name: a.name,
      mask: a.mask,
      balance: loan || p.nessie === "Credit Card" ? (a.values.owed ?? 0) : (a.values.balance ?? 0),
      kind: p.kind,
      monthlyPayment: a.values.monthly ?? 0,
      apr: a.values.apr ?? 0,
      yieldPct: a.values.rate ?? 0,
      limit: a.values.limit,
      ...(n ? { nessieId: n.id, live: true, available: n.available, pending: n.pending } : {}),
    } as Account;
  });
  // The main checking account first: forecasts and plans treat the first checking account as the one bills come from.
  const rank = (a: Account) => (a.type === "checking" ? 0 : a.kind === "cash" ? 1 : 2);
  return out.sort((x, y) => rank(x) - rank(y));
}

/**
 * Whether the dashboard has enough to forecast: individuals need a checking and a savings account (their plans
 * move money between the two), companies need a business checking account (the operating account).
 */
export function readiness(type: Audience, accounts: Account[]) {
  const has = (t: string) => accounts.some((a) => a.type === t && a.kind === "cash");
  if (type === "company") return has("checking") ? { ready: true } : { ready: false, missing: "a Business Checking account" };
  const missing = [!has("checking") && "a Checking account", !has("savings") && "a Savings account"].filter(Boolean);
  return missing.length ? { ready: false, missing: missing.join(" and ") } : { ready: true };
}

/** The member's full dashboard data, built the same way as the company dashboard's, from their own Nessie data. */
export async function memberDashboard(m: Member): Promise<{ data: DashboardData; ready: boolean; missing?: string }> {
  const { list, customer } = await memberAccounts(m);
  const accounts = dashboardAccounts(list, customer);
  const flows = await flowsFor(list);
  // The member's typical month is their own income and expenses (not one-off transfers), the same every month.
  const txns: CompanyTxn[] = flows.map((f) => ({
    id: f.id,
    kind: f.kind === "income" ? "deposit" : "purchase",
    status: "completed",
    amount: f.amount,
    direction: f.kind === "income" ? "in" : "out",
    description: f.name,
    at: todayIso(),
    accountId: f.accountId,
    category: f.kind === "income" ? (m.type === "company" ? "customer_payments" : "paycheck") : f.category,
    day: f.day,
    label: f.name,
  }));
  const own = { ...customer, accounts: customer.accounts.filter((a) => list.some((x) => x.id === a.id)), txns };
  const { data } = companyDashboardData(own, todayIso(), accounts, { steady: true });
  const r = readiness(m.type, accounts);
  return { data: { ...data, customerId: m.name }, ready: r.ready, missing: r.missing };
}

// ---------- Income and expenses ----------
// Stored as recurring Nessie bills on the account the money lands in or leaves from: nickname "income" or
// "expense:<category>", payee = the name, payment_amount = monthly amount, recurring_date = day of the month.
// Bills don't move money in Nessie, so balances stay exactly what the member entered.
type NessieBill = { id: string; account_id: string; nickname?: string; payee: string; payment_amount: number; recurring_date?: number; status: string };
export type Flow = { id: string; kind: FlowKind; name: string; amount: number; accountId: string; day: number; category: string };

async function billsOn(accountIds: string[]): Promise<NessieBill[]> {
  const lists = await Promise.all(accountIds.map((id) => nessieGet<{ items?: NessieBill[] }>(`/accounts/${id}/bills?limit=100`).then((r) => r.items ?? []).catch(() => [] as NessieBill[])));
  return lists.flat();
}
async function flowsFor(list: MemberAccount[]): Promise<Flow[]> {
  const ids = list.filter((a) => product(a.product)?.nessie !== "Loan").map((a) => a.id);
  return (await billsOn(ids))
    .filter((b) => b.nickname === "income" || b.nickname?.startsWith("expense:"))
    .map((b) => ({
      id: b.id,
      kind: b.nickname === "income" ? "income" : "expense",
      name: b.payee,
      amount: b.payment_amount,
      accountId: b.account_id,
      day: b.recurring_date ?? 1,
      category: b.nickname === "income" ? "income" : b.nickname!.slice("expense:".length),
    }));
}

/** The member's income sources and expenses, plus the accounts they can use (for the form's account list). */
export async function memberFlows(m: Member) {
  const { list } = await memberAccounts(m);
  const accounts = list.filter((a) => product(a.product)?.nessie !== "Loan").map((a) => ({ id: a.id, name: a.name, kind: product(a.product)!.kind, label: product(a.product)!.label, mask: a.mask }));
  return { flows: await flowsFor(list), accounts };
}

function checkFlow(m: Member, kind: unknown, input: FlowInput, accounts: { id: string; kind: string }[]) {
  if (kind !== "income" && kind !== "expense") throw new AccountError("Say whether this is income or an expense.");
  const r = validateFlow(kind, m.type, input, accounts);
  if (!r.ok) throw new AccountError("Some details need fixing.", 400, r.errors as Record<string, string>);
  return { kind: kind as FlowKind, ...r };
}
const billBody = (f: { kind: FlowKind; name: string; amount: number; day: number; category: string }) => ({
  status: "recurring", payee: f.name, payment_amount: f.amount, recurring_date: f.day, nickname: f.kind === "income" ? "income" : `expense:${f.category}`,
});

export async function addFlow(m: Member, input: FlowInput & { kind?: unknown }): Promise<Flow> {
  const { accounts } = await memberFlows(m);
  const f = checkFlow(m, input.kind, input, accounts);
  const bill = await wrap(() => nessieSend<{ id: string }>("POST", `/accounts/${f.accountId}/bills`, billBody(f)));
  return { id: bill.id, kind: f.kind, name: f.name, amount: f.amount, accountId: f.accountId, day: f.day, category: f.category };
}

export async function updateFlow(m: Member, id: string, input: FlowInput): Promise<Flow> {
  const { flows, accounts } = await memberFlows(m);
  const current = flows.find((x) => x.id === id);
  if (!current) throw new AccountError("That income or expense wasn't found.", 404);
  const f = checkFlow(m, current.kind, input, accounts);
  let newId = id;
  await wrap(async () => {
    if (f.accountId !== current.accountId) {
      // A bill can't change accounts in Nessie, so it's recreated on the new one.
      newId = (await nessieSend<{ id: string }>("POST", `/accounts/${f.accountId}/bills`, billBody(f))).id;
      await nessieSend("DELETE", `/bills/${id}`);
    } else {
      await nessieSend("PATCH", `/bills/${id}`, billBody(f));
    }
  });
  return { id: newId, kind: f.kind, name: f.name, amount: f.amount, accountId: f.accountId, day: f.day, category: f.category };
}

export async function removeFlow(m: Member, id: string) {
  const { flows } = await memberFlows(m);
  if (!flows.some((x) => x.id === id)) throw new AccountError("That income or expense wasn't found.", 404);
  await wrap(() => nessieSend("DELETE", `/bills/${id}`));
}

/** The API's error response for any failure above (field errors included). */
export function fail(e: unknown) {
  if (e instanceof AccountError) return NextResponse.json({ error: e.message, errors: e.errors }, { status: e.status });
  console.error("[accounts]", e); // unexpected: keep the details in the server log
  return NextResponse.json({ error: "Couldn't reach Nessie. Try again." }, { status: 502 });
}
