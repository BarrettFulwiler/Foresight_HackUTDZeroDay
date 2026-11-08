// An estimated credit score for the personal dashboard. Neither PNC's sample data nor Nessie has a real FICO Score
// for the demo customer, so this estimates one from what the data does show, using the five factor weights FICO
// publishes. It is labeled as an estimate everywhere it appears. Companies don't get one: FICO Scores are personal.
import type { Account, DashboardData } from "./finance";
import { longMonth, money } from "./format";

export type CreditFactor = { key: string; label: string; weight: number; rating: number; text: string };
export type CreditEstimate = { score: number; band: string; factors: CreditFactor[]; tip: string };

// FICO's published score bands.
export const BANDS = [
  { min: 300, max: 579, label: "Poor", color: "#c2410c" },
  { min: 580, max: 669, label: "Fair", color: "#d97706" },
  { min: 670, max: 739, label: "Good", color: "#ca8a04" },
  { min: 740, max: 799, label: "Very good", color: "#3f8f4e" },
  { min: 800, max: 850, label: "Exceptional", color: "#1f7a3a" },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
};
const LOAN_NAMES: Record<string, string> = { credit_card: "credit card", auto_loan: "auto loan", personal_loan: "personal loan", mortgage: "mortgage", student_loan: "student loan" };

export function estimateCredit(accounts: Account[], credit: NonNullable<DashboardData["credit"]>, asOf: string): CreditEstimate {
  // 1. Payment history (35%): late or missed payments in the transaction history.
  const late = credit.latePayments;
  const payment: CreditFactor = {
    key: "payment",
    label: "Payment history",
    weight: 0.35,
    rating: late === 0 ? 1 : clamp(1 - 0.2 * late, 0.3, 1),
    text: late === 0 ? `${credit.debtPayments} card and loan payments in the history, none late.` : `${late} late or missed ${late === 1 ? "payment" : "payments"} out of ${credit.debtPayments}.`,
  };

  // 2. Amounts owed (30%): how much of the card limits is in use. Cards without a known limit are left out.
  const cards = accounts.filter((a) => a.kind === "credit");
  const known = cards.filter((a) => a.limit);
  const used = known.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const limit = known.reduce((s, a) => s + (a.limit ?? 0), 0);
  const util = limit ? used / limit : 0;
  const unknown = cards.filter((a) => !a.limit).map((a) => `${a.bank} ${a.name}`);
  const owed: CreditFactor = {
    key: "owed",
    label: "Amounts owed",
    weight: 0.3,
    rating: limit ? clamp(1 - 1.2 * util, 0.1, 1) : 0.7,
    text: limit
      ? `Cards use ${Math.round(util * 100)}% of their ${money(limit, false)} limit.${unknown.length ? ` The ${unknown.join(" and ")} limit isn't in the data, so it's left out.` : ""}`
      : "No card limits are in the data, so this is assumed average.",
  };

  // 3. Length of history (15%): the data only goes back so far, so this is a floor, not the real account age.
  const months = credit.since ? monthsBetween(credit.since, asOf.slice(0, 7)) : 0;
  const length: CreditFactor = {
    key: "length",
    label: "Length of history",
    weight: 0.15,
    rating: clamp(0.4 + (months / 120) * 0.6, 0.4, 1),
    text: credit.since ? `The history we can see starts in ${longMonth(credit.since)} (${months} months). Older accounts would help, but that isn't in the data.` : "Account ages aren't in the data.",
  };

  // 4. Credit mix (10%): kinds of credit (cards are revolving; loans are installment).
  const kinds = [...new Set(accounts.filter((a) => a.kind === "credit" || a.kind === "loan").map((a) => a.type))];
  const names = kinds.map((k) => LOAN_NAMES[k] ?? k.replace(/_/g, " "));
  const mix: CreditFactor = {
    key: "mix",
    label: "Credit mix",
    weight: 0.1,
    rating: clamp(kinds.length / 3, 0.3, 1),
    text: names.length ? `${names.length} kinds of credit: ${names.join(", ")}.` : "No cards or loans.",
  };

  // 5. New credit (10%): applications and new accounts aren't in either dataset.
  const fresh: CreditFactor = { key: "new", label: "New credit", weight: 0.1, rating: 0.8, text: "Recent applications aren't in the data, so this is assumed average." };

  const factors = [payment, owed, length, mix, fresh];
  const raw = 300 + 550 * factors.reduce((s, f) => s + f.weight * f.rating, 0);
  const score = clamp(Math.round(raw / 10) * 10, 300, 850);
  const band = BANDS.find((b) => score >= b.min && score <= b.max)!.label;

  // The one thing that would move it most: card utilization if it's high, otherwise on-time payments.
  const over30 = used - 0.3 * limit;
  const over10 = used - 0.1 * limit;
  const tip =
    limit && over30 > 0
      ? `Paying ${money(Math.ceil(over30), false)} off the card would bring it under 30% of the limit; ${money(Math.ceil(over10), false)} would bring it under 10%.`
      : limit && over10 > 0
        ? `Paying ${money(Math.ceil(over10), false)} off the card would bring it under 10% of the limit.`
        : late
          ? "Paying every bill on time from here is the biggest single lever."
          : "Keep paying on time and keep card balances low; that's most of the score.";

  return { score, band, factors, tip };
}
