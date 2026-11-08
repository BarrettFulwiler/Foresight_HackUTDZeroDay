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
export default function Health({ accounts, schedule, asOf, units, cuts = NO_CUTS }: { accounts: Account[]; schedule: ScheduleEvent[]; asOf: string; units: "dollars" | "days"; cuts?: Record<string, number> }) {
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
  const s1: Status = negDays !== null && negDays <= 60 ? "bad" : lowSoon.balance < 500 ? "warn" : "good";
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
        <p className={styles.healthFoot}>Uses the paychecks and bills from your history, day by day.</p>
      </article>

      <article className={`${styles.panel} ${styles.healthCard} ${styles[`h_${s2}`]}`}>
        <p className={styles.healthLabel}><Dot s={s2} /> Monthly {m.shortfall < 0 ? "shortfall" : "surplus"}</p>
        <p className={styles.healthValue}>{m.shortfall < 0 ? "−" : "+"}{money(Math.abs(m.shortfall), false)}<small> / month</small></p>
        <p className={styles.healthSub}>
          A typical month{budgeted ? " with your budgets from Edit" : ", averaged over your last 3"}: income {money(m.income, false)} vs. spending {money(m.spending, false)}, loans {money(m.loanPayments, false)} and card interest {money(m.cardInterest, false)}.
        </p>
        <p className={styles.healthFoot}>
          {lasts === null
            ? "Your cash isn't shrinking."
            : units === "days"
              ? `At this pace your cash and savings last about ${Math.round(lasts * 30.44)} days.`
              : `At this pace your ${money(base.liquidNow, false)} in cash and savings lasts about ${lasts} months.`}
        </p>
      </article>

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
    </section>
  );
}

function Dot({ s }: { s: Status }) {
  return <span className={`${styles.dot} ${styles[`dot_${s}`]}`} aria-label={s === "bad" ? "Needs attention" : s === "warn" ? "Watch" : "Healthy"} role="img" />;
}
