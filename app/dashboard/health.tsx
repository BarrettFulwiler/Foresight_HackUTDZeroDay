"use client";
import { useMemo } from "react";
import type { Account, ScheduleEvent } from "../../lib/finance";
import { money } from "../../lib/format";
import { payoffEffect, runForecast } from "../../lib/forecast";
import styles from "./dashboard.module.css";

type Status = "bad" | "warn" | "good";
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Three health indicators, all computed by the forecast engine from live balances.
// They update when balances change (e.g. after a transfer on the Move tab).
// `cuts` are the budget changes from the Edit tab, so these cards reflect them.
const NO_CUTS: Record<string, number> = {};
// business: the company dashboard. The third card then shows payroll coverage instead of interest
// (Nessie gives no interest rates for company accounts).
export default function Health({ accounts, schedule, asOf, units, cuts = NO_CUTS, business = false }: { accounts: Account[]; schedule: ScheduleEvent[]; asOf: string; units: "dollars" | "days"; cuts?: Record<string, number>; business?: boolean }) {
  const budgeted = Object.keys(cuts).length > 0;
  const h = useMemo(() => {
    const base = runForecast(accounts, schedule, asOf, { cuts });
    // Lowest point in the next 60 days, or before the first overdraft if that comes sooner.
    const negAt = base.firstNegative ? base.checkingDaily.indexOf(base.firstNegative) : -1;
    const soon = base.checkingDaily.slice(0, negAt > 0 ? Math.min(negAt, 60) : 60);
    const lowSoon = soon.reduce((lo, p) => (p.balance < lo.balance ? p : lo), soon[0] ?? base.checkingDaily[0]);

    // What paying off the costliest card from the biggest savings account would save.
    const card = accounts.filter((a) => a.kind === "credit" && a.balance > 0).sort((a, b) => b.balance * b.apr - a.balance * a.apr)[0];
    const source = accounts.filter((a) => a.kind === "cash" && a.type === "savings").sort((a, b) => b.balance - a.balance)[0];
    let payoff: (ReturnType<typeof payoffEffect> & { card: Account; source: Account }) | null = null;
    if (card && source && source.balance >= card.balance) {
      const effect = payoffEffect(accounts, schedule, asOf, card.id, source.id, cuts);
      if (effect.perMonth >= 1) payoff = { ...effect, card, source };
    }
    return { base, lowSoon, payoff };
  }, [accounts, schedule, asOf, cuts]);

  const { base, lowSoon, payoff } = h;
  const m = base.monthly;
  const checking = accounts.find((a) => a.id === base.checkingId);
  const negDays = base.firstNegative ? daysBetween(asOf, base.firstNegative.date) : null;
  const warnAt = business ? Math.max(500, m.spending * 0.1) : 500; // a business needs a bigger cushion
  const s1: Status = negDays !== null && negDays <= 60 ? "bad" : lowSoon.balance < warnAt ? "warn" : "good";
  const s2: Status = m.shortfall < 0 ? "bad" : m.shortfall < 200 ? "warn" : "good";
  const net = m.savingsInterest - m.cardInterest;
  const s3: Status = net < -50 ? "bad" : net < 0 ? "warn" : "good";
  const lasts = base.cashLastsMonths;

  return (
    <section className={styles.health} aria-label="Financial health">
      <article className={`${styles.panel} ${styles.healthCard} ${styles[`h_${s1}`]}`}>
        <p className={styles.healthLabel}><Dot s={s1} /> {checking ? `${checking.bank} ${checking.name}` : "Checking"} safety</p>
        <p className={styles.healthValue}>{base.firstNegative ? `Overdrawn ${day(base.firstNegative.date)}` : `Lowest ${money(base.lowest.balance, false)}`}</p>
        <p className={styles.healthSub}>
          {base.firstNegative
            ? `In ${negDays} days, without changes. It first dips to ${money(lowSoon.balance)} on ${day(lowSoon.date)}.`
            : `Stays positive all year. Lowest point: ${day(base.lowest.date)}.`}
        </p>
        <p className={styles.healthFoot}>{business ? "Uses the company's deposits, payroll and bills, day by day." : "Uses the paychecks and bills from your history, day by day."}</p>
      </article>

      <article className={`${styles.panel} ${styles.healthCard} ${styles[`h_${s2}`]}`}>
        <p className={styles.healthLabel}><Dot s={s2} /> Monthly {m.shortfall < 0 ? "shortfall" : "surplus"}</p>
        <p className={styles.healthValue}>{m.shortfall < 0 ? "−" : "+"}{money(Math.abs(m.shortfall), false)}<small> / month</small></p>
        <p className={styles.healthSub}>
          A typical month{budgeted ? " with your budgets from Edit" : business ? ", from recent Nessie activity" : ", averaged over your last 3"}: income {money(m.income, false)} vs. spending {money(m.spending, false)}
          {m.cardInterest > 0 ? <>, loans {money(m.loanPayments, false)} and card interest {money(m.cardInterest, false)}.</> : <> and loan payments {money(m.loanPayments, false)}.</>}
        </p>
        <p className={styles.healthFoot}>
          {lasts === null
            ? "Your cash isn't shrinking."
            : units === "days"
              ? `At this pace your cash and savings last about ${Math.round(lasts * 30.44)} days.`
              : `At this pace your ${money(base.liquidNow, false)} in cash and savings lasts about ${lasts} months.`}
        </p>
      </article>

      {business ? <PayrollCard accounts={accounts} schedule={schedule} liquid={base.liquidNow} cuts={cuts} /> : (
      <article className={`${styles.panel} ${styles.healthCard} ${styles[`h_${s3}`]}`}>
        <p className={styles.healthLabel}><Dot s={s3} /> Interest</p>
        <p className={styles.healthValue}>{net < 0 ? "−" : "+"}{money(Math.abs(net), false)}<small> / month</small></p>
        <p className={styles.healthSub}>You pay {money(m.cardInterest, false)} a month in card interest and earn {money(m.savingsInterest, false)} on savings.</p>
        <p className={styles.healthFoot}>
          {payoff
            ? `Paying off your ${payoff.card.bank} card from ${payoff.source.bank} savings: ${money(payoff.cardSaved, false)} less card interest − ${money(payoff.savingsLost, false)} less savings interest = about ${money(payoff.perMonth, false)} a month better off.`
            : "No card balance is costing you more than your savings earn."}
        </p>
      </article>
      )}
    </section>
  );
}

function Dot({ s }: { s: Status }) {
  return <span className={`${styles.dot} ${styles[`dot_${s}`]}`} aria-label={s === "bad" ? "Needs attention" : s === "warn" ? "Watch" : "Healthy"} role="img" />;
}

// Company only: how many months of payroll the cash covers, and how much of the card limits is in use.
function PayrollCard({ accounts, schedule, liquid, cuts }: { accounts: Account[]; schedule: ScheduleEvent[]; liquid: number; cuts: Record<string, number> }) {
  const payroll = schedule.filter((e) => e.category === "payroll" && e.flow === "expense").reduce((t, e) => t + Math.abs(e.delta), 0) - (cuts.payroll ?? 0);
  const months = payroll > 0 ? liquid / payroll : null;
  const s: Status = months === null ? "good" : months < 2 ? "bad" : months < 4 ? "warn" : "good";
  const cards = accounts.filter((a) => a.kind === "credit" && a.limit);
  const used = cards.reduce((t, a) => t + Math.max(0, a.balance), 0);
  const limit = cards.reduce((t, a) => t + (a.limit ?? 0), 0);
  const util = limit ? Math.round((used / limit) * 100) : null;
  return (
    <article className={`${styles.panel} ${styles.healthCard} ${styles[`h_${s}`]}`}>
      <p className={styles.healthLabel}><Dot s={s} /> Payroll coverage</p>
      <p className={styles.healthValue}>{months === null ? "No payroll" : <>{months >= 100 ? "100+" : Math.round(months * 10) / 10}<small> months</small></>}</p>
      <p className={styles.healthSub}>
        {months === null ? "No payroll runs in the company's recent activity." : `Payroll runs about ${money(payroll, false)} a month. Cash and savings (${money(liquid, false)}) cover it for that long.`}
      </p>
      <p className={styles.healthFoot}>
        {util === null ? "No business cards with a known limit." : `Business cards are using ${util}% of their ${money(limit, false)} in limits${util > 30 ? ". Paying them down frees up credit" : ""}.`}
      </p>
    </article>
  );
}
