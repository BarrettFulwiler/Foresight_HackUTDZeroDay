// "Code does the math; the AI explains it." The facts below come only from the forecast engine.
// Gemini rewrites them in future-you's voice, and any reply with a number that isn't in the facts is rejected.
import { BUSINESS_PRESETS } from "./business-plans";
import type { Account } from "./finance";
import { longMonth, money } from "./format";
import { compareRows, PRESETS, type Plan } from "./plans";

const NUM = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const norm = (s: string) => Number(s.replace(/,/g, "")).toFixed(2);

export const numbersIn = (text: string) => text.match(NUM) ?? [];

/** Numbers in `text` that don't appear anywhere in `facts`. Empty means every number checks out. */
export function unverified(text: string, facts: string[]): string[] {
  const allowed = new Set(numbersIn(facts.join("\n")).map(norm));
  return [...new Set(numbersIn(text).filter((n) => !allowed.has(norm(n))))];
}

/** Splits text so checked amounts, percentages and dates can be highlighted. Odd indexes are the matches. */
export const splitNumbers = (text: string) =>
  text.split(/(-?\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?%|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?\b)/);

export function planFacts(plan: Plan, accounts: Account[]): string[] {
  const r = (n: number) => money(n, false);
  const m = plan.asIs.monthly;
  const business = BUSINESS_PRESETS.find((p) => p.id === plan.id);
  const title = (business ?? PRESETS.find((p) => p.id === plan.id))?.title ?? plan.id;
  const pay = business ? "customer payments" : "paychecks";
  const cards = accounts.filter((a) => a.kind === "credit").map((a) => a.id);
  return [
    `What-if: ${title}.`,
    `The forecast covers the next 12 months, ${longMonth(plan.asIs.months[0].month)} to ${longMonth(plan.asIs.months.at(-1)!.month)}.`,
    `Each month, ${pay} bring in ${r(m.income)}, spending is ${r(m.spending)}, loan payments are ${r(m.loanPayments)} and card interest is ${r(m.cardInterest)}.`,
    m.shortfall < 0 ? `Bills outrun ${pay} by ${r(-m.shortfall)} a month.` : `${pay[0].toUpperCase()}${pay.slice(1)} cover the bills with ${r(m.shortfall)} a month to spare.`,
    `Present-you wants: ${plan.want}`,
    ...plan.warnings.map((w) => `Future-you warns: ${w}`),
    ...plan.steps.map((s, i) => `Plan step ${i + 1}: ${s}`),
    ...plan.outcome.map((o) => `With the plan: ${o}`),
    ...compareRows(plan.asIs, plan.withPlan, cards).map((row) => `${row.label}: ${row.a} as is, ${row.b} with the plan.`),
  ];
}
