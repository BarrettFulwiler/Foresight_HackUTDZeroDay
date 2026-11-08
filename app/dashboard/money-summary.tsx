"use client";
import { useRef } from "react";
import type { Account, AccountKind } from "../../lib/finance";
import { money } from "../../lib/format";
import type { Display } from "../../lib/display";
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
  if (a.kind === "credit") {
    if (a.apr) return `${a.apr}% APR · min ${money(a.monthlyPayment)}`;
    return a.limit ? `${Math.round((a.balance / a.limit) * 100)}% of ${money(a.limit, false)} limit` : "Credit card";
  }
  if (a.kind === "loan") return a.apr ? `${a.apr}% APR · ${money(a.monthlyPayment)}/mo` : `${money(a.monthlyPayment, false)} a month`;
  if (a.yieldPct) return `${a.yieldPct}% yield`;
  return a.type === "savings" ? "Savings" : "Everyday spending";
}

const KIND_COLOR: Record<AccountKind, string> = { cash: "#16a34a", investment: "#3b82f6", credit: "#f97316", loan: "#dc2626" };

// What you have next to what you owe, on one scale, with net worth and each account's share of its side.
function HaveOwe({ accounts, owned, owed }: { accounts: Account[]; owned: number; owed: number }) {
  const scale = Math.max(owned, owed) || 1;
  const net = owned - owed;
  const sides = [
    { id: "have", label: "You have", total: owned, tone: styles.pos, list: accounts.filter((a) => a.kind === "cash" || a.kind === "investment") },
    { id: "owe", label: "You owe", total: owed, tone: styles.neg, list: accounts.filter((a) => a.kind === "credit" || a.kind === "loan") },
  ];
  return (
    <div className={styles.haveOwe}>
      <p className={styles.netWorth}>
        <span>Net worth</span>
        <strong className={net < 0 ? styles.neg : styles.pos}>{net < 0 ? "-" : ""}{money(Math.abs(net), false)}</strong>
      </p>
      {sides.map((side) => (
        <div key={side.id} className={styles.hoSide}>
          <div className={styles.hoHead}>
            <span>{side.label}</span>
            <strong className={side.tone}>{money(side.total, false)}</strong>
          </div>
          <div className={styles.hoBar} role="img" aria-label={`${side.label} ${money(side.total, false)}: ${side.list.map((a) => `${a.bank} ${a.name} ${money(a.balance, false)}`).join(", ")}`}>
            {side.list.map((a) => (
              <span key={a.id} style={{ width: `${(a.balance / scale) * 100}%`, background: KIND_COLOR[a.kind] }} title={`${a.bank} ${a.name}: ${money(a.balance)}`} />
            ))}
          </div>
          <ul className={styles.hoList}>
            {side.list.map((a) => (
              <li key={a.id}>
                <i style={{ background: KIND_COLOR[a.kind] }} aria-hidden="true" />
                <span>{a.bank} {a.name}</span>
                <span className={styles.tableMuted}>{side.total ? (a.balance / side.total < 0.005 ? "<1%" : `${((a.balance / side.total) * 100).toFixed(0)}%`) : ""}</span>
                <strong>{money(a.balance, false)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function MoneySummary({ accounts, source, layout = "cards", business = false }: { accounts: Account[]; source: "nessie" | "demo"; layout?: Display["accounts"]; business?: boolean }) {
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
          <p className={styles.cardSub}>
            {business
              ? `${accounts.filter((a) => a.kind !== "loan").length} business accounts and ${accounts.filter((a) => a.kind === "loan").length} loans · live from Nessie`
              : <>{accounts.length} accounts at 2 banks · {source === "nessie" ? `${accounts.filter((a) => a.live).length} with live balances from Nessie` : "Nessie unavailable, showing demo balances"}</>}
          </p>
        </div>
        {layout === "cards" && (
          <div className={styles.railBtns}>
            <button type="button" className={styles.iconBtn} aria-label="Scroll accounts left" onClick={() => scroll(-1)}>‹</button>
            <button type="button" className={styles.iconBtn} aria-label="Scroll accounts right" onClick={() => scroll(1)}>›</button>
          </div>
        )}
      </div>

      <div className={styles.summaryChips}>
        <div><span>You have</span><strong className={styles.pos}>{money(owned, false)}</strong></div>
        <div><span>You owe</span><strong className={styles.neg}>{money(owed, false)}</strong></div>
        {GROUPS.map((g) => (
          <div key={g.kind}><span>{g.label}</span><strong>{money(total(g.kind), false)}</strong></div>
        ))}
      </div>

      {layout === "balance" ? (
        <HaveOwe accounts={sorted} owned={owned} owed={owed} />
      ) : layout === "table" ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Accounts</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Type</th>
                <th scope="col">Details</th>
                <th scope="col" className={styles.num}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <th scope="row">
                    {a.bank} {a.name} <span className={styles.tableMuted}>••{a.mask}</span>
                    {a.live && <span className={styles.tableLive} title="Balance comes live from Nessie">Live</span>}
                  </th>
                  <td>{GROUPS.find((g) => g.kind === a.kind)?.label}</td>
                  <td className={styles.tableMuted}>{cardDetail(a)}{a.pending ? ` · ${money(a.pending)} pending` : ""}</td>
                  <td className={`${styles.num} ${a.kind === "credit" || a.kind === "loan" ? styles.neg : ""}`}>{a.kind === "credit" || a.kind === "loan" ? "-" : ""}{money(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div className={styles.rail} ref={rail} tabIndex={0} aria-label="Accounts">
        {sorted.map((a, i) => (
          <article key={a.id} className={`${styles.acct} ${styles[`acct_${a.kind}`]} ${a.bank === "Capital One" ? styles.acctAlt : ""} ${i === 0 ? styles.acctLead : ""}`}>
            <span className={styles.acctWatermark} aria-hidden="true">{a.name}</span>
            {a.live && <span className={styles.acctLive} title="Balance comes live from Nessie">● Live</span>}
            <p className={styles.acctCaption}>{CAPTION[a.kind]}{a.pending ? ` · ${money(a.pending)} pending` : ""}</p>
            <p className={styles.acctBalance}>{money(a.balance)}</p>
            <p className={styles.acctMask}>•••• •••• •••• {a.mask}</p>
            <div className={styles.acctFoot}>
              <span>{cardDetail(a)}</span>
              <span className={styles.acctBank}>{a.bank} · {a.name}</span>
            </div>
          </article>
        ))}
      </div>
      )}
    </section>
  );
}
