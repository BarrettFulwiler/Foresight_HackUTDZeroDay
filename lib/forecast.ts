// The forecast engine: projects every account forward day by day from today's balances, using a
// typical month of recurring money movements (lib/finance.ts → schedule). Pure and client-safe:
// the same function runs on the server (API, AI explanations) and in the browser (what-if buttons).
// Code does all the math here; any AI layer only explains these numbers.
import type { Account, ScheduleEvent } from "./finance";

export type ExtraEvent = { date: string; accountId: string; delta: number; label: string }; // one-off, e.g. a trip
export type PlannedMove = { date: string; fromId: string; toId: string; amount: number; label: string }; // a transfer you schedule
export type Shield = { fromId: string; toId: string; floor: number; topUpTo: number }; // automatic top-up rule
export type Scenario = {
  months?: number; // how far ahead (default 12)
  extra?: ExtraEvent[];
  moves?: PlannedMove[];
  cuts?: Record<string, number>; // monthly $ cut per spending category, e.g. { dining: 75 }
  shield?: Shield;
};

export type DayPoint = { date: string; balance: number };
export type MonthPoint = { month: string; liquid: number; netWorth: number; balances: Record<string, number> };
export type Move = { date: string; fromId: string; toId: string; amount: number; label: string; auto: boolean };
export type Monthly = {
  income: number;
  spending: number;
  loanPayments: number;
  cardInterest: number;
  savingsInterest: number;
  shortfall: number; // income − spending − loan payments − card interest (negative = losing money)
};
export type Forecast = {
  start: string;
  end: string;
  checkingId: string;
  checkingDaily: DayPoint[];
  months: MonthPoint[];
  lowest: DayPoint;
  firstNegative: DayPoint | null;
  moves: Move[];
  monthly: Monthly;
  liquidNow: number;
  cashLastsMonths: number | null; // how long cash + savings cover the shortfall (null = not shrinking)
  interest: { cards: number; savings: number }; // total card interest charged and savings interest earned over the forecast
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
};
const daysInMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

const isLiquid = (a: Account) => a.kind === "cash";
const isOwed = (a: Account) => a.kind === "credit" || a.kind === "loan";

// Monthly interest on one account at its stated rate: positive = earned (assets) or charged (card/loan).
const monthlyInterest = (a: Account, balance: number) =>
  isOwed(a) ? (Math.max(0, balance) * a.apr) / 100 / 12 : (Math.max(0, balance) * a.yieldPct) / 100 / 12;

/** Typical-month totals after any category cuts (used for the "shortfall" health indicator). */
export function monthlyTotals(accounts: Account[], schedule: ScheduleEvent[], cuts: Record<string, number> = {}): Monthly {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const catTotals = categoryTotals(schedule);
  let income = 0, spending = 0, loanPayments = 0, cardInterest = 0, savingsInterest = 0;
  for (const e of schedule) {
    const a = byId.get(e.accountId);
    if (!a) continue;
    if (e.flow === "income") income += e.delta;
    else if (e.flow === "expense") spending += Math.abs(e.delta) * cutScale(e, cuts, catTotals);
    else if (e.category === "debt_payment" && a.kind === "cash" && e.label !== "Card payment") loanPayments += Math.abs(e.delta);
  }
  // Interest comes from today's balances and stated rates, at both banks.
  for (const a of accounts) {
    if (a.kind === "credit") cardInterest += monthlyInterest(a, a.balance);
    else if (!isOwed(a)) savingsInterest += monthlyInterest(a, a.balance);
  }
  return {
    income: r2(income),
    spending: r2(spending),
    loanPayments: r2(loanPayments),
    cardInterest: r2(cardInterest),
    savingsInterest: r2(savingsInterest),
    shortfall: r2(income - spending - loanPayments - cardInterest),
  };
}

/** Typical monthly spending per category (the starting budget on the Edit tab). */
export function categoryTotals(schedule: ScheduleEvent[]) {
  const t: Record<string, number> = {};
  for (const e of schedule) if (e.flow === "expense") t[e.category] = (t[e.category] ?? 0) + Math.abs(e.delta);
  return t;
}
function cutScale(e: ScheduleEvent, cuts: Record<string, number>, totals: Record<string, number>) {
  const cut = cuts[e.category];
  if (e.flow !== "expense" || !cut || !totals[e.category]) return 1;
  return Math.max(0, 1 - cut / totals[e.category]);
}

export function runForecast(accounts: Account[], schedule: ScheduleEvent[], asOf: string, scenario: Scenario = {}): Forecast {
  const months = scenario.months ?? 12;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const bal: Record<string, number> = Object.fromEntries(accounts.map((a) => [a.id, a.balance]));
  const checkingId = accounts.find((a) => a.bank === "PNC" && a.type === "checking")?.id ?? accounts.find((a) => a.type === "checking")!.id;
  const catTotals = categoryTotals(schedule);
  const cuts = scenario.cuts ?? {};
  const rated = accounts.filter((a) => (isOwed(a) ? a.apr : a.yieldPct) > 0);

  // Debt payments come in pairs (cash side + card/loan side, same day and label). They're paid
  // dynamically: never more than what's owed, and a card bill shrinks when card spending is cut.
  type Pair = { day: number; label: string; cashId?: string; owedId?: string; nominal: number };
  const pairs = new Map<string, Pair>();
  const plain: ScheduleEvent[] = [];
  for (const e of schedule) {
    const a = byId.get(e.accountId);
    if (!a || e.kind === "interest_accrual") continue; // interest is computed from balances instead
    if (e.category !== "debt_payment") {
      plain.push(e);
      continue;
    }
    const key = `${e.day}|${e.label}`;
    const p = pairs.get(key) ?? { day: e.day, label: e.label, nominal: 0 };
    if (isOwed(a)) p.owedId = e.accountId;
    else p.cashId = e.accountId;
    p.nominal = Math.max(p.nominal, Math.abs(e.delta));
    pairs.set(key, p);
  }
  // Cards and loans with no history (the Capital One side) are assumed to get their stated monthly
  // payment from the same bank's checking on the 15th.
  for (const a of accounts) {
    if (!isOwed(a) || !a.monthlyPayment || [...pairs.values()].some((p) => p.owedId === a.id)) continue;
    const cash = accounts.find((c) => c.bank === a.bank && c.type === "checking");
    if (cash) pairs.set(`15|${a.id}`, { day: 15, label: `${a.bank} ${a.name} payment`, owedId: a.id, cashId: cash.id, nominal: a.monthlyPayment });
  }
  // Spending cut from each card, so only that card's bill (and payment) shrinks.
  const cardCut = new Map<string, number>();
  for (const e of schedule) {
    if (e.flow !== "expense" || byId.get(e.accountId)?.kind !== "credit") continue;
    cardCut.set(e.accountId, (cardCut.get(e.accountId) ?? 0) + Math.abs(e.delta) * (1 - cutScale(e, cuts, catTotals)));
  }

  const startDate = parse(asOf);
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, 0));

  const checkingDaily: DayPoint[] = [];
  const monthPoints: MonthPoint[] = [];
  const moves: Move[] = [];
  const interest = { cards: 0, savings: 0 };
  const transfer = (date: string, fromId: string, toId: string, amount: number, label: string, auto: boolean) => {
    const a = r2(Math.min(amount, Math.max(0, bal[fromId] ?? 0)));
    if (a <= 0 || !(toId in bal)) return;
    bal[fromId] -= a;
    bal[toId] += isOwed(byId.get(toId)!) ? -a : a; // paying a card or loan lowers what's owed
    moves.push({ date, fromId, toId, amount: a, label, auto });
  };

  for (const d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    const dom = d.getUTCDate();
    const last = daysInMonth(d);

    // Today's money movements: the typical month (short months fold late days into the last day) plus one-offs.
    const today: { accountId: string; delta: number }[] = [];
    for (const e of plain) {
      if (Math.min(e.day, last) !== dom) continue;
      today.push({ accountId: e.accountId, delta: e.delta * cutScale(e, cuts, catTotals) });
    }
    for (const p of pairs.values()) {
      if (Math.min(p.day, last) !== dom) continue;
      const due = p.owedId ? Math.max(0, bal[p.owedId]) : p.nominal;
      const amount = Math.max(0, Math.min(p.nominal - (p.owedId ? cardCut.get(p.owedId) ?? 0 : 0), due));
      if (p.owedId) today.push({ accountId: p.owedId, delta: -amount });
      if (p.cashId) today.push({ accountId: p.cashId, delta: -amount });
    }
    for (const x of scenario.extra ?? []) if (x.date === date) today.push({ accountId: x.accountId, delta: x.delta });
    if (dom === last)
      for (const a of rated) {
        const amount = monthlyInterest(a, bal[a.id]);
        if (a.kind === "credit") interest.cards += amount;
        else if (!isOwed(a)) interest.savings += amount;
        today.push({ accountId: a.id, delta: amount });
      }

    for (const m of scenario.moves ?? []) if (m.date === date) transfer(date, m.fromId, m.toId, m.amount, m.label, false);

    // Shield: if today's movements would push the protected account below the floor, top it up first.
    const s = scenario.shield;
    if (s && s.toId in bal) {
      const net = today.filter((t) => t.accountId === s.toId).reduce((sum, t) => sum + t.delta, 0);
      if (bal[s.toId] + net < s.floor) transfer(date, s.fromId, s.toId, s.topUpTo - (bal[s.toId] + net), "Automatic top-up", true);
    }

    for (const t of today) if (t.accountId in bal) bal[t.accountId] += t.delta;
    checkingDaily.push({ date, balance: r2(bal[checkingId]) });

    if (dom === last) {
      let liquid = 0, netWorth = 0;
      for (const a of accounts) {
        if (isLiquid(a)) liquid += bal[a.id];
        netWorth += isOwed(a) ? -bal[a.id] : bal[a.id];
      }
      monthPoints.push({ month: date.slice(0, 7), liquid: r2(liquid), netWorth: r2(netWorth), balances: Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, r2(v)])) });
    }
  }

  const lowest = checkingDaily.reduce((lo, p) => (p.balance < lo.balance ? p : lo), checkingDaily[0]);
  const firstNegative = checkingDaily.find((p) => p.balance < 0) ?? null;
  const monthly = monthlyTotals(accounts, schedule, cuts);
  const liquidNow = r2(accounts.filter(isLiquid).reduce((sum, a) => sum + a.balance, 0));
  return {
    start: iso(startDate),
    end: iso(endDate),
    checkingId,
    checkingDaily,
    months: monthPoints,
    lowest,
    firstNegative,
    moves,
    monthly,
    liquidNow,
    cashLastsMonths: monthly.shortfall < 0 ? Math.round((liquidNow / -monthly.shortfall) * 10) / 10 : null,
    interest: { cards: r2(interest.cards), savings: r2(interest.savings) },
  };
}

/**
 * What paying a card off from savings tomorrow changes, from two full 12-month forecasts:
 * the card interest you stop paying and the savings interest you give up (monthly averages).
 * perMonth is exactly cardSaved − savingsLost, so every screen shows numbers that add up.
 */
export function payoffEffect(accounts: Account[], schedule: ScheduleEvent[], asOf: string, cardId: string, savingsId: string, cuts: Record<string, number> = {}) {
  const card = accounts.find((a) => a.id === cardId)!;
  const tomorrow = parse(asOf);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = iso(tomorrow);
  const amount = r2(card.balance);
  const base = runForecast(accounts, schedule, asOf, { cuts });
  const alt = runForecast(accounts, schedule, asOf, { cuts, moves: [{ date, fromId: savingsId, toId: cardId, amount, label: "Pay off card" }] });
  const n = base.months.length || 12;
  const cardSaved = Math.round((base.interest.cards - alt.interest.cards) / n);
  const savingsLost = Math.round((base.interest.savings - alt.interest.savings) / n);
  return { date, amount, cardSaved, savingsLost, perMonth: cardSaved - savingsLost };
}
