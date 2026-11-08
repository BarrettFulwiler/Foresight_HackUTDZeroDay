// What-ifs for the company dashboard, in the same Plan shape as lib/plans.ts so Advising shows them the same way.
// Every number comes from the forecast engine; nothing is guessed.
import type { Account, ScheduleEvent } from "./finance";
import { runForecast, type ExtraEvent, type Forecast, type Scenario } from "./forecast";
import { longMonth, money } from "./format";
import { addDays, low, shortDay, type BusinessPresetId, type Plan } from "./plans";
import type { Prefs } from "./prefs";

export const BUSINESS_PRESETS: { id: BusinessPresetId; title: string; blurb: string }[] = [
  { id: "slow", title: "Two slow months", blurb: "What if sales drop 40%?" },
  { id: "equipment", title: "Buy equipment", blurb: "Can we pay cash for it?" },
  { id: "cardpayoff", title: "Pay off the business card", blurb: "Free up the credit line" },
];

const r = (n: number) => money(n, false);
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const nextMonth = (asOf: string, k: number) => {
  const [y, m] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** The cash floor a business keeps in its operating account: 15% of a month's spending, at least $5,000. */
export function businessFloor(schedule: ScheduleEvent[]) {
  const spending = schedule.filter((e) => e.flow === "expense").reduce((s, e) => s + Math.abs(e.delta), 0);
  return Math.max(5000, ceilTo(spending * 0.15, 1000));
}

export function buildBusinessPlan(id: BusinessPresetId, accounts: Account[], schedule: ScheduleEvent[], asOf: string, goal?: Prefs["goal"], baseCuts: Record<string, number> = {}): Plan {
  const checking = accounts.find((a) => a.type === "checking")!; // the operating account (sorted first)
  const reserve = accounts.filter((a) => a.kind === "cash" && a.type === "savings").sort((a, b) => (b.available ?? b.balance) - (a.available ?? a.balance))[0];
  const card = accounts.filter((a) => a.kind === "credit" && a.balance > 0).sort((a, b) => b.balance - a.balance)[0];
  const floor = businessFloor(schedule);
  const shield = reserve ? { fromId: reserve.id, toId: checking.id, floor, topUpTo: floor * 2 } : undefined;
  const tomorrow = addDays(asOf, 1);
  const spare = (a?: Account) => Math.floor(a ? (a.available ?? a.balance) : 0);
  const run = (s: Scenario = {}) => runForecast(accounts, schedule, asOf, { ...s, cuts: { ...baseCuts, ...(s.cuts ?? {}) } });
  const base = run();
  const endCash = (f: Forecast) => f.months.at(-1)!.liquid;
  const safe = (f: Forecast) =>
    f.firstNegative ? `${checking.name} still goes negative on ${shortDay(f.firstNegative.date)}.` : `${checking.name} never goes negative. Its lowest point is ${money(f.lowest.balance)} on ${shortDay(f.lowest.date)}.`;
  const neg = (f: Forecast) => (f.firstNegative ? `${checking.name} is overdrawn on ${shortDay(f.firstNegative.date)} (${money(f.firstNegative.balance)})` : "");
  // A transfer now from the reserve that keeps the operating account above the floor for 90 days.
  const bridgeFor = (f: Forecast) => {
    const need = floor - low(f, 90).balance;
    return need > 0 && reserve ? Math.min(ceilTo(need, 1000), spare(reserve)) : 0;
  };
  const shieldStep = reserve ? `Turn on automatic top-ups: ${reserve.name} refills ${checking.name} whenever it would drop below ${r(floor)}.` : "";

  if (id === "cardpayoff" && card && reserve && spare(reserve) >= card.balance) {
    const amount = Math.round(card.balance * 100) / 100;
    const asIs = base;
    const withPlan = run({ moves: [{ date: tomorrow, fromId: reserve.id, toId: card.id, amount, label: "Pay off card" }], shield });
    const util = card.limit ? Math.round((card.balance / card.limit) * 100) : null;
    return {
      id,
      want: `Pay off the ${card.name} (${money(amount)}) and free up its credit line.`,
      warnings: [
        util !== null ? `The ${card.name} is using ${util}% of its ${r(card.limit!)} limit.` : `The ${card.name} carries ${money(amount)}.`,
        neg(asIs) ? `Separately, ${neg(asIs)}, so the operating account needs a backstop either way.` : "",
      ].filter(Boolean),
      steps: [`Pay off the ${card.name} (${money(amount)}) from ${reserve.name} now.`, "From then on, pay each month's card bill in full from the operating account.", shieldStep].filter(Boolean),
      outcome: [
        util !== null ? `The full ${r(card.limit!)} limit is free again.` : "The card is paid off.",
        `Cash and savings go from ${r(asIs.liquidNow)} to ${r(asIs.liquidNow - amount)} right away.`,
        safe(withPlan),
      ],
      nowMoves: [{ fromId: reserve.id, toId: card.id, amount, label: `Pay off ${card.name}` }],
      asIs,
      withPlan,
    };
  }

  if (id === "equipment") {
    const liquid = base.liquidNow;
    const amount = goal?.kind === "equipment" && goal.target > 0 ? goal.target : Math.max(10_000, roundTo(liquid * 0.1, 5000));
    const ym = goal?.kind === "equipment" && goal.by ? goal.by : nextMonth(asOf, 1);
    const label = goal?.kind === "equipment" && goal.label ? goal.label : "Equipment";
    const date = `${ym}-10`;
    const buy: ExtraEvent[] = [{ date, accountId: checking.id, delta: -amount, label }];
    const asIs = run({ extra: buy });
    // Move only what keeps the operating account above the cushion from the purchase on (often nothing).
    const lowAfter = asIs.checkingDaily.filter((p) => p.date >= date).reduce((lo, p) => Math.min(lo, p.balance), Infinity);
    const need = Number.isFinite(lowAfter) ? floor - lowAfter : 0;
    const fromReserve = reserve && need > 0 ? Math.min(ceilTo(need, 1000), spare(reserve)) : 0;
    const withPlan = run({ extra: buy, moves: fromReserve ? [{ date: addDays(date, -1), fromId: reserve!.id, toId: checking.id, amount: fromReserve, label: "Fund the purchase" }] : [], shield });
    const onDay = asIs.checkingDaily.find((p) => p.date === date);
    return {
      id,
      want: `${label} in ${longMonth(ym)}, about ${r(amount)}, paid in cash.`,
      warnings: [
        onDay ? `Paying it from ${checking.name} on ${shortDay(date)} would leave it at ${money(onDay.balance)}.` : "",
        neg(asIs) ? `${neg(asIs)}.` : "",
      ].filter(Boolean),
      steps: [
        fromReserve ? `On ${shortDay(addDays(date, -1))}, move ${r(fromReserve)} from ${reserve!.name} into ${checking.name} to fund it.` : `${checking.name} can cover it without a transfer.`,
        shieldStep,
      ].filter(Boolean),
      outcome: [safe(withPlan), `The purchase is paid for, and the company keeps ${r(endCash(withPlan))} in cash and savings by ${longMonth(withPlan.months.at(-1)!.month)} (vs ${r(endCash(asIs))} if nothing else changed).`],
      nowMoves: [],
      asIs,
      withPlan,
    };
  }

  // Two slow months (also the fallback when there's no card to pay off): customer payments drop 40%.
  const drop: ExtraEvent[] = [1, 2].flatMap((k) =>
    schedule.filter((e) => e.flow === "income").map((e) => ({ date: `${nextMonth(asOf, k)}-${String(e.day).padStart(2, "0")}`, accountId: e.accountId, delta: -0.4 * e.delta, label: "Slow month" })),
  );
  const lost = -drop.reduce((s, e) => s + e.delta, 0);
  const asIs = run({ extra: drop });
  const bridge = bridgeFor(asIs);
  const withPlan = run({ extra: drop, moves: bridge ? [{ date: tomorrow, fromId: reserve!.id, toId: checking.id, amount: bridge, label: "Bridge to operating" }] : [], shield });
  const lowAsIs = low(asIs, 90);
  return {
    id: "slow",
    want: `Get through ${longMonth(nextMonth(asOf, 1))} and ${longMonth(nextMonth(asOf, 2))} with 40% fewer customer payments.`,
    warnings: [
      `That's about ${r(lost)} less coming in over the two months.`,
      neg(asIs) ? `${neg(asIs)}.` : `${checking.name} bottoms out at ${money(lowAsIs.balance)} on ${shortDay(lowAsIs.date)}${lowAsIs.balance < floor ? `, below the ${r(floor)} cushion` : ""}.`,
    ],
    steps: [
      bridge ? `Move ${r(bridge)} from ${reserve!.name} to ${checking.name} now, to cover the gap.` : `${checking.name} stays above the ${r(floor)} cushion without a transfer.`,
      shieldStep,
    ].filter(Boolean),
    outcome: [safe(withPlan), `The company keeps ${r(endCash(withPlan))} in cash and savings by ${longMonth(withPlan.months.at(-1)!.month)}.`],
    nowMoves: bridge ? [{ fromId: reserve!.id, toId: checking.id, amount: bridge, label: `Bridge to ${checking.name}` }] : [],
    asIs,
    withPlan,
  };
}
