import fs from "node:fs";
import path from "node:path";
import { CAPITAL_ONE_DEMO_ACCOUNTS } from "./capital-one-demo";

// Server-only: reads PNC's synthetic CSVs (copied into /data from PNC's starter kit).
// Later, swap this for calls to the back end (/api/overview) once it merges PNC + Nessie.

export type AccountKind = "cash" | "investment" | "credit" | "loan";
export type Account = {
  id: string;
  bank: "PNC" | "Capital One";
  type: string;
  name: string;
  mask: string;
  balance: number;
  kind: AccountKind;
  monthlyPayment: number;
  apr: number;
  yieldPct: number;
  // Set when this account's balance comes live from Nessie (see lib/live-accounts.ts).
  nessieId?: string;
  live?: boolean;
  available?: number;
  pending?: number;
};
export type MonthSpend = {
  month: string; // YYYY-MM
  income: number;
  spending: number;
  loanPayments: number;
  byCategory: Record<string, number>;
};
export type Point = { month: string; value: number };
export type Txn = {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  category: string;
  kind: string; // payment | purchase | withdrawal
  account: string; // e.g. "PNC Checking ••0042"
  amount: number;
};
export type DashboardData = {
  customerId: string;
  asOf: string;
  accounts: Account[];
  months: MonthSpend[];
  savingsHistory: Point[];
  transactions: Txn[]; // spending only, oldest first
};

const DATA_DIR = path.join(process.cwd(), "data");

const TYPE_INFO: Record<string, { name: string; kind: AccountKind }> = {
  checking: { name: "Checking", kind: "cash" },
  savings: { name: "Savings", kind: "cash" },
  cd: { name: "CD", kind: "investment" },
  ira: { name: "IRA", kind: "investment" },
  credit_card: { name: "Credit card", kind: "credit" },
  auto_loan: { name: "Auto loan", kind: "loan" },
  personal_loan: { name: "Personal loan", kind: "loan" },
  mortgage: { name: "Mortgage", kind: "loan" },
};
const LOAN_TYPES = new Set(["auto_loan", "personal_loan", "mortgage"]);
const ASSET_TYPES = new Set(["checking", "savings", "cd", "ira"]);

// PNC's files contain no quoted fields, so a plain split is safe.
function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(DATA_DIR, file), "utf8").trim();
  const [head, ...rows] = text.split(/\r?\n/);
  const cols = head.split(",");
  return rows.map((line) => {
    const v = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""]));
  });
}

// Stable fake last-4 digits so cards look real but never change between renders.
function mask(id: string) {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % 10000).padStart(4, "0");
}

const round = (n: number) => Math.round(n * 100) / 100;
const cache = new Map<string, DashboardData>();

export function getDashboardData(customerId = "C005"): DashboardData {
  const hit = cache.get(customerId);
  if (hit) return hit;

  const accountRows = readCsv("accounts.csv").filter((r) => r.customer_id === customerId);
  const pncAccounts: Account[] = accountRows.map((r) => ({
    id: r.account_id,
    bank: "PNC",
    type: r.account_type,
    name: TYPE_INFO[r.account_type]?.name ?? r.account_type,
    mask: mask(r.account_id),
    balance: Number(r.balance),
    kind: TYPE_INFO[r.account_type]?.kind ?? "cash",
    monthlyPayment: Number(r.monthly_payment),
    apr: Number(r.apr_pct),
    yieldPct: Number(r.annual_yield_pct),
  }));

  const accountLabel = new Map(pncAccounts.map((a) => [a.id, `${a.bank} ${a.name} ••${a.mask}`]));
  const transactions: Txn[] = [];
  const byMonth = new Map<string, MonthSpend>();
  for (const r of readCsv("transactions.csv")) {
    if (r.customer_id !== customerId) continue;
    const month = r.posted_date.slice(0, 7);
    const m = byMonth.get(month) ?? { month, income: 0, spending: 0, loanPayments: 0, byCategory: {} };
    const amount = Number(r.amount);
    if (r.flow_class === "income") m.income += amount;
    else if (r.flow_class === "expense") {
      m.spending += amount;
      m.byCategory[r.category] = (m.byCategory[r.category] ?? 0) + amount;
      transactions.push({
        id: r.transaction_id,
        date: r.posted_date,
        month,
        category: r.category,
        kind: r.transaction_type,
        account: accountLabel.get(r.account_id) ?? r.account_type,
        amount,
      });
    } else if (r.flow_class === "internal_transfer" && r.transaction_type === "payment" && LOAN_TYPES.has(r.account_type)) {
      m.loanPayments += amount; // loan side only; card payments would double-count card purchases
    }
    byMonth.set(month, m);
  }
  const months = [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      income: round(m.income),
      spending: round(m.spending),
      loanPayments: round(m.loanPayments),
      byCategory: Object.fromEntries(Object.entries(m.byCategory).map(([k, v]) => [k, round(v)])),
    }));

  const savings = new Map<string, number>();
  for (const r of readCsv("monthly_statements.csv")) {
    if (r.customer_id !== customerId || !ASSET_TYPES.has(r.account_type)) continue;
    savings.set(r.month, (savings.get(r.month) ?? 0) + Number(r.closing_balance));
  }
  const savingsHistory = [...savings.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round(value) }));

  const data: DashboardData = {
    customerId,
    asOf: accountRows[0]?.as_of_date ?? "",
    accounts: [...pncAccounts, ...CAPITAL_ONE_DEMO_ACCOUNTS],
    months,
    savingsHistory,
    transactions: transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  };
  cache.set(customerId, data);
  return data;
}
