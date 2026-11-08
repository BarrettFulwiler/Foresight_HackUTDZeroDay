import type { Metadata } from "next";
import { BRAND } from "../../../lib/brand";
import { getRandomCompany, type Company } from "../../../lib/companies";
import { money } from "../../../lib/format";
import base from "../dashboard.module.css";
import styles from "./company.module.css";

export const metadata: Metadata = { title: `Company · ${BRAND}` };
export const dynamic = "force-dynamic"; // a different company is pulled from Nessie on every visit

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const sum = (xs: number[]) => xs.reduce((s, n) => s + n, 0);

export default async function CompanyPage() {
  const result = await getRandomCompany();
  return (
    <main className={base.page}>
      <header className={base.top}>
        <a className={base.brand} href="/"><span className={base.mark} aria-hidden="true" />{BRAND}</a>
        <nav className={styles.mode} aria-label="Account type">
          <a href="/dashboard">Individual</a>
          <a href="/dashboard/company" aria-current="page">Company</a>
        </nav>
      </header>
      <div className={base.body}>
        {"company" in result ? <Overview c={result.company} /> : (
          <section className={base.panel} role="alert">
            <h1 className={base.cardTitle}>Can&rsquo;t load a company</h1>
            <p className={base.cardSub}>{result.error}</p>
          </section>
        )}
      </div>
      <footer className={base.foot}>Synthetic data only · Pulled live from Nessie · Educational prototype · Not financial advice.</footer>
    </main>
  );
}

function Overview({ c }: { c: Company }) {
  const cash = c.accounts.filter((a) => a.type !== "Credit Card");
  const cards = c.accounts.filter((a) => a.type === "Credit Card");
  const cashTotal = sum(cash.map((a) => a.balance));
  const cardOwed = sum(cards.map((a) => a.balance));
  const loanTotal = sum(c.loans.map((l) => l.amount));
  const monthly = sum(c.loans.map((l) => l.monthly));
  const net = cashTotal - cardOwed - loanTotal;
  const inflow = sum(c.txns.filter((t) => t.direction === "in" && t.kind !== "transfer").map((t) => t.amount));
  const outflow = sum(c.txns.filter((t) => t.direction === "out" && t.kind !== "transfer").map((t) => t.amount));

  return (
    <>
      <section className={`${base.panel} ${styles.hero}`}>
        <div>
          <p className={styles.eyebrow}>{c.industry}{c.city ? ` · ${c.city}` : ""}</p>
          <h1 className={styles.name}>{c.name}</h1>
          <p className={base.cardSub}>{c.accounts.length} accounts and {c.loans.length} loans, read live from Nessie · one of {c.pool} companies</p>
        </div>
        <a className={styles.shuffle} href="/dashboard/company">Show another company</a>
      </section>

      <div className={styles.tiles}>
        <Tile label="Cash on hand" value={money(cashTotal, false)} note={`${cash.length} checking and savings accounts`} />
        <Tile label="Total owed" value={money(cardOwed + loanTotal, false)} note={`${money(cardOwed, false)} on cards · ${money(loanTotal, false)} in loans`} tone="neg" />
        <Tile label="Net position" value={money(net, false)} note="Cash minus cards and loans" tone={net >= 0 ? "pos" : "neg"} />
        <Tile label="Loan payments" value={`${money(monthly, false)}/mo`} note={`${c.loans.length} active ${c.loans.length === 1 ? "loan" : "loans"}`} />
      </div>

      <div className={styles.cols}>
        <section className={base.panel}>
          <h2 className={base.cardTitle}>Cash accounts</h2>
          <p className={base.cardSub}>Checking and savings</p>
          <ul className={styles.list}>
            {cash.map((a) => (
              <li key={a.id}>
                <div><strong>{a.nickname}</strong><span>{a.type}{a.pending ? ` · ${money(a.pending, false)} pending` : ""}</span></div>
                <b>{money(a.balance)}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className={base.panel}>
          <h2 className={base.cardTitle}>Cards and loans</h2>
          <p className={base.cardSub}>What the company owes</p>
          <ul className={styles.list}>
            {cards.map((a) => {
              const pct = a.limit ? Math.min(100, Math.round((a.balance / a.limit) * 100)) : 0;
              return (
                <li key={a.id}>
                  <div>
                    <strong>{a.nickname}</strong>
                    <span>Credit card · {pct}% of {money(a.limit ?? 0, false)} limit</span>
                    <i className={styles.bar} aria-hidden="true"><em style={{ width: `${pct}%` }} className={pct > 70 ? styles.hot : undefined} /></i>
                  </div>
                  <b className={styles.neg}>{money(a.balance)}</b>
                </li>
              );
            })}
            {c.loans.map((l) => (
              <li key={l.id}>
                <div><strong>{l.type}</strong><span>{l.status} · {money(l.monthly, false)} a month</span></div>
                <b className={styles.neg}>{money(l.amount, false)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={base.panel}>
        <div className={base.cardHead}>
          <div>
            <h2 className={base.cardTitle}>Recent activity</h2>
            <p className={base.cardSub}>Latest transactions across all accounts · {money(inflow, false)} in, {money(outflow, false)} out</p>
          </div>
        </div>
        {c.txns.length === 0 ? <p className={base.cardSub}>No activity yet.</p> : (
          <ul className={styles.activity}>
            {c.txns.slice(0, 14).map((t) => (
              <li key={t.id}>
                <span className={styles.date}>{when(t.at)}</span>
                <span className={styles.desc}>{t.description}<small>{t.kind}{t.status !== "completed" ? ` · ${t.status}` : ""}</small></span>
                <b className={t.direction === "in" ? styles.pos : styles.neg}>{t.direction === "in" ? "+" : "−"}{money(t.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "pos" | "neg" }) {
  return (
    <section className={`${base.panel} ${styles.tile}`}>
      <p className={styles.tileLabel}>{label}</p>
      <p className={`${styles.tileValue} ${tone ? styles[tone] : ""}`}>{value}</p>
      <p className={base.cardSub}>{note}</p>
    </section>
  );
}
