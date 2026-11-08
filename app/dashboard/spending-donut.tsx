"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MonthSpend, Txn } from "../../lib/finance";
import { KIND_LABEL, categoryMeta, money, shortDate, shortMonth } from "../../lib/format";
import { LIST_KEY } from "../../lib/prefs";
import styles from "./dashboard.module.css";

const SIZE = 220;
const R = 80;
const STROKE = 30;
const C = 2 * Math.PI * R;

type Cat = ReturnType<typeof categoryMeta> & { key: string; amount: number; share: number };

// windowSize = months per view (1 or 3, from onboarding), like the "Nov '20 - Jan '21" range in the reference.
export default function SpendingDonut({ months, txns, windowSize = 3 }: { months: MonthSpend[]; txns: Txn[]; windowSize?: number }) {
  const WINDOW = windowSize;
  const [end, setEnd] = useState(months.length - 1);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const detailRef = useRef<HTMLDivElement>(null);

  // Remember whether the category list is collapsed (per browser; safe to fail).
  useEffect(() => {
    try {
      if (localStorage.getItem(LIST_KEY) === "0") setListOpen(false);
    } catch {}
  }, []);
  const toggleList = () => {
    setListOpen((open) => {
      try {
        localStorage.setItem(LIST_KEY, open ? "0" : "1");
      } catch {}
      return !open;
    });
  };

  const view = useMemo(() => {
    const start = Math.max(0, end - WINDOW + 1);
    const slice = months.slice(start, end + 1);
    const prev = months.slice(Math.max(0, start - WINDOW), start);
    const totals: Record<string, number> = {};
    let income = 0;
    let spending = 0;
    for (const m of slice) {
      income += m.income;
      spending += m.spending;
      for (const [k, v] of Object.entries(m.byCategory)) totals[k] = (totals[k] ?? 0) + v;
    }
    const cats: Cat[] = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount], i) => ({ key, amount, share: spending ? amount / spending : 0, ...categoryMeta(key, i) }));
    return { slice, prev, first: slice[0]?.month ?? "", last: slice.at(-1)?.month ?? "", income, spending, cats };
  }, [months, end, WINDOW]);

  const shown = hover ?? selected;
  const shownCat = view.cats.find((c) => c.key === shown);
  const selectedCat = view.cats.find((c) => c.key === selected);

  function choose(key: string) {
    const next = selected === key ? null : key;
    setSelected(next);
    if (next) {
      const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
    }
  }
  const onKey = (key: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(key);
    }
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  let offset = 0;
  const gap = view.cats.length > 1 ? 2 : 0;

  return (
    <div className={styles.donutCard}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Spending</h2>
        <div className={styles.period}>
          <button type="button" className={styles.iconBtn} aria-label="Earlier months" disabled={end - WINDOW < 0} onClick={() => setEnd((e) => Math.max(WINDOW - 1, e - WINDOW))}>‹</button>
          <span>{view.first === view.last ? shortMonth(view.first) : `${shortMonth(view.first)} – ${shortMonth(view.last)}`}</span>
          <button type="button" className={styles.iconBtn} aria-label="Later months" disabled={end >= months.length - 1} onClick={() => setEnd((e) => Math.min(months.length - 1, e + WINDOW))}>›</button>
        </div>
      </div>

      <dl className={styles.totals}>
        <div><dt>Expense</dt><dd className={styles.neg}>{money(view.spending)}</dd></div>
        <div><dt>Income</dt><dd className={styles.pos}>{money(view.income)}</dd></div>
        <div><dt title="Income minus spending, before loan payments">Before loans</dt><dd className={view.income - view.spending >= 0 ? styles.pos : styles.neg}>{money(view.income - view.spending)}</dd></div>
      </dl>

      <div className={styles.donutRow}>
        <div className={styles.donutWrap}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.donut} role="group" aria-label="Spending by category. Select a slice for details.">
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {view.cats.map((c) => {
                const len = Math.max(0, c.share * C - gap);
                const lit = shown === c.key;
                const el = (
                  <circle
                    key={c.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={lit ? STROKE + 8 : STROKE}
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-offset}
                    opacity={shown && !lit ? 0.35 : 1}
                    className={styles.segment}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected === c.key}
                    aria-label={`${c.label}: ${money(c.amount)}, ${(c.share * 100).toFixed(1)}%. Show details.`}
                    onMouseEnter={() => setHover(c.key)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.key)}
                    onBlur={() => setHover(null)}
                    onClick={() => choose(c.key)}
                    onKeyDown={onKey(c.key)}
                  />
                );
                offset += c.share * C;
                return el;
              })}
            </g>
          </svg>
          <div className={styles.donutCenter} aria-hidden="true">
            {shownCat ? (
              <>
                <span className={styles.centerLabel}>{shownCat.label}</span>
                <strong>{(shownCat.share * 100).toFixed(1)}%</strong>
                <span className={styles.centerHint}>{selected === shownCat.key ? "Selected" : "Click for details"}</span>
              </>
            ) : (
              <>
                <span className={styles.centerLabel}>Expenses</span>
                <strong>{money(view.spending, false)}</strong>
                <span className={styles.centerHint}>Click a slice</span>
              </>
            )}
          </div>
        </div>
        <ul className={styles.legend}>
          {view.cats.map((c) => (
            <li key={c.key}>
              <button type="button" className={`${styles.legendBtn} ${selected === c.key ? styles.legendOn : ""}`} aria-pressed={selected === c.key} onClick={() => choose(c.key)} onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}>
                <i style={{ background: c.color }} aria-hidden="true" />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div ref={detailRef} className={`${styles.reveal} ${selectedCat ? styles.revealOpen : ""}`} aria-live="polite">
        <div className={styles.revealInner}>
          {selectedCat && <CategoryDetail cat={selectedCat} view={view} txns={txns} onClose={() => setSelected(null)} />}
        </div>
      </div>

      <div className={styles.listHead}>
        <span>Categories <em>{view.cats.length}</em></span>
        <button type="button" className={styles.collapseBtn} aria-expanded={listOpen} aria-controls="category-list" onClick={toggleList}>
          {listOpen ? "Minimize" : "Show"}
          <span className={`${styles.chev} ${listOpen ? styles.chevUp : ""}`} aria-hidden="true">⌄</span>
        </button>
      </div>
      <div id="category-list" className={`${styles.reveal} ${listOpen ? styles.revealOpen : ""}`}>
        <div className={styles.revealInner}>
          <ul className={styles.catRows}>
            {view.cats.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={`${styles.catRow} ${shown === c.key ? styles.catActive : ""}`}
                  aria-pressed={selected === c.key}
                  onClick={() => choose(c.key)}
                  onMouseEnter={() => setHover(c.key)}
                  onMouseLeave={() => setHover(null)}
                  tabIndex={listOpen ? 0 : -1}
                >
                  <span className={styles.catIcon} style={{ background: c.color }} aria-hidden="true" />
                  <span className={styles.catBody}>
                    <span className={styles.catLine}>
                      <span>{c.label}</span>
                      <span className={styles.neg}>-{money(c.amount)}</span>
                    </span>
                    <span className={styles.bar}><span style={{ width: `${(c.amount / (view.cats[0]?.amount || 1)) * 100}%` }} /></span>
                  </span>
                  <span className={styles.catPct}>{(c.share * 100).toFixed(2)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type View = { slice: MonthSpend[]; prev: MonthSpend[]; first: string; last: string; income: number; spending: number };

function CategoryDetail({ cat, view, txns, onClose }: { cat: Cat; view: View; txns: Txn[]; onClose: () => void }) {
  const d = useMemo(() => {
    const inWindow = txns.filter((t) => t.category === cat.key && t.month >= view.first && t.month <= view.last);
    const perMonth = view.slice.map((m) => ({ month: m.month, amount: m.byCategory[cat.key] ?? 0 }));
    const peak = Math.max(...perMonth.map((p) => p.amount), 1);
    const prevTotal = view.prev.reduce((s, m) => s + (m.byCategory[cat.key] ?? 0), 0);
    const change = prevTotal ? (cat.amount - prevTotal) / prevTotal : null;
    const biggest = inWindow.reduce<Txn | null>((b, t) => (!b || t.amount > b.amount ? t : b), null);
    const sources = new Map<string, { kind: string; account: string; count: number; total: number }>();
    for (const t of inWindow) {
      const k = `${t.kind}|${t.account}`;
      const s = sources.get(k) ?? { kind: t.kind, account: t.account, count: 0, total: 0 };
      s.count += 1;
      s.total += t.amount;
      sources.set(k, s);
    }
    const monthsCount = Math.max(1, view.slice.length);
    return {
      inWindow: [...inWindow].reverse(),
      perMonth,
      peak,
      prevTotal,
      change,
      biggest,
      sources: [...sources.values()].sort((a, b) => b.total - a.total),
      perMonthAvg: cat.amount / monthsCount,
      incomeShare: view.income ? cat.amount / view.income : 0,
    };
  }, [cat, view, txns]);

  return (
    <article className={styles.detail} style={{ ["--cat" as string]: cat.color }} aria-label={`${cat.label} details`}>
      <header className={styles.detailHead}>
        <span className={styles.catIcon} style={{ background: cat.color }} aria-hidden="true" />
        <div className={styles.detailTitle}>
          <h3>{cat.label}</h3>
          <p>{view.first === view.last ? shortMonth(view.first) : `${shortMonth(view.first)} – ${shortMonth(view.last)}`} · {(cat.share * 100).toFixed(1)}% of your spending</p>
        </div>
        <strong className={styles.neg}>-{money(cat.amount)}</strong>
        <button type="button" className={styles.iconBtn} aria-label={`Close ${cat.label} details`} onClick={onClose}>×</button>
      </header>

      <section>
        <h4 className={styles.detailH}>What it is</h4>
        <p className={styles.detailText}>{cat.about}</p>
        <ul className={styles.sourceList}>
          {d.sources.map((s) => (
            <li key={`${s.kind}${s.account}`}>
              <span>{s.count} {KIND_LABEL[s.kind]?.toLowerCase() ?? s.kind}{s.count === 1 ? "" : "s"}</span>
              <span className={styles.sourceAcct}>{s.account}</span>
              <strong>{money(s.total)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className={styles.detailH}>What led to it</h4>
        <div className={styles.miniBars} role="img" aria-label={d.perMonth.map((p) => `${shortMonth(p.month)} ${money(p.amount)}`).join(", ")}>
          {d.perMonth.map((p) => (
            <div key={p.month} className={styles.miniBar}>
              <span className={styles.miniVal}>{money(p.amount, false)}</span>
              <span className={styles.miniTrack}><span style={{ height: `${(p.amount / d.peak) * 100}%` }} /></span>
              <span className={styles.miniLabel}>{shortMonth(p.month)}</span>
            </div>
          ))}
        </div>
        <ul className={styles.drivers}>
          <li>About <strong>{money(d.perMonthAvg, false)}</strong> a month, across {d.inWindow.length} charge{d.inWindow.length === 1 ? "" : "s"}.</li>
          {d.change !== null && (
            <li>
              <strong className={d.change > 0 ? styles.neg : styles.pos}>{d.change > 0 ? "Up" : "Down"} {Math.abs(d.change * 100).toFixed(1)}%</strong> from the {view.prev.length === 1 ? "month" : `${view.prev.length} months`} before ({money(d.prevTotal, false)}).
            </li>
          )}
          <li>Takes <strong>{(d.incomeShare * 100).toFixed(1)}%</strong> of your income in this period.</li>
          {d.biggest && <li>Biggest charge: <strong>{money(d.biggest.amount)}</strong> on {shortDate(d.biggest.date)} ({KIND_LABEL[d.biggest.kind]?.toLowerCase() ?? d.biggest.kind}).</li>}
          <li>Trimming it by 10% would free up about <strong className={styles.pos}>{money(d.perMonthAvg * 0.1, false)} a month</strong>.</li>
        </ul>
      </section>

      <section>
        <h4 className={styles.detailH}>Every charge</h4>
        <ul className={styles.txnList}>
          {d.inWindow.map((t) => (
            <li key={t.id}>
              <span className={styles.txnDate}>{shortDate(t.date)}</span>
              <span className={styles.txnBody}>
                <span>{KIND_LABEL[t.kind] ?? t.kind}</span>
                <small>{t.account}</small>
              </span>
              <span className={styles.neg}>-{money(t.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
