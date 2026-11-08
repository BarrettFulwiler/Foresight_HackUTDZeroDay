// Turns one Nessie company (lib/companies.ts) into the same DashboardData the individual dashboard uses, so the
// company gets every tool: View, Edit, Move and Advising, the forecast and the what-if chat.
//
// What's real and what's estimated:
// - Real (live from Nessie): every balance, card limit, loan and monthly loan payment, and this month's activity.
// - Estimated: Nessie only holds the company's recent activity (the seed script's one burst), so that activity is
//   treated as the company's typical month. Earlier months are rebuilt from it with a steady ±15% variation that
//   is the same on every load (seeded by the company id). The dashboard labels this as estimated.
import type { Company } from "./companies";
import type { Account, DashboardData, MonthSpend, Point, ScheduleEvent, Txn } from "./finance";

export type CompanyInfo = { id: string; name: string; industry: string; city: string; pool: number };

// Vendors from scripts/seed-companies.mjs, grouped into business spending categories (labels in lib/format.ts).
const VENDOR_CATEGORY: Record<string, string> = {
  "Gulf Coast Cloud Hosting": "software",
  "Northgate Telecom": "software",
  "Summit Office Supply": "supplies",
  "Pioneer Wholesale Foods": "supplies",
  "Lone Star Fuel Network": "fuel_equipment",
  "Redline Equipment Rental": "fuel_equipment",
  "Brazos Insurance Group": "professional",
  "Capitol Legal & Tax": "professional",
  "Harbor Payroll Services": "professional",
  "BlueSky Marketing Agency": "marketing",
  "Metro Utilities Co-op": "facilities",
  "Ironwood Facilities Services": "facilities",
  "Keystone Freight Brokers": "shipping_travel",
  "Cedar Travel Partners": "shipping_travel",
};

/** Today's date (UTC, YYYY-MM-DD): a company's forecast starts from today's live balances. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

const HISTORY_MONTHS = 24; // account history (the chart offers 6M, 1Y and 2Y)
const SPEND_MONTHS = 12; // monthly spending, for the spending card and budgets

// Small deterministic random numbers, so a company's estimated history is the same on every load.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
function monthsBack(asOf: string, n: number) {
  const [y, m] = asOf.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}

const TYPE: Record<string, string> = { Checking: "checking", Savings: "savings", "Credit Card": "credit_card" };

/** The company's accounts in the app's shape: Nessie cash accounts and cards (movable), plus its loans. */
export function companyAccounts(c: Company): Account[] {
  const cash: Account[] = c.accounts.map((a) => ({
    id: a.id,
    bank: "PNC", // the seed models PNC's business products; the balances themselves live in Nessie
    type: TYPE[a.type] ?? "checking",
    name: a.nickname,
    mask: a.mask,
    balance: a.balance,
    kind: a.type === "Credit Card" ? "credit" : "cash",
    monthlyPayment: 0,
    apr: 0, // Nessie doesn't give rates, so interest isn't counted
    yieldPct: 0,
    limit: a.limit,
    nessieId: a.id,
    live: true,
    available: a.available,
    pending: a.pending,
  }));
  // The operating account first: the forecast and plans treat the first checking account as the main one.
  const isOperating = (a: Account) => a.type === "checking" && /business checking/i.test(a.name);
  cash.sort((a, b) => Number(isOperating(b)) - Number(isOperating(a)));
  const loans: Account[] = c.loans.map((l) => ({
    id: l.id,
    bank: "PNC",
    type: "business_loan",
    name: l.status === "Late" ? `${l.type} (late)` : l.type,
    mask: l.id.slice(-4),
    balance: l.amount,
    kind: "loan",
    monthlyPayment: l.monthly,
    apr: 0,
    yieldPct: 0,
  }));
  return [...cash, ...loans];
}

/** A typical month of the company's money movements, built from its real Nessie activity, cards and loans. */
function companySchedule(c: Company, accounts: Account[]): { schedule: ScheduleEvent[]; spendTxns: { id: string; day: number; at: string; accountId: string; amount: number; kind: string; category: string }[] } {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const operating = accounts.find((a) => a.type === "checking")!;
  const dayOf = (id: string) => (hash(id) % 27) + 1;
  const schedule: ScheduleEvent[] = [];
  const spendTxns: { id: string; day: number; at: string; accountId: string; amount: number; kind: string; category: string }[] = [];
  const ev = (day: number, accountId: string, delta: number, flow: string, kind: string, category: string, label: string) =>
    schedule.push({ day, accountId, delta: r2(delta), flow, kind, category, label });

  for (const t of c.txns) {
    const a = byId.get(t.accountId);
    if (!a || t.status === "cancelled" || t.status === "declined") continue;
    const day = dayOf(t.id);
    if (t.kind === "deposit") ev(day, a.id, t.amount, "income", "deposit", "customer_payments", "Customer payments");
    else if (t.kind === "purchase" || t.kind === "withdrawal") {
      const payroll = t.kind === "withdrawal" && /payroll/i.test(t.description);
      const category = payroll ? "payroll" : (VENDOR_CATEGORY[t.description] ?? "other_spending");
      const kind = payroll ? "payroll" : t.kind;
      ev(day, a.id, a.kind === "credit" ? t.amount : -t.amount, "expense", kind, category, payroll ? "Payroll run" : t.description);
      spendTxns.push({ id: t.id, day, at: t.at.slice(0, 10), accountId: a.id, amount: t.amount, kind, category });
    } else if (t.kind === "transfer" && t.toId && byId.has(t.toId)) {
      ev(day, a.id, -t.amount, "internal_transfer", "transfer", "transfer", t.description);
      ev(day, t.toId, t.amount, "internal_transfer", "transfer", "transfer", t.description);
    }
  }

  // Each card is paid in full from the operating account (its purchases this month), on its own day.
  accounts.filter((a) => a.kind === "credit").forEach((card, i) => {
    const owed = schedule.filter((e) => e.accountId === card.id && e.flow === "expense").reduce((s, e) => s + e.delta, 0);
    if (owed <= 0) return;
    const day = Math.min(28, 24 + i);
    ev(day, operating.id, -owed, "internal_transfer", "payment", "debt_payment", "Card payment");
    ev(day, card.id, -owed, "internal_transfer", "payment", "debt_payment", "Card payment");
  });
  // Loan payments: the real monthly payment from Nessie, from the operating account.
  accounts.filter((a) => a.kind === "loan" && a.monthlyPayment > 0).forEach((loan, i) => {
    const day = Math.min(28, 3 + i * 4);
    const label = `${loan.name} payment`;
    ev(day, operating.id, -loan.monthlyPayment, "internal_transfer", "payment", "debt_payment", label);
    ev(day, loan.id, -loan.monthlyPayment, "internal_transfer", "payment", "debt_payment", label);
  });
  return { schedule: schedule.sort((a, b) => a.day - b.day), spendTxns };
}

export function companyDashboardData(c: Company, asOf: string): { data: DashboardData; info: CompanyInfo } {
  const accounts = companyAccounts(c);
  const { schedule, spendTxns } = companySchedule(c, accounts);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const random = rng(hash(c.id));

  const income = schedule.filter((e) => e.flow === "income").reduce((s, e) => s + e.delta, 0);
  const loanPayments = accounts.filter((a) => a.kind === "loan").reduce((s, a) => s + a.monthlyPayment, 0);
  const typical: Record<string, number> = {};
  for (const e of schedule) if (e.flow === "expense") typical[e.category] = (typical[e.category] ?? 0) + Math.abs(e.delta);
  const cats = Object.keys(typical);

  // One set of factors per month, oldest first; the current month is exactly what Nessie shows (factor 1).
  const allMonths = monthsBack(asOf, HISTORY_MONTHS);
  const factors = allMonths.map((_, i) => {
    const last = i === allMonths.length - 1;
    const vary = () => (last ? 1 : 0.85 + random() * 0.3);
    return { income: vary(), cats: Object.fromEntries(cats.map((k) => [k, vary()])) as Record<string, number> };
  });

  const monthRows: MonthSpend[] = allMonths.map((month, i) => {
    const f = factors[i];
    const byCategory = Object.fromEntries(cats.map((k) => [k, r2(typical[k] * f.cats[k])]));
    return { month, income: r2(income * f.income), spending: r2(Object.values(byCategory).reduce((s, v) => s + v, 0)), loanPayments: r2(loanPayments), byCategory };
  });

  // Spending transactions for every month shown, so the category details have charges to list.
  const label = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.bank} ${a.name} ••${a.mask}` : "";
  };
  const spendMonths = allMonths.slice(-SPEND_MONTHS);
  const transactions: Txn[] = spendMonths.flatMap((month, j) => {
    const f = factors[allMonths.length - SPEND_MONTHS + j];
    const current = j === spendMonths.length - 1;
    return spendTxns.map((t) => {
      const date = current ? t.at : `${month}-${pad(Math.min(t.day, daysIn(month)))}`;
      return { id: `${t.id}-${month}`, date, month: date.slice(0, 7), category: t.category, kind: t.kind, account: label(t.accountId), amount: r2(t.amount * f.cats[t.category]) };
    });
  });
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // Cash history, rebuilt backwards from today's real total: each earlier month removes that month's net flow.
  const liquidNow = accounts.filter((a) => a.kind === "cash").reduce((s, a) => s + a.balance, 0);
  const history: Point[] = [];
  let value = liquidNow;
  for (let i = allMonths.length - 1; i >= 0; i--) {
    history.unshift({ month: allMonths[i], value: r2(Math.max(0, value)) });
    const m = monthRows[i];
    value -= m.income - m.spending - m.loanPayments;
  }

  return {
    data: {
      customerId: c.name,
      asOf,
      accounts,
      months: monthRows.slice(-SPEND_MONTHS),
      savingsHistory: history,
      transactions,
      schedule,
      topUps: { total: 0, count: 0 },
    },
    info: { id: c.id, name: c.name, industry: c.industry, city: c.city, pool: c.pool },
  };
}
