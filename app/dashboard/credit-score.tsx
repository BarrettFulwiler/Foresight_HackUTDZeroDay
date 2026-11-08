"use client";
import { useMemo } from "react";
import { BANDS, estimateCredit } from "../../lib/credit";
import type { Display } from "../../lib/display";
import type { Account, DashboardData } from "../../lib/finance";
import styles from "./dashboard.module.css";

const W = 240;
const CX = W / 2;
const CY = 124;
const R = 100;
const pos = (v: number) => {
  const a = Math.PI * (1 - (v - 300) / 550); // 300 on the left, 850 on the right
  // Rounded so the server and the browser render identical numbers (their Math.cos can differ in the last digits).
  return { x: Math.round((CX + R * Math.cos(a)) * 10) / 10, y: Math.round((CY - R * Math.sin(a)) * 10) / 10 };
};
const arc = (from: number, to: number) => {
  const a = pos(from);
  const b = pos(to);
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} A${R},${R} 0 0 1 ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
};

// Personal dashboard only. An estimate from the accounts (lib/credit.ts), never presented as an official FICO Score.
export default function CreditScore({ accounts, credit, asOf, layout }: { accounts: Account[]; credit: NonNullable<DashboardData["credit"]>; asOf: string; layout: Display["credit"] }) {
  const est = useMemo(() => estimateCredit(accounts, credit, asOf), [accounts, credit, asOf]);
  const band = BANDS.find((b) => b.label === est.band)!;
  const mark = pos(est.score);
  return (
    <section className={styles.panel} aria-labelledby="credit-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="credit-title" className={styles.cardTitle}>Credit score</h2>
          <p className={styles.cardSub}>Estimated from your accounts · not your official FICO&reg; Score</p>
        </div>
      </div>

      <div className={layout === "factors" ? styles.creditGrid : styles.creditSolo}>
        <div className={styles.creditGauge}>
          <svg viewBox={`0 0 ${W} 140`} role="img" aria-label={`Estimated score about ${est.score}, ${est.band}, on a 300 to 850 scale`}>
            {BANDS.map((b) => (
              <path key={b.label} d={arc(b.min + (b.min === 300 ? 0 : 3), b.max - (b.max === 850 ? 0 : 3))} stroke={b.color} className={styles.creditArc} opacity={b.label === est.band ? 1 : 0.28} />
            ))}
            <circle cx={mark.x} cy={mark.y} r={9} className={styles.creditMark} stroke={band.color} />
            <text x={CX} y={CY - 26} textAnchor="middle" className={styles.creditNum}>{est.score}</text>
            <text x={CX} y={CY - 4} textAnchor="middle" className={styles.creditBand} fill={band.color}>{est.band}</text>
            <text x={CX - R} y={CY + 16} textAnchor="middle" className={styles.axisLabel}>300</text>
            <text x={CX + R} y={CY + 16} textAnchor="middle" className={styles.axisLabel}>850</text>
          </svg>
          <p className={styles.creditTip}>{est.tip}</p>
        </div>

        {layout === "factors" && (
          <ul className={styles.creditFactors}>
            {est.factors.map((f) => (
              <li key={f.key}>
                <div className={styles.creditFactorHead}>
                  <strong>{f.label}</strong>
                  <span>{Math.round(f.weight * 100)}% of the score</span>
                </div>
                <span className={styles.creditBar} aria-hidden="true">
                  <span style={{ width: `${Math.round(f.rating * 100)}%` }} className={f.rating >= 0.8 ? styles.creditGood : f.rating >= 0.55 ? styles.creditOk : styles.creditLow} />
                </span>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={styles.chartNote}>
        Uses the factor weights FICO publishes (payment history 35%, amounts owed 30%, length of history 15%, credit mix 10%, new credit 10%) on PNC&rsquo;s sample data. Your real score comes from the credit bureaus.
      </p>
    </section>
  );
}
