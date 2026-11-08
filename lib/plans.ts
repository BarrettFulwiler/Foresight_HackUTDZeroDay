// Turns a what-if ("I want to…") into a concrete plan, using only the forecast engine's numbers.
// Every sentence is filled in from calculated values; nothing here is guessed by an AI.
import type { Account, ScheduleEvent } from "./finance";
import { payoffEffect, runForecast, type Forecast, type Scenario } from "./forecast";
import { goalDay, longMonth, money, shortMonth } from "./format";
import type { Prefs } from "./prefs";

export type PresetId = "trip" | "payoff" | "emergency";
export type BusinessPresetId = "slow" | "equipment" | "cardpayoff"; // lib/business-plans.ts
export type NowMove = { fromId: string; toId: string; amount: number; label: string }; // app account ids
export type Plan = {
  id: PresetId | BusinessPresetId;
  want: string;
  warnings: string[];
  steps: string[];
  outcome: string[];
  nowMoves: NowMove[]; // what "Apply plan" sends through Nessie right now
  asIs: Forecast;
  withPlan: Forecast;
};

export const PRESETS: { id: PresetId; title: string; blurb: string }[] = [
  { id: "trip", title: "Take my trip", blurb: "Can I afford my goal?" },
  { id: "payoff", title: "Pay off my card", blurb: "Stop paying card interest" },
  { id: "emergency", title: "Surprise $1,000 bill", blurb: "What if something breaks?" },
];

export const FLOOR = 200; // keep checking above this
const TOP_UP_TO = 1000;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDay = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const ceil50 = (n: number) => Math.ceil(n / 50) * 50;
const r = (n: number) => money(n, false);

/** The "As is vs With the plan" table. Advising shows it, and Gemini gets it as facts. */
export function compareRows(asIs: Forecast, withPlan: Forecast, cardIds: string[]) {
  const end = shortMonth(withPlan.months.at(-1)!.month);
  const owed = (f: Forecast) => cardIds.reduce((sum, id) => sum + Math.max(0, f.months.at(-1)!.balances[id] ?? 0), 0);
  return [
    { label: "First overdraft", a: asIs.firstNegative ? shortDay(asIs.firstNegative.date) : "None", b: withPlan.firstNegative ? shortDay(withPlan.firstNegative.date) : "None" },
    { label: "Lowest checking", a: money(asIs.lowest.balance, false), b: money(withPlan.lowest.balance, false) },
    { label: `Cash and savings, ${end}`, a: money(asIs.months.at(-1)!.liquid, false), b: money(withPlan.months.at(-1)!.liquid, false) },
    { label: `Owed on cards, ${end}`, a: money(owed(asIs), false), b: money(owed(withPlan), false) },
  ];
}

export function low(f: Forecast, days: number) {
  const pts = f.checkingDaily.slice(0, days);
  return pts.reduce((lo, p) => (p.balance < lo.balance ? p : lo), pts[0]);
}

// baseCuts: the user's budget changes from the Edit tab (category → monthly $ cut; negative = spend more).
// They apply to both futures; a plan's own cuts stack on top.
export function buildPlan(id: PresetId, accounts: Account[], schedule: ScheduleEvent[], asOf: string, goal?: Prefs["goal"], baseCuts: Record<string, number> = {}): Plan {
  const find = (bank: string, type: string) => accounts.find((a) => a.bank === bank && a.type === type);
  const checking = find("PNC", "checking")!;
  const pncSavings = find("PNC", "savings")!;
  const cofSavings = find("Capital One", "savings");
  const pncCard = find("PNC", "credit_card");
  const shield = { fromId: pncSavings.id, toId: checking.id, floor: FLOOR, topUpTo: TOP_UP_TO };
  const tomorrow = addDays(asOf, 1);
  const withBase = (c: Record<string, number> = {}) => {
    const out = { ...baseCuts };
    for (const [k, v] of Object.entries(c)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const run = (s: Scenario = {}) => runForecast(accounts, schedule, asOf, { ...s, cuts: withBase(s.cuts) });
  const base = run();

  // A one-time transfer now from Capital One savings that keeps PNC checking above the floor for 60 days.
  const bridgeFor = (f: Forecast) => {
    if (!cofSavings) return 0;
    const need = FLOOR - low(f, 60).balance;
    return need > 0 ? Math.min(ceil50(need), Math.floor(cofSavings.available ?? cofSavings.balance)) : 0;
  };
  const neg = (f: Forecast) => (f.firstNegative ? `PNC checking is overdrawn on ${shortDay(f.firstNegative.date)} (${money(f.firstNegative.balance)})` : "");
  const safe = (f: Forecast) =>
    f.firstNegative ? `Checking still goes negative on ${shortDay(f.firstNegative.date)}.` : `PNC checking never goes negative. Its lowest point is ${money(f.lowest.balance)} on ${shortDay(f.lowest.date)}.`;
  const endCash = (f: Forecast) => f.months.at(-1)!.liquid;

  if (id === "trip") {
    const target = goal && goal.target > 0 ? goal.target : 1500;
    const by = goal?.by || "2027-03";
    const label = goal?.label || "Trip";
    const tripDate = goalDay(by);
    const moveDate = addDays(tripDate, -1);
    const trip: Scenario = { extra: [{ date: tripDate, accountId: checking.id, delta: -target, label }] };
    const asIs = run(trip);
    const bridge = bridgeFor(asIs);
    const plan: Scenario = {
      ...trip,
      moves: [
        ...(bridge && cofSavings ? [{ date: tomorrow, fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to checking" }] : []),
        { date: moveDate, fromId: pncSavings.id, toId: checking.id, amount: target, label: "Move trip money from savings" },
      ],
      cuts: { dining: 75, shopping: 75 },
      shield,
    };
    const withPlan = run(plan);
    const onTrip = asIs.checkingDaily.find((p) => p.date === tripDate);
    return {
      id,
      want: `${label} in ${longMonth(by)}, about ${r(target)}.`,
      warnings: [
        neg(asIs) ? `${neg(asIs)}, months before the trip, because bills outrun paychecks.` : "",
        onTrip ? `Paying for the trip from checking on ${shortDay(tripDate)} would leave it at ${money(onTrip.balance)}.` : "",
        `You're short ${r(-base.monthly.shortfall)} a month, so savings shrink even without the trip.`,
      ].filter(Boolean),
      steps: [
        ...(bridge ? [`Move ${r(bridge)} from Capital One Savings to PNC Checking now, to get past the next two months of bills.`] : []),
        "Trim dining and shopping by $75 each a month ($150 a month).",
        `On ${shortDay(moveDate)}, move the trip's ${r(target)} from PNC Savings into checking.`,
        `Turn on automatic top-ups: PNC Savings refills checking whenever it would drop below ${r(FLOOR)}.`,
      ],
      outcome: [
        safe(withPlan),
        `The trip is paid for, and you keep ${r(endCash(withPlan))} in cash and savings by ${longMonth(withPlan.months.at(-1)!.month)} (vs ${r(endCash(asIs))} without the plan).`,
        `The cuts shrink the monthly shortfall to ${r(-withPlan.monthly.shortfall)}. That buys time; closing the gap is the lasting fix.`,
      ],
      nowMoves: bridge && cofSavings ? [{ fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to PNC checking" }] : [],
      asIs,
      withPlan,
    };
  }

  if (id === "payoff" && pncCard && pncCard.balance > 0) {
    const amount = Math.round(pncCard.balance * 100) / 100;
    const payoff: Scenario = { moves: [{ date: tomorrow, fromId: pncSavings.id, toId: pncCard.id, amount, label: "Pay off card" }], shield };
    const asIs = base;
    const withPlan = run(payoff);
    const effect = payoffEffect(accounts, schedule, asOf, pncCard.id, pncSavings.id, baseCuts);
    return {
      id,
      want: `Stop paying ${pncCard.apr}% interest on my PNC card.`,
      warnings: [
        `Your PNC card carries ${money(pncCard.balance)} at ${pncCard.apr}%, about ${r(effect.cardSaved)} a month in interest over the next year.`,
        `Across both banks you pay ${r(base.monthly.cardInterest)} a month in card interest and earn ${r(base.monthly.savingsInterest)} on savings.`,
        neg(asIs) ? `Separately, ${neg(asIs)}, so checking needs a backstop either way.` : "",
      ].filter(Boolean),
      steps: [
        `Pay off the PNC card (${money(amount)}) from PNC Savings now.`,
        "From then on, pay each month's card bill in full. It's just new purchases, so no interest.",
        `Turn on automatic top-ups: PNC Savings refills checking whenever it would drop below ${r(FLOOR)}.`,
      ],
      outcome: [
        `About ${r(effect.perMonth)} a month better off (${r(effect.perMonth * 12)} a year): ${r(effect.cardSaved)} a month of card interest you stop paying, minus ${r(effect.savingsLost)} of savings interest that money would have earned.`,
        `Cash and savings drop from ${r(asIs.liquidNow)} to ${r(asIs.liquidNow - amount)} right away, still about ${Math.round(((asIs.liquidNow - amount) / -base.monthly.shortfall) * 10) / 10} months of cushion.`,
        safe(withPlan),
      ],
      nowMoves: [{ fromId: pncSavings.id, toId: pncCard.id, amount, label: "Pay off PNC card" }],
      asIs,
      withPlan,
    };
  }

  // Emergency (also the fallback when there's no card to pay off).
  const hitDate = addDays(asOf, 7);
  const hit: Scenario = { extra: [{ date: hitDate, accountId: checking.id, delta: -1000, label: "Surprise bill" }] };
  const asIs = run(hit);
  const bridge = bridgeFor(asIs);
  const withPlan = run({
    ...hit,
    moves: bridge && cofSavings ? [{ date: tomorrow, fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to checking" }] : [],
    shield,
  });
  const after = asIs.checkingDaily.find((p) => p.date === hitDate);
  return {
    id: "emergency",
    want: `Handle a surprise $1,000 bill on ${shortDay(hitDate)}.`,
    warnings: [
      after ? `Paying it from PNC checking leaves ${money(after.balance)} that day.` : "",
      neg(asIs) ? `Then ${neg(asIs)}${base.firstNegative && asIs.firstNegative && asIs.firstNegative.date < base.firstNegative.date ? `, earlier than the ${shortDay(base.firstNegative.date)} it would be otherwise` : ""}.` : "",
    ].filter(Boolean),
    steps: [
      ...(bridge ? [`Move ${r(bridge)} from Capital One Savings to PNC Checking now. This is what that savings is for.`] : ["Checking can absorb it without a transfer."]),
      `Turn on automatic top-ups: PNC Savings refills checking whenever it would drop below ${r(FLOOR)}.`,
    ],
    outcome: [safe(withPlan), `The bill is paid, and you keep ${r(endCash(withPlan))} in cash and savings a year from now.`],
    nowMoves: bridge && cofSavings ? [{ fromId: cofSavings.id, toId: checking.id, amount: bridge, label: "Bridge to PNC checking" }] : [],
    asIs,
    withPlan,
  };
}
