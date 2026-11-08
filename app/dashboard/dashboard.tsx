"use client";
import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "../../lib/finance";
import { BRAND } from "../../lib/brand";
import { categoryMeta, longMonth, money } from "../../lib/format";
import { GOAL_OPTIONS, type Prefs, monthsUntil, usePrefs } from "../../lib/prefs";
import { type Summary, summarize } from "../../lib/summary";
import SpendingDonut from "./spending-donut";
import SavingsChart from "./savings-chart";
import MoneySummary from "./money-summary";
import styles from "./dashboard.module.css";

const TABS = ["View", "Move", "Edit", "Advising"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<Tab>("View");
  const latest = data.months.at(-1)!;
  const { prefs, ready } = usePrefs();
  const sum = useMemo(() => summarize(data), [data]);
  const [welcome, setWelcome] = useState(false);

  // Coming straight from onboarding (?welcome=1): show future-you's first message once.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("welcome")) {
      setWelcome(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <a className={styles.brand} href="/"><span className={styles.mark} aria-hidden="true" />{BRAND}</a>
        <div className={styles.profile}>
          <div>
            <p className={styles.hello}>Welcome back{prefs?.name ? `, ${prefs.name}` : ""}</p>
            <p className={styles.profileSub}>Synthetic profile {data.customerId} · as of {data.asOf}</p>
          </div>
          <a className={styles.avatar} href="/onboarding" title="Change your setup" aria-label="Change your setup">{(prefs?.name || data.customerId).slice(0, 1).toUpperCase()}</a>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Dashboard">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} className={tab === t ? styles.tabOn : styles.tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.body}>
        {tab === "View" && (
          <>
            {welcome && prefs && <Welcome prefs={prefs} onClose={() => setWelcome(false)} />}
            <Highlights prefs={prefs} ready={ready} sum={sum} />
            <div className={styles.row}>
              <section className={styles.panel}><SpendingDonut months={data.months} txns={data.transactions} windowSize={prefs?.period ?? 3} /></section>
              <section className={styles.panel}><SavingsChart points={data.savingsHistory} /></section>
            </div>
            <Budget income={latest.income} spending={latest.spending} loans={latest.loanPayments} month={latest.month} />
            <MoneySummary accounts={data.accounts} />
          </>
        )}
        {tab === "Move" && <Move data={data} />}
        {tab === "Edit" && <EditBudgets data={data} />}
        {tab === "Advising" && <Advising />}
      </div>

      <footer className={styles.foot}>Synthetic data only · Educational prototype · Not financial advice.</footer>
    </main>
  );
}

const firstWord = (s: string) => s.split(" ")[0];

function Welcome({ prefs, onClose }: { prefs: Prefs; onClose: () => void }) {
  const g = prefs.goal;
  const pct = g.target ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const who = g.by ? `${firstWord(longMonth(g.by))}-you` : "future-you";
  const text = `Hi${prefs.name ? ` ${prefs.name}` : ""}, it's ${who}. ${g.label || "Your goal"} is ${pct}% funded. I'll warn you before anything knocks it off track.`;
  return (
    <section className={styles.welcome} role="status">
      <span className={styles.welcomeAvatar} aria-hidden="true">{who.slice(0, 1).toUpperCase()}</span>
      <div>
        <p className={styles.welcomeFrom}>A note from {who}</p>
        <p className={`${styles.bubble} ${styles.bubbleFuture}`}>{text}</p>
      </div>
      <button type="button" className={styles.iconBtn} aria-label="Dismiss message" onClick={onClose}>×</button>
    </section>
  );
}

function Highlights({ prefs, ready, sum }: { prefs: Prefs | null; ready: boolean; sum: Summary }) {
  const days = prefs?.units === "days";
  return (
    <div className={styles.highlights}>
      <section className={`${styles.panel} ${styles.cashCard}`} aria-label="Cash">
        <p className={styles.cashLabel}>{days ? "Your cash covers" : "Cash and savings"}</p>
        <p className={styles.cashValue}>{days ? `${sum.runwayDays} days` : money(sum.liquid, false)}</p>
        <p className={styles.cashSub}>
          {days
            ? `of spending at ${money(sum.monthlyOut, false)} a month · ${money(sum.liquid, false)} across PNC and Capital One`
            : `Across PNC and Capital One · about ${sum.runwayDays} days of spending`}
        </p>
      </section>
      {prefs && prefs.goals.length > 0 ? (
        <GoalCard goal={prefs.goal} asOf={sum.asOf} />
      ) : ready ? (
        <section className={`${styles.panel} ${styles.setupCard}`}>
          <h2 className={styles.cardTitle}>Make it yours</h2>
          <p className={styles.cardSub}>Set a goal and choose how you see your money. Future-you takes it from there.</p>
          <a className={styles.setupLink} href="/onboarding">Set up in 2 minutes →</a>
        </section>
      ) : (
        <section className={styles.panel} aria-hidden="true" />
      )}
    </div>
  );
}

function GoalCard({ goal, asOf }: { goal: Prefs["goal"]; asOf: string }) {
  const meta = GOAL_OPTIONS.find((o) => o.kind === goal.kind);
  const pct = goal.target ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  const months = goal.by ? monthsUntil(asOf, goal.by) : 1;
  const perMonth = Math.max(0, goal.target - goal.saved) / months;
  return (
    <section className={`${styles.panel} ${styles.goalCard}`} aria-labelledby="goal-title">
      <div className={styles.cardHead}>
        <div>
          <p className={styles.cashLabel}>Your goal</p>
          <h2 id="goal-title" className={styles.cardTitle}><span aria-hidden="true">{meta?.icon}</span> {goal.label || meta?.label}</h2>
        </div>
        <a className={styles.editLink} href="/onboarding">Edit</a>
      </div>
      <p className={styles.goalNums}><strong>{money(goal.saved, false)}</strong> of {money(goal.target, false)}{goal.by ? ` by ${longMonth(goal.by)}` : ""}</p>
      <div className={styles.meter} aria-label={`${pct.toFixed(0)}% funded`}><span style={{ width: `${pct}%` }} /></div>
      <p className={styles.cardSub}>{pct.toFixed(0)}% funded · {money(perMonth, false)} a month for {months} month{months === 1 ? "" : "s"} keeps you on track</p>
    </section>
  );
}

function Budget({ income, spending, loans, month }: { income: number; spending: number; loans: number; month: string }) {
  const out = spending + loans;
  const leftover = income - out;
  const used = income ? Math.min(100, (out / income) * 100) : 100;
  return (
    <section className={styles.panel} aria-labelledby="budget-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="budget-title" className={styles.cardTitle}>Budgeting</h2>
          <p className={styles.cardSub}>{longMonth(month)}</p>
        </div>
      </div>
      <div className={styles.budgetRow}>
        <div className={`${styles.budgetBox} ${leftover < 0 ? styles.budgetBad : styles.budgetGood}`}>
          <span>Leftover</span>
          <strong>{leftover < 0 ? "-" : ""}{money(Math.abs(leftover))}</strong>
          <small>{leftover < 0 ? `You spent ${money(-leftover, false)} more than you earned.` : "Money you can save or move."}</small>
        </div>
        <div className={styles.budgetBox}>
          <span>Total income</span>
          <strong>{money(income)}</strong>
          <small>Spending {money(spending, false)} · Loan payments {money(loans, false)}</small>
        </div>
      </div>
      <div className={styles.meter} aria-label={`${used.toFixed(0)}% of income used`}>
        <span style={{ width: `${used}%` }} className={leftover < 0 ? styles.meterOver : undefined} />
      </div>
    </section>
  );
}

function Move({ data }: { data: DashboardData }) {
  const cash = data.accounts.filter((a) => a.kind === "cash");
  const [from, setFrom] = useState(cash.find((a) => a.bank === "Capital One" && a.type === "savings")?.id ?? cash[0]?.id);
  const [to, setTo] = useState(cash.find((a) => a.bank === "PNC" && a.type === "checking")?.id ?? cash[1]?.id);
  const [amount, setAmount] = useState("300");
  const label = (id?: string) => {
    const a = data.accounts.find((x) => x.id === id);
    return a ? `${a.bank} ${a.name} ••${a.mask} · ${money(a.balance)}` : "";
  };
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="move-title">
      <h2 id="move-title" className={styles.cardTitle}>Move money</h2>
      <p className={styles.cardSub}>Between any of your accounts, at either bank.</p>
      <div className={styles.form}>
        <label className={styles.field}>From
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {cash.map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}
          </select>
        </label>
        <label className={styles.field}>To
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {data.accounts.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}
          </select>
        </label>
        <label className={styles.field}>Amount
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <button type="button" className={styles.primaryBtn} disabled title="Connects to Capital One's Nessie API">Transfer {amount ? money(Number(amount)) : ""}</button>
        <p className={styles.note}>Transfers run through Capital One&rsquo;s Nessie API. This button turns on once the back end is connected.</p>
      </div>
    </section>
  );
}

function EditBudgets({ data }: { data: DashboardData }) {
  const recent = data.months.slice(-3);
  const avgIncome = recent.reduce((s, m) => s + m.income, 0) / recent.length;
  const avgLoans = recent.reduce((s, m) => s + m.loanPayments, 0) / recent.length;
  const defaults = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of recent) for (const [k, v] of Object.entries(m.byCategory)) t[k] = (t[k] ?? 0) + v / recent.length;
    return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / 10) * 10]));
  }, [recent]);
  const [budgets, setBudgets] = useState<Record<string, number>>(defaults);
  const planned = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  const left = avgIncome - planned - avgLoans;
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="edit-title">
      <h2 id="edit-title" className={styles.cardTitle}>Edit monthly budget</h2>
      <p className={styles.cardSub}>Starts from your last 3 months. Changes stay on this device for now.</p>
      <ul className={styles.editList}>
        {Object.keys(budgets).map((k, i) => {
          const meta = categoryMeta(k, i);
          return (
            <li key={k}>
              <span className={styles.catIcon} style={{ background: meta.color }} aria-hidden="true">{meta.icon}</span>
              <label className={styles.editLabel} htmlFor={`b-${k}`}>{meta.label}</label>
              <input id={`b-${k}`} className={styles.editInput} inputMode="numeric" value={budgets[k] ?? ""} onChange={(e) => setBudgets({ ...budgets, [k]: Number(e.target.value.replace(/\D/g, "")) })} />
            </li>
          );
        })}
      </ul>
      <div className={`${styles.budgetBox} ${left < 0 ? styles.budgetBad : styles.budgetGood}`}>
        <span>Planned leftover each month</span>
        <strong>{left < 0 ? "-" : ""}{money(Math.abs(left))}</strong>
        <small>Income {money(avgIncome, false)} − budgets {money(planned, false)} − loan payments {money(avgLoans, false)}</small>
      </div>
    </section>
  );
}

// Placeholder until the plan view is built: what-if presets, "now-you wants / future-you warns",
// and an Apply plan button that runs the Nessie transfer.
function Advising() {
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="advise-title">
      <h2 id="advise-title" className={styles.cardTitle}>Future-you&rsquo;s plans</h2>
      <p className={styles.cardSub}>Pick a what-if, see what now-you wants next to what future-you warns, then apply the plan across both banks.</p>
    </section>
  );
}
