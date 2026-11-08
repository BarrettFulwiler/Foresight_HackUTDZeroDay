"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, DashboardData, ScheduleEvent } from "../../lib/finance";
import { BRAND } from "../../lib/brand";
import { categoryTotals, monthlyTotals, runForecast, type Forecast } from "../../lib/forecast";
import { categoryMeta, longMonth, money } from "../../lib/format";
import { shortDay } from "../../lib/plans";
import { GOAL_OPTIONS, type Prefs, monthsUntil, usePrefs } from "../../lib/prefs";
import { type Summary, summarize } from "../../lib/summary";
import SpendingDonut from "./spending-donut";
import SavingsChart from "./savings-chart";
import MoneySummary from "./money-summary";
import Health from "./health";
import Advising from "./advising";
import styles from "./dashboard.module.css";

const TABS = ["View", "Move", "Edit", "Advising"] as const;
type Tab = (typeof TABS)[number];

type Source = "nessie" | "demo";
export type Receipt = {
  requestId: string;
  id?: string; // Nessie transaction id
  fromId: string;
  toId: string;
  amount: number;
  status: "sending" | "pending" | "completed" | "declined" | "cancelled" | "failed" | "slow";
  createdAt: number;
  error?: string;
  before: { from: number; to: number };
  after?: { from: number; to: number };
};

const POLL_MS = 5000;
const GIVE_UP_MS = 3 * 60 * 1000;
const BUDGETS_KEY = "foresight.budgets";

export default function Dashboard({ data, source: initialSource, sourceError }: { data: DashboardData; source: Source; sourceError?: string }) {
  const [tab, setTab] = useState<Tab>("View");
  const latest = data.months.at(-1)!;
  const { prefs, ready } = usePrefs();
  const [welcome, setWelcome] = useState(false);

  // One shared set of balances for every tab. Transfers update it, so View reflects Move right away.
  const [accounts, setAccounts] = useState<Account[]>(data.accounts);
  const [source, setSource] = useState<Source>(initialSource);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const sum = useMemo(() => summarize({ ...data, accounts }), [data, accounts]);

  // Budgets from the Edit tab (only the categories the user changed), saved on this device.
  // They become category cuts for the forecast, so View's health cards and every Advising plan use them.
  const typical = useMemo(() => categoryTotals(data.schedule), [data.schedule]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BUDGETS_KEY) ?? "{}");
      if (saved && typeof saved === "object") setBudgets(Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in typical && typeof v === "number" && v >= 0)) as Record<string, number>);
    } catch {}
  }, [typical]);
  const updateBudgets = (next: Record<string, number>) => {
    setBudgets(next);
    try {
      localStorage.setItem(BUDGETS_KEY, JSON.stringify(next));
    } catch {}
  };
  const cuts = useMemo(() => Object.fromEntries(Object.entries(budgets).filter(([k]) => k in typical).map(([k, v]) => [k, typical[k] - v])), [budgets, typical]);

  const refreshAccounts = useCallback(async () => {
    const res = await fetch("/api/nessie/accounts", { cache: "no-store" });
    const body = (await res.json()) as { accounts: Account[]; source: Source };
    setAccounts(body.accounts);
    setSource(body.source);
    return body.accounts;
  }, []);

  const balanceOf = (list: Account[], nessieId: string) => list.find((a) => a.nessieId === nessieId)?.balance ?? 0;

  // Sends one Nessie transfer and tracks it as a receipt. Returns the receipt's id.
  async function sendTransfer(fromId: string, toId: string, amount: number): Promise<string> {
    const requestId = crypto.randomUUID();
    const receipt: Receipt = { requestId, fromId, toId, amount, status: "sending", createdAt: Date.now(), before: { from: balanceOf(accounts, fromId), to: balanceOf(accounts, toId) } };
    setReceipts((r) => [receipt, ...r]);
    const update = (patch: Partial<Receipt>) => setReceipts((r) => r.map((x) => (x.requestId === requestId ? { ...x, ...patch } : x)));
    try {
      const res = await fetch("/api/nessie/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId, toId, amount, requestId }) });
      const body = await res.json();
      if (!res.ok) update({ status: "failed", error: body.error || "Transfer failed" });
      else {
        update({ id: body.transaction.id, status: "pending" });
        refreshAccounts(); // shows the hold on the sending account right away
      }
    } catch {
      update({ status: "failed", error: "Couldn't reach the server" });
    }
    return requestId;
  }

  // Poll pending transfers until Nessie's once-a-minute sweep completes them, then refresh balances.
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;
  useEffect(() => {
    if (!receipts.some((r) => r.status === "pending")) return;
    const timer = setInterval(async () => {
      for (const r of receiptsRef.current.filter((x) => x.status === "pending" && x.id)) {
        if (Date.now() - r.createdAt > GIVE_UP_MS) {
          setReceipts((list) => list.map((x) => (x.requestId === r.requestId ? { ...x, status: "slow" } : x)));
          continue;
        }
        const res = await fetch(`/api/nessie/transactions/${r.id}`, { cache: "no-store" }).catch(() => null);
        const t = res && res.ok ? ((await res.json()) as { status: Receipt["status"]; decisionReason: string }) : null;
        if (!t || t.status === "pending") continue;
        const fresh = await refreshAccounts();
        setReceipts((list) =>
          list.map((x) =>
            x.requestId === r.requestId
              ? { ...x, status: t.status, error: t.status === "completed" ? undefined : t.decisionReason || undefined, after: { from: balanceOf(fresh, r.fromId), to: balanceOf(fresh, r.toId) } }
              : x,
          ),
        );
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [receipts, refreshAccounts]);

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
              <section className={styles.panel}><SavingsChart points={data.savingsHistory} topUps={data.topUps} /></section>
            </div>
            <Health accounts={accounts} schedule={data.schedule} asOf={data.asOf} units={prefs?.units ?? "dollars"} cuts={cuts} />
            <Budget income={latest.income} spending={latest.spending} loans={latest.loanPayments} month={latest.month} />
            <MoneySummary accounts={accounts} source={source} />
          </>
        )}
        {tab === "Move" && <Move accounts={accounts} source={source} sourceError={sourceError} receipts={receipts} onTransfer={sendTransfer} />}
        {tab === "Edit" && (
          <EditBudgets typical={typical} budgets={budgets} onChange={updateBudgets} cuts={cuts} accounts={accounts} schedule={data.schedule} asOf={data.asOf} onOpen={setTab} />
        )}
        {tab === "Advising" && (
          <Advising
            accounts={accounts}
            schedule={data.schedule}
            asOf={data.asOf}
            goal={prefs && prefs.goals.length ? prefs.goal : undefined}
            live={source === "nessie"}
            receipts={receipts}
            onTransfer={sendTransfer}
            onShowReceipts={() => setTab("Move")}
            cuts={cuts}
          />
        )}
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
          <h2 id="goal-title" className={styles.cardTitle}>{goal.label || meta?.label}</h2>
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
          <p className={styles.cardSub}>{longMonth(month)} · what actually happened (the Health row above uses a typical month)</p>
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

function Move({ accounts, source, sourceError, receipts, onTransfer }: {
  accounts: Account[];
  source: Source;
  sourceError?: string;
  receipts: Receipt[];
  onTransfer: (fromId: string, toId: string, amount: number) => Promise<unknown>;
}) {
  const linked = accounts.filter((a) => a.nessieId);
  const sources = linked.filter((a) => a.kind === "cash");
  const [from, setFrom] = useState(sources.find((a) => a.bank === "Capital One" && a.type === "savings")?.nessieId ?? sources[0]?.nessieId ?? "");
  const [to, setTo] = useState(linked.find((a) => a.bank === "PNC" && a.type === "checking")?.nessieId ?? "");
  const [amount, setAmount] = useState("300");
  const [busy, setBusy] = useState(false);

  const fromAcct = linked.find((a) => a.nessieId === from);
  const value = Number(amount);
  const available = fromAcct?.available ?? fromAcct?.balance ?? 0;
  const problem =
    source !== "nessie" ? "Nessie isn't connected" :
    !from || !to ? "Pick both accounts" :
    from === to ? "Pick two different accounts" :
    !(value > 0) ? "Enter an amount" :
    value > available ? `Only ${money(available)} available` : "";
  const label = (a: Account) => `${a.bank} ${a.name} ••${a.mask} · ${money(a.kind === "credit" ? a.balance : a.available ?? a.balance)}${a.kind === "credit" ? " owed" : ""}`;
  const nameOf = (id: string) => {
    const a = linked.find((x) => x.nessieId === id);
    return a ? `${a.bank} ${a.name} ••${a.mask}` : id;
  };

  async function submit() {
    if (problem || busy) return;
    setBusy(true);
    await onTransfer(from, to, Math.round(value * 100) / 100);
    setBusy(false);
  }

  return (
    <div className={styles.moveGrid}>
      <section className={styles.panel} aria-labelledby="move-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="move-title" className={styles.cardTitle}>Move money</h2>
            <p className={styles.cardSub}>Between your accounts at either bank, through Capital One&rsquo;s Nessie API.</p>
          </div>
          <span className={source === "nessie" ? styles.liveTag : styles.demoTag}>{source === "nessie" ? "Live · Nessie" : "Demo data"}</span>
        </div>
        {source !== "nessie" && <p className={styles.alert}>Transfers are off because Nessie isn&rsquo;t reachable{sourceError ? ` (${sourceError})` : ""}.</p>}
        <div className={styles.form}>
          <label className={styles.field}>From
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {sources.map((a) => <option key={a.nessieId} value={a.nessieId}>{label(a)}</option>)}
            </select>
          </label>
          <label className={styles.field}>To
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose an account</option>
              {linked.filter((a) => a.nessieId !== from).map((a) => <option key={a.nessieId} value={a.nessieId}>{label(a)}</option>)}
            </select>
          </label>
          <label className={styles.field}>Amount ($)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <button type="button" className={styles.primaryBtn} disabled={Boolean(problem) || busy} onClick={submit}>
            {busy ? "Sending…" : `Transfer ${value > 0 ? money(value) : ""}`}
          </button>
          <p className={styles.note}>{problem || "Transfers show as pending first. Nessie usually completes them within a minute."}</p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="receipts-title" aria-live="polite">
        <h2 id="receipts-title" className={styles.cardTitle}>Nessie receipts</h2>
        <p className={styles.cardSub}>Every transfer, straight from Capital One&rsquo;s Nessie ledger.</p>
        {receipts.length === 0 ? (
          <p className={styles.empty}>No transfers yet this session.</p>
        ) : (
          <ul className={styles.receipts}>
            {receipts.map((r) => (
              <li key={r.requestId} className={styles.receipt}>
                <div className={styles.receiptTop}>
                  <strong>{money(r.amount)}</strong>
                  <span className={`${styles.status} ${styles[`st_${r.status}`] ?? ""}`}>
                    {r.status === "sending" ? "Sending" : r.status === "pending" ? "Pending" : r.status === "slow" ? "Still pending" : r.status === "failed" ? "Failed" : r.status[0].toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
                <p className={styles.receiptRoute}>{nameOf(r.fromId)} → {nameOf(r.toId)}</p>
                {r.error && <p className={styles.receiptErr}>{r.error}</p>}
                <dl className={styles.receiptMeta}>
                  {r.id && <div><dt>Transaction</dt><dd><code>{r.id}</code></dd></div>}
                  <div><dt>Sent</dt><dd>{new Date(r.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</dd></div>
                  <div><dt>From</dt><dd>{money(r.before.from)}{r.after ? ` → ${money(r.after.from)}` : ""}</dd></div>
                  <div><dt>To</dt><dd>{money(r.before.to)}{r.after ? ` → ${money(r.after.to)}` : ""}</dd></div>
                </dl>
                {r.status === "pending" && <div className={styles.pendingBar} aria-hidden="true"><span /></div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// The Edit tab: monthly budgets per category, starting from the forecast's typical month.
// Changes feed the same forecast as View and Advising, so all three always agree.
function EditBudgets({ typical, budgets, onChange, cuts, accounts, schedule, asOf, onOpen }: {
  typical: Record<string, number>;
  budgets: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  cuts: Record<string, number>;
  accounts: Account[];
  schedule: ScheduleEvent[];
  asOf: string;
  onOpen: (tab: Tab) => void;
}) {
  const cats = Object.keys(typical).sort((a, b) => typical[b] - typical[a]);
  const edited = Object.keys(budgets).length > 0;
  const m = useMemo(() => monthlyTotals(accounts, schedule, cuts), [accounts, schedule, cuts]);
  const now = useMemo(() => runForecast(accounts, schedule, asOf), [accounts, schedule, asOf]);
  const withBudgets = useMemo(() => (edited ? runForecast(accounts, schedule, asOf, { cuts }) : now), [accounts, schedule, asOf, cuts, edited, now]);
  const checking = (f: Forecast) => (f.firstNegative ? `overdrawn on ${shortDay(f.firstNegative.date)}` : `never overdrawn (lowest ${money(f.lowest.balance, false)})`);
  const set = (k: string, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const next = { ...budgets };
    if (digits !== "" && Number(digits) === Math.round(typical[k])) delete next[k];
    else next[k] = Number(digits || 0);
    onChange(next);
  };
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="edit-title">
      <h2 id="edit-title" className={styles.cardTitle}>Edit monthly budget</h2>
      <p className={styles.cardSub}>
        Starts from your typical month (the average of your last 3). Changes update the forecast everywhere: the health cards on View and every plan on Advising. Saved on this device.
      </p>
      <ul className={styles.editList}>
        {cats.map((k, i) => {
          const meta = categoryMeta(k, i);
          const changed = k in budgets;
          return (
            <li key={k}>
              <span className={styles.catIcon} style={{ background: meta.color }} aria-hidden="true" />
              <label className={styles.editLabel} htmlFor={`b-${k}`}>
                {meta.label}
                {changed && <small className={styles.editWas}>Typical {money(typical[k], false)}</small>}
              </label>
              <input id={`b-${k}`} className={changed ? `${styles.editInput} ${styles.editChanged}` : styles.editInput} inputMode="numeric" value={budgets[k] ?? Math.round(typical[k])} onChange={(e) => set(k, e.target.value)} />
            </li>
          );
        })}
      </ul>
      <div className={`${styles.budgetBox} ${m.shortfall < 0 ? styles.budgetBad : styles.budgetGood}`} aria-live="polite">
        <span>Monthly {m.shortfall < 0 ? "shortfall" : "surplus"}{edited ? " with these budgets" : ""}</span>
        <strong>{m.shortfall < 0 ? "−" : "+"}{money(Math.abs(m.shortfall), false)}</strong>
        <small>
          Income {money(m.income, false)} − spending {money(m.spending, false)} − loans {money(m.loanPayments, false)} − card interest {money(m.cardInterest, false)}. Same math as the shortfall card on View.
        </small>
      </div>
      <p className={styles.editEffect} aria-live="polite">
        PNC checking: {edited ? <>{checking(now)} as things are, <strong>{checking(withBudgets)}</strong> with these budgets.</> : <>{checking(now)} at this pace.</>}
      </p>
      <div className={styles.editActions}>
        <button type="button" className={styles.linkBtn} onClick={() => onOpen("Advising")}>See it on Advising →</button>
        {edited && <button type="button" className={styles.linkBtn} onClick={() => onChange({})}>Reset to your typical month</button>}
      </div>
    </section>
  );
}

