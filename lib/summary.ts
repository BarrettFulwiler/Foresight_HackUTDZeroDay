import type { DashboardData, MonthSpend } from "./finance";

// Small numbers shared by onboarding's preview and the dashboard's headline.
export type Summary = {
  asOf: string;
  liquid: number; // checking + savings at both banks
  monthlyOut: number; // average spending + loan payments, last 3 months
  runwayDays: number; // how many days of that outflow the cash covers
  recent: MonthSpend[]; // last 3 months
};

export function summarize(data: DashboardData): Summary {
  const recent = data.months.slice(-3);
  const liquid = data.accounts.filter((a) => a.kind === "cash").reduce((s, a) => s + a.balance, 0);
  const monthlyOut = recent.reduce((s, m) => s + m.spending + m.loanPayments, 0) / Math.max(1, recent.length);
  return {
    asOf: data.asOf,
    liquid,
    monthlyOut,
    runwayDays: monthlyOut ? Math.round(liquid / (monthlyOut / 30.44)) : 0,
    recent,
  };
}
