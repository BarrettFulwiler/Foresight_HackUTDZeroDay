"use client";
import { useState } from "react";
import type { Account } from "../../lib/finance";
import { money } from "../../lib/format";
import styles from "./account-pies.module.css";

// Two pie charts from the member's own accounts: where their money is, and what they owe.
// Built only from what they entered on the Accounts tab (balances, amounts owed), so they work from day one.
const COLORS = ["#3b5bfd", "#16a34a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#ef4444", "#64748b", "#a16207"];

type Slice = { id: string; label: string; value: number; color: string };

export default function AccountPies({ accounts, business }: { accounts: Account[]; business?: boolean }) {
  const have = accounts.filter((a) => (a.kind === "cash" || a.kind === "investment") && a.balance > 0);
  const owe = accounts.filter((a) => (a.kind === "credit" || a.kind === "loan") && a.balance > 0);
  const slices = (list: Account[]): Slice[] =>
    [...list].sort((a, b) => b.balance - a.balance).map((a, i) => ({ id: a.id, label: a.name, value: a.balance, color: COLORS[i % COLORS.length] }));
  return (
    <div className={styles.row}>
      <Pie title={business ? "Where the company's money is" : "Where your money is"} sub="Checking, savings, CDs and retirement" slices={slices(have)} empty="No money in your accounts yet." />
      <Pie title={business ? "What the company owes" : "What you owe"} sub="Cards, loans and lines of credit" slices={slices(owe)} empty="Nothing owed. Nice." />
    </div>
  );
}

function Pie({ title, sub, slices, empty }: { title: string; sub: string; slices: Slice[]; empty: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const shown = slices.find((s) => s.id === active);
  return (
    <section className={styles.panel} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.sub}>{sub}</p>
      {total <= 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.body}>
          <svg viewBox="0 0 140 140" className={styles.chart} role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${money(s.value, false)}`).join(", ")}`}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="#eef1fa" strokeWidth="22" />
            {slices.map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle
                  key={s.id}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.id ? 26 : 22}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                  onMouseEnter={() => setActive(s.id)}
                  onMouseLeave={() => setActive(null)}
                  style={{ cursor: "pointer", transition: "stroke-width 120ms" }}
                />
              );
              offset += len;
              return el;
            })}
            <text x="70" y="66" textAnchor="middle" className={styles.centerLabel}>{shown ? shown.label.slice(0, 16) : "Total"}</text>
            <text x="70" y="84" textAnchor="middle" className={styles.centerValue}>{money(shown ? shown.value : total, false)}</text>
          </svg>
          <ul className={styles.legend}>
            {slices.map((s) => (
              <li key={s.id} onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)} className={active === s.id ? styles.on : undefined}>
                <span className={styles.dot} style={{ background: s.color }} aria-hidden="true" />
                <span className={styles.name}>{s.label}</span>
                <span className={styles.val}>{money(s.value, false)}</span>
                <span className={styles.pct}>{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
