"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, DashboardData, ScheduleEvent } from "../../lib/finance";
import { BRAND } from "../../lib/brand";
import { categoryTotals, monthlyTotals, runForecast, type Forecast } from "../../lib/forecast";
import { categoryMeta, longMonth, money } from "../../lib/format";
import { shortDay } from "../../lib/plans";
import { goalOption, type Prefs, monthsUntil, usePrefs } from "../../lib/prefs";
import { DISPLAY_CARDS, VIEW_CARDS, type Display, type ViewCardId, useDisplay } from "../../lib/display";
import type { CompanyInfo } from "../../lib/company-dashboard";
import { type Summary, summarize } from "../../lib/summary";
import SpendingDonut from "./spending-donut";
import SavingsChart from "./savings-chart";
import MoneySummary from "./money-summary";
import Health from "./health";
import Advising from "./advising";
import CreditScore from "./credit-score";
import styles from "./dashboard.module.css";

const TABS = ["View", "Edit", "Move", "Advising"] as const;
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

// company: set on /dashboard/company. The same dashboard then runs on that company's Nessie data (lib/company-dashboard.ts).
export default function Dashboard({ data, source: initialSource, sourceError, company }: { data: DashboardData; source: Source; sourceError?: string; company?: CompanyInfo }) {
  const [tab, setTab] = useState<Tab>("View");
  const latest = data.months.at(-1)!;
  const { prefs, ready } = usePrefs();
  const { display, set: setDisplay, edited: displayEdited, reset: resetDisplay, hidden, toggleHidden, showAll } = useDisplay(prefs);
  const [welcome, setWelcome] = useState(false);
  // The saved goal belongs to whichever kind of account onboarding set up, so a personal goal never shows on a company.
  const goal = prefs && prefs.goals.length > 0 && (prefs.accountType ?? "individual") === (company ? "company" : "individual") ? prefs.goal : undefined;
  const budgetsKey = company ? "foresight.budgets.company" : BUDGETS_KEY;

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
      const saved = JSON.parse(localStorage.getItem(budgetsKey) ?? "{}");
      if (saved && typeof saved === "object") setBudgets(Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in typical && typeof v === "number" && v >= 0)) as Record<string, number>);
    } catch {}
  }, [typical, budgetsKey]);
  const updateBudgets = (next: Record<string, number>) => {
    setBudgets(next);
    try {
      localStorage.setItem(budgetsKey, JSON.stringify(next));
    } catch {}
  };
  const monthlyBudget = useMemo(() => ({ ...typical, ...budgets }), [typical, budgets]);
  const cuts = useMemo(() => Object.fromEntries(Object.entries(budgets).filter(([k]) => k in typical).map(([k, v]) => [k, typical[k] - v])), [budgets, typical]);

  const refreshAccounts = useCallback(async () => {
    const res = await fetch(company ? `/api/company/accounts?id=${encodeURIComponent(company.id)}` : "/api/nessie/accounts", { cache: "no-store" });
    const body = (await res.json()) as { accounts: Account[]; source: Source };
    setAccounts(body.accounts);
    setSource(body.source);
    return body.accounts;
  }, [company]);

  const balanceOf = (list: Account[], nessieId: string) => list.find((a) => a.nessieId === nessieId)?.balance ?? 0;

  // Sends one Nessie transfer and tracks it as a receipt. Returns the receipt's id.
  async function sendTransfer(fromId: string, toId: string, amount: number): Promise<string> {
    const requestId = crypto.randomUUID();
    const receipt: Receipt = { requestId, fromId, toId, amount, status: "sending", createdAt: Date.now(), before: { from: balanceOf(accounts, fromId), to: balanceOf(accounts, toId) } };
    setReceipts((r) => [receipt, ...r]);
    const update = (patch: Partial<Receipt>) => setReceipts((r) => r.map((x) => (x.requestId === requestId ? { ...x, ...patch } : x)));
    try {
      const res = await fetch("/api/nessie/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId, toId, amount, requestId, companyId: company?.id }) });
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

  const who = company
    ? { title: company.name, sub: `${company.industry} · ${company.city} · live from Nessie`, initial: company.name.slice(0, 1).toUpperCase() }
    : {
        title: `Welcome back${prefs?.name ? `, ${prefs.name}` : ""}`,
        sub: `Synthetic profile ${data.customerId} · as of ${data.asOf}`,
        initial: (prefs?.name || data.customerId).slice(0, 1).toUpperCase(),
      };
  const estimated = "Before this month, history is estimated from the company's recent Nessie activity.";
  // Cards this dashboard has (the credit score is personal only), minus the ones hidden on the Edit tab.
  const viewCards = VIEW_CARDS.filter((c) => !(company && c.personalOnly));
  const shown = (id: ViewCardId) => viewCards.some((c) => c.id === id) && !hidden.includes(id);

  return (
    <main className={styles.page}>
      {/* One slim slate bar: logo, tabs, profile. The active tab gets a thin blue underline. */}
      <header className={styles.navBar}>
        <div className={styles.navInner}>
          <a className={styles.navBrand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
          <nav className={styles.navTabs} role="tablist" aria-label="Dashboard">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} className={tab === t ? styles.navTabOn : styles.navTab} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className={styles.navProfile}>
            <div>
              <p className={styles.navHello}>{who.title}</p>
              <p className={styles.navSub}>{who.sub}</p>
            </div>
            <a className={styles.avatar} href="/onboarding" title="Change your setup" aria-label="Change your setup">{who.initial}</a>
          </div>
        </div>
      </header>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.body}>
        {tab === "View" && (
          <>
            {welcome && prefs && !company && <Welcome prefs={prefs} onClose={() => setWelcome(false)} />}
            {company && (
              <p className={styles.companyStrip}>
                {company.industry} · {company.city} · one of {company.pool} companies in Nessie
                <a href="/dashboard/company">Show another company</a>
              </p>
            )}
            {viewCards.every((c) => hidden.includes(c.id)) && (
              <section className={`${styles.panel} ${styles.allHidden}`}>
                <h2 className={styles.cardTitle}>Every card is hidden</h2>
                <p className={styles.cardSub}>Choose what to show on the Edit tab.</p>
                <button type="button" className={styles.linkBtn} onClick={showAll}>Show all cards</button>
              </section>
            )}
            {(shown("cash") || shown("goal")) && (
              <Highlights goal={goal} ready={ready} sum={sum} display={display} showCash={shown("cash")} showGoal={shown("goal")} where={company ? `across ${accounts.filter((a) => a.kind === "cash").length} business accounts` : "across PNC and Capital One"} />
            )}
            {(shown("spending") || shown("history")) && (
            <div className={shown("spending") && shown("history") ? styles.row : styles.rowSingle}>
              {shown("spending") && <section className={styles.panel}><SpendingDonut months={data.months} txns={data.transactions} windowSize={display.spendingMonths} layout={display.spending} budget={monthlyBudget} custom={Object.keys(budgets)} note={company ? estimated : undefined} business={Boolean(company)} /></section>}
              {shown("history") && <section className={styles.panel}><SavingsChart points={data.savingsHistory} topUps={data.topUps} layout={display.history} scope={company ? "All business checking and savings" : undefined} note={company ? estimated : undefined} /></section>}
            </div>
            )}
            {shown("health") && <Health accounts={accounts} schedule={data.schedule} asOf={data.asOf} units={display.cash} cuts={cuts} business={Boolean(company)} />}
            {shown("budget") && <Budget income={latest.income} spending={latest.spending} loans={latest.loanPayments} month={latest.month} layout={display.budget} />}
            {shown("accounts") && <MoneySummary accounts={accounts} source={source} layout={display.accounts} business={Boolean(company)} />}
            {shown("credit") && data.credit && <CreditScore accounts={accounts} credit={data.credit} asOf={data.asOf} layout={display.credit} />}
          </>
        )}
        {tab === "Move" && <Move accounts={accounts} source={source} sourceError={sourceError} receipts={receipts} onTransfer={sendTransfer} />}
        {tab === "Edit" && (
          <>
            <EditVisibility cards={viewCards} hidden={hidden} onToggle={toggleHidden} onShowAll={showAll} onOpen={setTab} />
            <EditDisplay display={display} onSet={setDisplay} edited={displayEdited} onReset={resetDisplay} onOpen={setTab} hidden={hidden} personal={!company} />
            <EditBudgets typical={typical} budgets={budgets} onChange={updateBudgets} cuts={cuts} accounts={accounts} schedule={data.schedule} asOf={data.asOf} onOpen={setTab} />
          </>
        )}
        {tab === "Advising" && (
          <Advising
            accounts={accounts}
            schedule={data.schedule}
            asOf={data.asOf}
            goal={goal}
            companyId={company?.id}
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

function Highlights({ goal, ready, sum, display, where, showCash, showGoal }: { goal?: Prefs["goal"]; ready: boolean; sum: Summary; display: Display; where: string; showCash: boolean; showGoal: boolean }) {
  const days = display.cash === "days";
  return (
    <div className={showCash && showGoal ? styles.highlights : styles.rowSingle}>
      {showCash && (
      <section className={`${styles.panel} ${styles.cashCard}`} aria-label="Cash">
        <p className={styles.cashLabel}>{days ? "Your cash covers" : "Cash and savings"}</p>
        <p className={styles.cashValue}>{days ? `${sum.runwayDays} days` : money(sum.liquid, false)}</p>
        <p className={styles.cashSub}>
          {days
            ? `of spending at ${money(sum.monthlyOut, false)} a month · ${money(sum.liquid, false)} ${where}`
            : `${where[0].toUpperCase()}${where.slice(1)} · about ${sum.runwayDays} days of spending`}
        </p>
      </section>
      )}
      {!showGoal ? null : goal ? (
        <GoalCard goal={goal} asOf={sum.asOf} style={display.goal} />
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

function GoalCard({ goal, asOf, style }: { goal: Prefs["goal"]; asOf: string; style: Display["goal"] }) {
  const meta = goalOption(goal.kind);
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
      {style === "ring" ? (
        <div className={styles.goalRingRow}>
          <ProgressRing pct={pct} />
          <div>
            <p className={styles.goalNums}><strong>{money(goal.saved, false)}</strong> of {money(goal.target, false)}</p>
            <p className={styles.cardSub}>{goal.by ? `By ${longMonth(goal.by)} · ` : ""}{money(perMonth, false)} a month for {months} month{months === 1 ? "" : "s"} keeps you on track</p>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.goalNums}><strong>{money(goal.saved, false)}</strong> of {money(goal.target, false)}{goal.by ? ` by ${longMonth(goal.by)}` : ""}</p>
          <div className={styles.meter} aria-label={`${pct.toFixed(0)}% funded`}><span style={{ width: `${pct}%` }} /></div>
          <p className={styles.cardSub}>{pct.toFixed(0)}% funded · {money(perMonth, false)} a month for {months} month{months === 1 ? "" : "s"} keeps you on track</p>
        </>
      )}
    </section>
  );
}

// A percent-funded ring for the goal card (the "Ring" option on the Edit tab).
function ProgressRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.ring} role="img" aria-label={`${pct.toFixed(0)}% funded`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={r} className={styles.ringTrack} />
        <circle cx="42" cy="42" r={r} className={styles.ringFill} strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      </svg>
      <span>{pct.toFixed(0)}%</span>
    </div>
  );
}

// Income steps down through spending and loan payments to what's left (red when it goes below zero).
// Plain HTML rather than SVG, so the labels stay a readable size at any width.
function Waterfall({ income, spending, loans }: { income: number; spending: number; loans: number }) {
  const leftover = income - spending - loans;
  // Y axis: round tick steps (1, 2, 2.5 or 5 × a power of ten), about 4 of them, and a range that ends on ticks.
  const rawLo = Math.min(0, leftover);
  const rawHi = Math.max(income, 0);
  const rough = (rawHi - rawLo || 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const tick = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((t) => t >= rough)!;
  const lo = Math.floor(rawLo / tick) * tick;
  const hi = Math.ceil(rawHi / tick) * tick;
  const ticks = Array.from({ length: Math.round((hi - lo) / tick) + 1 }, (_, i) => hi - i * tick);
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * 84; // % from the top, leaving room for value labels
  const axisLabel = (v: number) => (v === 0 ? "$0" : `${v < 0 ? "-" : ""}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(tick < 1000 ? 1 : 0)}k` : Math.abs(v)}`);
  const steps = [
    { label: "Income", from: 0, to: income, value: income },
    { label: "Spending", from: income, to: income - spending, value: -spending },
    { label: "Loan payments", from: income - spending, to: leftover, value: -loans },
    { label: "Leftover", from: 0, to: leftover, value: leftover },
  ];
  return (
    <div
      className={styles.wf}
      role="img"
      aria-label={`Income ${money(income)}, minus spending ${money(spending)}, minus loan payments ${money(loans)}, leaves ${leftover < 0 ? "-" : ""}${money(Math.abs(leftover))}`}
    >
      <div className={styles.wfChart}>
      <div className={styles.wfAxis} aria-hidden="true">
        {ticks.map((t) => <span key={t} style={{ top: `${y(t)}%` }}>{axisLabel(t)}</span>)}
      </div>
      <div className={styles.wfPlot}>
        {ticks.filter((t) => t !== 0).map((t) => <span key={t} className={styles.wfGrid} style={{ top: `${y(t)}%` }} />)}
        <span className={styles.wfZero} style={{ top: `${y(0)}%` }} />
        {steps.map((st, i) => {
          const top = y(Math.max(st.from, st.to));
          const bottom = y(Math.min(st.from, st.to));
          const down = st.value < 0;
          return (
            <div key={st.label} className={styles.wfCol}>
              <span className={down ? styles.wfLoss : styles.wfGain} style={{ top: `${top}%`, height: `max(2px, ${bottom - top}%)` }} />
              <span className={styles.wfValue} style={down ? { top: `calc(${bottom}% + 4px)` } : { bottom: `calc(${100 - top}% + 4px)` }}>
                {down ? "-" : "+"}{money(Math.abs(st.value), false)}
              </span>
              {i < steps.length - 1 && <span className={styles.wfStep} style={{ top: `${y(st.to)}%` }} />}
            </div>
          );
        })}
      </div>
      </div>
      <div className={styles.wfLabels} aria-hidden="true">
        {steps.map((st) => <span key={st.label}>{st.label}</span>)}
      </div>
    </div>
  );
}

function Budget({ income, spending, loans, month, layout }: { income: number; spending: number; loans: number; month: string; layout: Display["budget"] }) {
  const out = spending + loans;
  const leftover = income - out;
  const used = income ? Math.min(100, (out / income) * 100) : 100;
  const share = (v: number) => (income ? `${((v / income) * 100).toFixed(1)}%` : "—");
  return (
    <section className={styles.panel} aria-labelledby="budget-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="budget-title" className={styles.cardTitle}>Budgeting</h2>
          <p className={styles.cardSub}>{longMonth(month)} · what actually happened (the Health row above uses a typical month)</p>
        </div>
      </div>
      {layout === "waterfall" ? (
        <Waterfall income={income} spending={spending} loans={loans} />
      ) : layout === "table" ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Budget for {longMonth(month)}</caption>
            <thead>
              <tr><th scope="col">Item</th><th scope="col" className={styles.num}>Amount</th><th scope="col" className={styles.num}>Share of income</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Income</th><td className={`${styles.num} ${styles.pos}`}>{money(income)}</td><td className={styles.num}>100%</td></tr>
              <tr><th scope="row">Spending</th><td className={`${styles.num} ${styles.neg}`}>-{money(spending)}</td><td className={styles.num}>{share(spending)}</td></tr>
              <tr><th scope="row">Loan payments</th><td className={`${styles.num} ${styles.neg}`}>-{money(loans)}</td><td className={styles.num}>{share(loans)}</td></tr>
            </tbody>
            <tfoot>
              <tr><th scope="row">Leftover</th><td className={`${styles.num} ${leftover < 0 ? styles.neg : styles.pos}`}>{leftover < 0 ? "-" : ""}{money(Math.abs(leftover))}</td><td className={styles.num}>{share(leftover)}</td></tr>
            </tfoot>
          </table>
        </div>
      ) : (
      <>
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
      </>
      )}
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
  const [from, setFrom] = useState(sources.find((a) => a.bank === "Capital One" && a.type === "savings")?.nessieId ?? sources.find((a) => a.type === "savings")?.nessieId ?? sources[0]?.nessieId ?? "");
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

// The Edit tab, part 1: how each View card presents its data (chart or table, and so on).
// The Edit tab, part 0: which cards appear on View at all.
function EditVisibility({ cards, hidden, onToggle, onShowAll, onOpen }: {
  cards: typeof VIEW_CARDS;
  hidden: ViewCardId[];
  onToggle: (id: ViewCardId) => void;
  onShowAll: () => void;
  onOpen: (tab: Tab) => void;
}) {
  const count = cards.filter((c) => !hidden.includes(c.id)).length;
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="vis-title">
      <h2 id="vis-title" className={styles.cardTitle}>Show on View</h2>
      <p className={styles.cardSub}>Turn off any card you don&rsquo;t need. Showing {count} of {cards.length}. Saved on this device.</p>
      <ul className={styles.visList}>
        {cards.map((c) => {
          const on = !hidden.includes(c.id);
          return (
            <li key={c.id}>
              <label className={styles.visRow}>
                <span className={styles.displayName}>
                  <strong>{c.title}</strong>
                  <span>{c.about}</span>
                </span>
                <input type="checkbox" role="switch" className={styles.switch} checked={on} aria-checked={on} onChange={() => onToggle(c.id)} />
              </label>
            </li>
          );
        })}
      </ul>
      <div className={styles.editActions}>
        <button type="button" className={styles.linkBtn} onClick={() => onOpen("View")}>See it on View →</button>
        {hidden.some((id) => cards.some((c) => c.id === id)) && <button type="button" className={styles.linkBtn} onClick={onShowAll}>Show all cards</button>}
      </div>
    </section>
  );
}

function EditDisplay({ display, onSet, edited, onReset, onOpen, hidden, personal }: {
  display: Display;
  onSet: <K extends keyof Display>(key: K, value: Display[K]) => void;
  edited: boolean;
  onReset: () => void;
  onOpen: (tab: Tab) => void;
  hidden: ViewCardId[];
  personal: boolean;
}) {
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="display-title">
      <h2 id="display-title" className={styles.cardTitle}>Display</h2>
      <p className={styles.cardSub}>Choose how each card on View shows your data. Changes apply right away and are saved on this device.</p>
      <ul className={styles.displayList}>
        {DISPLAY_CARDS.filter((card) => personal || !card.personalOnly).map((card) => (
          <li key={card.id} className={hidden.includes(card.id as ViewCardId) ? styles.displayOff : undefined}>
            <div className={styles.displayName}>
              <strong>{card.title}{hidden.includes(card.id as ViewCardId) && <em className={styles.hiddenTag}>Hidden on View</em>}</strong>
              <span>{card.about}</span>
            </div>
            <div className={styles.displayControls}>
              {card.settings.map((s) => (
                <div key={s.key} className={styles.displaySetting}>
                  <span id={`d-${s.key}`}>{s.label}</span>
                  <div className={styles.segmented} role="radiogroup" aria-labelledby={`d-${s.key}`}>
                    {s.options.map((o) => {
                      const on = display[s.key] === o.value;
                      return (
                        <button key={String(o.value)} type="button" role="radio" aria-checked={on} className={on ? styles.segOn : undefined} onClick={() => onSet(s.key, o.value as never)}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.editActions}>
        <button type="button" className={styles.linkBtn} onClick={() => onOpen("View")}>See it on View →</button>
        {edited && <button type="button" className={styles.linkBtn} onClick={onReset}>Reset to defaults</button>}
      </div>
    </section>
  );
}

// The Edit tab, part 2: monthly budgets per category, starting from the forecast's typical month.
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

