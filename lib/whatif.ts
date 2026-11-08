// Free-text what-ifs ("Ask future-you" chat). Gemini — or, if it's unavailable, the small
// rule-based parser below — turns the user's sentence into a WhatIfSpec. From there everything is
// the forecast engine's deterministic math, exactly like the preset plans in lib/plans.ts:
// code runs the next 12 months both ways, and the AI only explains the calculated facts.
import type { Account, ScheduleEvent } from "./finance";
import { payoffEffect, runForecast, type Forecast, type Scenario } from "./forecast";
import { longMonth, money } from "./format";
import { compareRows, FLOOR, type NowMove } from "./plans";

export type WhatIfSpec = {
  title: string; // short label, e.g. "Buy a laptop"
  kind: "event" | "habit"; // event = something that happens/costs; habit = a change you choose (a cut, saving, payoff, extra income)
  want: string; // one plain sentence: what the user asked about
  interpretation: string; // how Foresight understood it — shown back so a misread is visible
  oneOffAmount?: number; // one-time expense, in dollars
  oneOffMonth?: string; // YYYY-MM the expense lands
  oneOffLabel?: string;
  monthlyDelta?: number; // recurring monthly change to checking: + = more money in / less out, − = extra cost
  cutsCategory?: string; // schedule category to cut, e.g. "dining"
  cutsAmount?: number; // $ per month to cut from that category
  saveMonthly?: number; // $ per month moved from PNC checking to PNC savings
  payoffCard?: boolean; // pay off the PNC card in full
};

export type CustomPlan = {
  id: "custom";
  title: string;
  want: string;
  warnings: string[];
  steps: string[];
  outcome: string[];
  nowMoves: NowMove[];
  asIs: Forecast;
  withPlan: Forecast;
  interpretation: string;
};

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TOP_UP_TO = 1000;
const r = (n: number) => money(n, false);
const ceil50 = (n: number) => Math.ceil(n / 50) * 50;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

/** The 12 horizon months starting the month after asOf, as YYYY-MM strings. */
export function horizonMonths(asOf: string): string[] {
  const [y, m] = asOf.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i + 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Map a month name in the question to the first YYYY-MM in the horizon with that name. */
function monthFromText(text: string, asOf: string): string | undefined {
  const t = text.toLowerCase();
  // Whole words only, so "decide" isn't December and "market" isn't March.
  const idx = MONTH_NAMES.findIndex((name) => new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t));
  if (idx < 0) return undefined;
  return horizonMonths(asOf).find((ym) => Number(ym.slice(5, 7)) === idx + 1);
}

function amountFromText(text: string): number | undefined {
  const m = text.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)\s*(k\b)?/i) || text.match(/\b(\d+(?:\.\d+)?)\s*(?:dollars|bucks)\b/i);
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return n > 0 ? n : undefined;
}

const CATEGORY_WORDS: Record<string, string> = {
  dining: "dining", eating: "dining", restaurant: "dining", takeout: "dining", coffee: "dining",
  shopping: "shopping", clothes: "shopping", groceries: "groceries", grocery: "groceries",
  transport: "transport", gas: "transport", utilities: "utilities", housing: "housing", rent: "housing",
  // Company categories (lib/company-dashboard.ts). Only categories the customer actually has are kept.
  marketing: "marketing", advertising: "marketing", payroll: "payroll", software: "software", hosting: "software",
  telecom: "software", supplies: "supplies", inventory: "supplies", fuel: "fuel_equipment", equipment: "fuel_equipment",
  legal: "professional", insurance: "professional", accounting: "professional", facilities: "facilities",
  shipping: "shipping_travel", freight: "shipping_travel", travel: "shipping_travel",
};

/** Rule-based parser used when Gemini isn't configured (or doesn't answer) — and as a sanity shape for what Gemini returns. */
export function fallbackParse(question: string, asOf: string): WhatIfSpec {
  const q = question.trim();
  const t = q.toLowerCase();
  const amount = amountFromText(q);
  const month = monthFromText(q, asOf) ?? horizonMonths(asOf)[1]; // default: the month after next
  const monthly = /per month|a month|monthly|each month/.test(t);
  const catWord = Object.keys(CATEGORY_WORDS).find((w) => t.includes(w));

  if (/pay ?off/.test(t) && /card|credit/.test(t)) {
    return { title: "Pay off my card", kind: "habit", want: q, interpretation: "Pay off the PNC credit card in full, from PNC savings.", payoffCard: true };
  }
  if (catWord && /(cut|spend less|reduce|stop|save)/.test(t)) {
    const category = CATEGORY_WORDS[catWord];
    const cut = amount ?? 75;
    return { title: `Cut ${category} spending`, kind: "habit", want: q, interpretation: `Cut ${category} spending by ${r(cut)} a month for the next 12 months.`, cutsCategory: category, cutsAmount: cut };
  }
  if (/(save|put away|set aside)/.test(t) && monthly && amount) {
    return { title: `Save ${r(amount)} a month`, kind: "habit", want: q, interpretation: `Move ${r(amount)} a month from PNC checking to PNC savings.`, saveMonthly: amount };
  }
  if (/(extra|raise|side|second job|income|earn)/.test(t) && monthly && amount) {
    return { title: `Earn ${r(amount)} more a month`, kind: "habit", want: q, interpretation: `${r(amount)} more income lands in checking each month.`, monthlyDelta: amount };
  }
  if ((/lose|lost|drop/.test(t) && /job|income/.test(t)) && amount) {
    return { title: "Income drops", kind: "event", want: q, interpretation: `Income drops by ${r(amount)} a month.`, monthlyDelta: -amount };
  }
  const label = /trip|vacation|holiday/.test(t) ? "Trip" : /car/.test(t) ? "Car cost" : /laptop|computer/.test(t) ? "Laptop" : /repair|broke|broken|emergency|bill/.test(t) ? "Surprise bill" : "One-off expense";
  const amt = amount ?? 1000;
  return {
    title: label === "Trip" ? "Take a trip" : label,
    kind: "event",
    want: q,
    interpretation: `A one-off ${r(amt)} expense (${label.toLowerCase()}) from PNC checking in ${longMonth(month)}.`,
    oneOffAmount: amt,
    oneOffMonth: month,
    oneOffLabel: label,
  };
}

/** Clamp/normalise a spec from any source so the engine only ever sees sane values inside the 12-month horizon. */
export function normalizeSpec(spec: WhatIfSpec, asOf: string, categories: string[]): WhatIfSpec {
  const horizon = horizonMonths(asOf);
  const clamp = (n: number | undefined, max: number) => (typeof n === "number" && isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, max) : undefined);
  const out: WhatIfSpec = {
    title: String(spec.title || "Your what-if").slice(0, 60),
    kind: spec.kind === "habit" ? "habit" : "event",
    want: String(spec.want || spec.title || "Your what-if").slice(0, 300),
    interpretation: String(spec.interpretation || "").slice(0, 300),
    oneOffAmount: clamp(spec.oneOffAmount, 100_000),
    monthlyDelta: typeof spec.monthlyDelta === "number" && isFinite(spec.monthlyDelta) && spec.monthlyDelta !== 0 ? Math.max(-100_000, Math.min(100_000, Math.round(spec.monthlyDelta))) : undefined,
    saveMonthly: clamp(spec.saveMonthly, 100_000),
    payoffCard: Boolean(spec.payoffCard),
  };
  if (out.oneOffAmount) {
    out.oneOffMonth = spec.oneOffMonth && horizon.includes(spec.oneOffMonth) ? spec.oneOffMonth : horizon[1];
    out.oneOffLabel = String(spec.oneOffLabel || "One-off expense").slice(0, 40);
  }
  if (spec.cutsCategory && categories.includes(spec.cutsCategory) && clamp(spec.cutsAmount, 100_000)) {
    out.cutsCategory = spec.cutsCategory;
    out.cutsAmount = clamp(spec.cutsAmount, 100_000);
  }
  // An event with no numbers in it can't be forecast — give it the fallback's reading of the same question.
  if (!out.oneOffAmount && !out.monthlyDelta && !out.cutsCategory && !out.saveMonthly && !out.payoffCard) {
    const fb = fallbackParse(out.want, asOf);
    return { ...fb, title: out.title, want: out.want };
  }
  return out;
}

function lowIn(f: Forecast, days: number) {
  const pts = f.checkingDaily.slice(0, days);
  return pts.reduce((lo, p) => (p.balance < lo.balance ? p : lo), pts[0]);
}
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (iso: string) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Runs a parsed what-if both ways. Event: as-is = it just happens; with-plan = it happens + Foresight's counter-moves.
 *  Habit: as-is = nothing changes; with-plan = the habit applied. All numbers come from runForecast. */
// baseCuts: the user's budget changes from the Edit tab. They apply to both futures, like the presets.
export function buildCustomPlan(spec: WhatIfSpec, accounts: Account[], schedule: ScheduleEvent[], asOf: string, baseCuts: Record<string, number> = {}): CustomPlan {
  const find = (bank: string, type: string) => accounts.find((a) => a.bank === bank && a.type === type);
  const checking = find("PNC", "checking")!;
  const pncSavings = find("PNC", "savings")!;
  const cofSavings = find("Capital One", "savings");
  const pncCard = find("PNC", "credit_card");
  const shield = { fromId: pncSavings.id, toId: checking.id, floor: FLOOR, topUpTo: TOP_UP_TO };
  const tomorrow = addDays(asOf, 1);
  const addCuts = (...sets: (Record<string, number> | undefined)[]) => {
    const out: Record<string, number> = {};
    for (const set of sets) for (const [k, v] of Object.entries(set ?? {})) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const run = (s: Scenario = {}) => runForecast(accounts, schedule, asOf, { ...s, cuts: addCuts(baseCuts, s.cuts) });
  const base = run();

  // The "change" itself, as forecast inputs.
  const change: Scenario = {};
  const changeMoves: Scenario["moves"] = [];
  if (spec.oneOffAmount && spec.oneOffMonth) {
    change.extra = [{ date: `${spec.oneOffMonth}-10`, accountId: checking.id, delta: -spec.oneOffAmount, label: spec.oneOffLabel || "One-off expense" }];
  }
  if (spec.monthlyDelta) {
    const extras = horizonMonths(asOf).map((ym) => ({ date: `${ym}-15`, accountId: checking.id, delta: spec.monthlyDelta!, label: spec.monthlyDelta! > 0 ? "Extra income" : "Extra monthly cost" }));
    change.extra = [...(change.extra ?? []), ...extras];
  }
  if (spec.cutsCategory && spec.cutsAmount) change.cuts = { [spec.cutsCategory]: spec.cutsAmount };
  if (spec.payoffCard && pncCard && pncCard.balance > 0) {
    changeMoves.push({ date: tomorrow, fromId: pncSavings.id, toId: pncCard.id, amount: Math.round(pncCard.balance * 100) / 100, label: "Pay off card" });
  }
  if (spec.saveMonthly) {
    for (const ym of horizonMonths(asOf)) changeMoves.push({ date: `${ym}-01`, fromId: checking.id, toId: pncSavings.id, amount: spec.saveMonthly, label: "Monthly saving" });
  }
  if (changeMoves.length) change.moves = changeMoves;

  const neg = (f: Forecast) => (f.firstNegative ? `PNC checking is overdrawn on ${shortDay(f.firstNegative.date)} (${money(f.firstNegative.balance)})` : "");
  const safe = (f: Forecast) =>
    f.firstNegative ? `Checking still goes negative on ${shortDay(f.firstNegative.date)}.` : `PNC checking never goes negative. Its lowest point is ${money(f.lowest.balance)} on ${shortDay(f.lowest.date)}.`;
  const endCash = (f: Forecast) => f.months.at(-1)!.liquid;

  if (spec.kind === "habit") {
    const asIs = base;
    const withPlan = run({ ...change, shield });
    const steps: string[] = [];
    if (spec.payoffCard && pncCard) steps.push(`Pay off the PNC card (${money(pncCard.balance)}) from PNC Savings now.`);
    if (spec.cutsCategory && spec.cutsAmount) steps.push(`Cut ${spec.cutsCategory} spending by ${r(spec.cutsAmount)} a month, every month.`);
    if (spec.saveMonthly) steps.push(`Move ${r(spec.saveMonthly)} from PNC Checking to PNC Savings on the 1st of each month.`);
    if (spec.monthlyDelta && spec.monthlyDelta > 0) steps.push(`${r(spec.monthlyDelta)} of extra income lands in PNC Checking on the 15th of each month.`);
    steps.push(`Turn on automatic top-ups: PNC Savings refills checking whenever it would drop below ${r(FLOOR)}.`);
    const warnings = [
      neg(asIs) ? `${neg(asIs)}, as things stand.` : "",
      asIs.monthly.shortfall < 0 ? `As things stand, bills outrun paychecks by ${r(-asIs.monthly.shortfall)} a month.` : "",
      // Same calculation as the View card and the "Pay off my card" preset, so the interest figure matches everywhere.
      spec.payoffCard && pncCard && pncCard.balance > 0
        ? `The PNC card carries ${money(pncCard.balance)} at ${pncCard.apr}%, about ${r(payoffEffect(accounts, schedule, asOf, pncCard.id, pncSavings.id, baseCuts).cardSaved)} a month in interest over the next year.`
        : "",
    ].filter(Boolean);
    return {
      id: "custom", title: spec.title, want: spec.want, interpretation: spec.interpretation, warnings, steps,
      outcome: [safe(withPlan), `Cash and savings end the year at ${r(endCash(withPlan))}, vs ${r(endCash(asIs))} as is.`, ...(withPlan.monthly.shortfall >= 0 ? [`The monthly gap closes: paychecks cover bills with ${r(withPlan.monthly.shortfall)} to spare.`] : [])],
      nowMoves: spec.payoffCard && pncCard && pncCard.balance > 0 ? [{ fromId: pncSavings.id, toId: pncCard.id, amount: Math.round(pncCard.balance * 100) / 100, label: "Pay off PNC card" }] : [],
      asIs, withPlan,
    };
  }

  // Event: it happens either way. The plan is how you absorb it.
  const asIs = run(change);
  const steps: string[] = [];
  const planMoves: Scenario["moves"] = [...(change.moves ?? [])];
  const nowMoves: NowMove[] = [];

  // Pay a one-off from savings the day before, rather than letting checking take the hit.
  let savingsStep = "";
  if (spec.oneOffAmount && spec.oneOffMonth) {
    const fromSavings = Math.min(spec.oneOffAmount, Math.max(0, Math.floor(pncSavings.balance)));
    if (fromSavings > 0) {
      planMoves.push({ date: addDays(`${spec.oneOffMonth}-10`, -1), fromId: pncSavings.id, toId: checking.id, amount: fromSavings, label: "Move savings for the expense" });
      savingsStep = `On ${shortDay(addDays(`${spec.oneOffMonth}-10`, -1))}, move ${r(fromSavings)} from PNC Savings into checking, so the ${r(spec.oneOffAmount)} ${spec.oneOffLabel || "expense"} is paid from savings, not from a tight checking balance.`;
    }
  }
  // Bridge now only for what's still short in the next 60 days once the expense is paid from savings
  // (sizing it from "as is" would cover the expense twice and could empty the other bank's savings).
  let bridge = 0;
  if (cofSavings) {
    const need = FLOOR - lowIn(run({ ...change, moves: planMoves }), 60).balance;
    if (need > 0) bridge = Math.min(ceil50(need), Math.floor(cofSavings.available ?? cofSavings.balance));
  }
  if (bridge && cofSavings) {
    planMoves.unshift({ date: tomorrow, fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to checking" });
    nowMoves.push({ fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to PNC checking" });
    steps.push(`Move ${r(bridge)} from Capital One Savings to PNC Checking now, to get past the next two months of bills.`);
  }
  if (savingsStep) steps.push(savingsStep);
  // Only suggest the dining/shopping trim when those categories exist (a company's schedule has neither).
  const hasDiscretionary = schedule.some((e) => e.category === "dining") && schedule.some((e) => e.category === "shopping");
  const planCuts = hasDiscretionary && spec.oneOffAmount && spec.oneOffAmount >= 500 ? { dining: 75, shopping: 75 } : undefined;
  if (planCuts) steps.push("Trim dining and shopping by $75 each a month ($150 a month) to build the savings back up.");
  steps.push(`Turn on automatic top-ups: PNC Savings refills checking whenever it would drop below ${r(FLOOR)}.`);

  const withPlan = run({ ...change, moves: planMoves, cuts: addCuts(change.cuts, planCuts), shield });
  const onDay = spec.oneOffMonth ? asIs.checkingDaily.find((p) => p.date === `${spec.oneOffMonth}-10`) : undefined;
  const warnings = [
    neg(asIs) ? `${neg(asIs)}.` : "",
    onDay && spec.oneOffAmount ? `Paying ${r(spec.oneOffAmount)} from checking on ${shortDay(onDay.date)} would leave it at ${money(onDay.balance)}.` : "",
    asIs.monthly.shortfall < 0 ? `Bills outrun paychecks by ${r(-asIs.monthly.shortfall)} a month in this future.` : "",
  ].filter(Boolean);
  return {
    id: "custom", title: spec.title, want: spec.want, interpretation: spec.interpretation, warnings, steps,
    outcome: [safe(withPlan), `Cash and savings end the year at ${r(endCash(withPlan))}, vs ${r(endCash(asIs))} without the plan.`],
    nowMoves, asIs, withPlan,
  };
}

/** Facts for the AI explainer — the custom-plan twin of planFacts() in lib/explain.ts. */
export function customFacts(plan: CustomPlan, accounts: Account[]): string[] {
  const m = plan.asIs.monthly;
  const cards = accounts.filter((a) => a.kind === "credit").map((a) => a.id);
  return [
    `What-if: ${plan.title}.`,
    `How Foresight read the question: ${plan.interpretation}`,
    `The forecast covers the next 12 months, ${longMonth(plan.asIs.months[0].month)} to ${longMonth(plan.asIs.months.at(-1)!.month)}.`,
    ...accounts.map((a) => `${a.bank} ${a.name} balance today: ${r(a.balance)}.`),
    `Each month, paychecks bring in ${r(m.income)}, spending is ${r(m.spending)}, loan payments are ${r(m.loanPayments)} and card interest is ${r(m.cardInterest)}.`,
    m.shortfall < 0 ? `Bills outrun paychecks by ${r(-m.shortfall)} a month.` : `Paychecks cover the bills with ${r(m.shortfall)} a month to spare.`,
    `Present-you wants: ${plan.want}`,
    ...plan.warnings.map((w) => `Future-you warns: ${w}`),
    ...plan.steps.map((s, i) => `Plan step ${i + 1}: ${s}`),
    ...plan.outcome.map((o) => `With the plan: ${o}`),
    ...compareRows(plan.asIs, plan.withPlan, cards).map((row) => `${row.label}: ${row.a} as is, ${row.b} with the plan.`),
  ];
}
