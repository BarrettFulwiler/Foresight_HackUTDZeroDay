"use client";
import { useRef } from "react";
import type { Account, AccountKind } from "../../lib/finance";
import { money } from "../../lib/format";
import styles from "./dashboard.module.css";

const GROUPS: { kind: AccountKind; label: string }[] = [
  { kind: "cash", label: "Cash" },
  { kind: "investment", label: "Investments" },
  { kind: "credit", label: "Credit cards" },
  { kind: "loan", label: "Loans" },
];

const CAPTION: Record<AccountKind, string> = {
  cash: "Available balance",
  investment: "Current value",
  credit: "Current balance",
  loan: "Remaining balance",
};

function cardDetail(a: Account) {
  if (a.kind === "credit") return `${a.apr}% APR · min ${money(a.monthlyPayment)}`;
  if (a.kind === "loan") return `${a.apr}% APR · ${money(a.monthlyPayment)}/mo`;
  if (a.yieldPct) return `${a.yieldPct}% yield`;
  return "Everyday spending";
}

export default function MoneySummary({ accounts }: { accounts: Account[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const total = (kind: AccountKind) => accounts.filter((a) => a.kind === kind).reduce((s, a) => s + a.balance, 0);
  const owned = total("cash") + total("investment");
  const owed = total("credit") + total("loan");
  const order: AccountKind[] = ["cash", "investment", "credit", "loan"];
  const sorted = [...accounts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.balance - a.balance);
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <section className={styles.panel} aria-labelledby="summary-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="summary-title" className={styles.cardTitle}>Money summary</h2>
          <p className={styles.cardSub}>{accounts.length} accounts at 2 banks</p>
        </div>
        <div className={styles.railBtns}>
          <button type="button" className={styles.iconBtn} aria-label="Scroll accounts left" onClick={() => scroll(-1)}>‹</button>
          <button type="button" className={styles.iconBtn} aria-label="Scroll accounts right" onClick={() => scroll(1)}>›</button>
        </div>
      </div>

      <div className={styles.summaryChips}>
        <div><span>You have</span><strong className={styles.pos}>{money(owned, false)}</strong></div>
        <div><span>You owe</span><strong className={styles.neg}>{money(owed, false)}</strong></div>
        {GROUPS.map((g) => (
          <div key={g.kind}><span>{g.label}</span><strong>{money(total(g.kind), false)}</strong></div>
        ))}
      </div>

      <div className={styles.rail} ref={rail} tabIndex={0} aria-label="Accounts">
        {sorted.map((a, i) => (
          <article key={a.id} className={`${styles.acct} ${styles[`acct_${a.kind}`]} ${a.bank === "Capital One" ? styles.acctAlt : ""} ${i === 0 ? styles.acctLead : ""}`}>
            <span className={styles.acctWatermark} aria-hidden="true">{a.name}</span>
            <p className={styles.acctCaption}>{CAPTION[a.kind]}</p>
            <p className={styles.acctBalance}>{money(a.balance)}</p>
            <p className={styles.acctMask}>•••• •••• •••• {a.mask}</p>
            <div className={styles.acctFoot}>
              <span>{cardDetail(a)}</span>
              <span className={styles.acctBank}>{a.bank} · {a.name}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
