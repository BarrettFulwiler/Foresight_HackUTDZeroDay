// Landing page art: the Advising screen in miniature, computed by the same forecast as the dashboard,
// so the numbers a visitor sees here are the ones they'll see after clicking "Try the demo".
import type { Account } from "../lib/finance";
import type { Forecast } from "../lib/forecast";
import { money, shortMonth } from "../lib/format";
import { FLOOR, type Plan, shortDay } from "../lib/plans";
import styles from "./landing.module.css";

const W = 360;
const H = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 8 };

function MiniChart({ asIs, withPlan }: { asIs: Forecast; withPlan: Forecast }) {
  const a = asIs.checkingDaily;
  const b = withPlan.checkingDaily;
  const all = [...a, ...b].map((p) => p.balance);
  const max = Math.max(FLOOR, ...all);
  const min = Math.min(0, ...all);
  // Show as much below $0 as above it; "as is" stops where it leaves the bottom. The plan line is never cut.
  const limit = Math.min(-max, Math.min(0, ...b.map((p) => p.balance)) * 1.1);
  const lo = Math.max(min * 1.05, limit);
  const hi = max * 1.08;
  const right = W - PAD.right;
  const bottom = H - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(1, a.length - 1)) * (right - PAD.left);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (bottom - PAD.top);
  const sample = (pts: typeof a) => pts.map((p, i) => ({ i, v: p.balance })).filter(({ i }) => i % 3 === 0 || i === pts.length - 1);
  const line = (pts: { i: number; v: number }[]) => pts.map(({ i, v }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const cut = a.findIndex((p) => p.balance < lo);
  const asIsPts =
    cut > 0 ? [...sample(a.slice(0, cut)), { i: cut - 1 + (a[cut - 1].balance - lo) / (a[cut - 1].balance - a[cut].balance), v: lo }] : sample(a);
  const negAt = asIs.firstNegative ? a.indexOf(asIs.firstNegative) : -1;
  const zero = y(0);
  const months = a.map((p, i) => ({ p, i })).filter(({ p }) => p.date.endsWith("-01")).filter((_, k) => k % 3 === 0);
  const anchor = (px: number) => (px - PAD.left < 20 ? "start" : right - px < 20 ? "end" : "middle");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.fChart} aria-hidden="true">
      <rect x={PAD.left} y={zero} width={right - PAD.left} height={Math.max(0, bottom - zero)} className={styles.fZone} />
      <line x1={PAD.left} x2={right} y1={zero} y2={zero} className={styles.fZero} />
      <text x={PAD.left + 2} y={zero + 13} className={styles.fAxisZero}>$0</text>
      <path d={line(asIsPts)} pathLength={1} className={`${styles.fLine} ${styles.fRed}`} />
      <path d={line(sample(b))} pathLength={1} className={`${styles.fLine} ${styles.fBlue}`} />
      {negAt >= 0 && (
        <g className={styles.fPop}>
          <circle cx={x(negAt)} cy={zero} r={4.5} className={styles.fDot} />
          <text x={x(negAt)} y={bottom - 6} textAnchor="middle" className={styles.fDotLabel}>
            {shortDay(asIs.firstNegative!.date)}
          </text>
          <line x1={x(negAt)} x2={x(negAt)} y1={zero + 6} y2={bottom - 18} className={styles.fDotStem} />
        </g>
      )}
      {months.map(({ p, i }) => (
        <text key={p.date} x={x(i)} y={H - 6} textAnchor={anchor(x(i))} className={styles.fAxis}>{shortMonth(p.date.slice(0, 7))}</text>
      ))}
    </svg>
  );
}

export function FuturesCard({ plan, accounts, tripDate }: { plan: Plan; accounts: Account[]; tripDate: string }) {
  const neg = plan.asIs.firstNegative;
  const move = plan.nowMoves[0];
  const name = (id: string) => {
    const acct = accounts.find((x) => x.id === id);
    return acct ? `${acct.bank} ${acct.type === "savings" ? "savings" : acct.type === "checking" ? "checking" : acct.name.toLowerCase()}` : id;
  };
  const safe = plan.withPlan.firstNegative
    ? `With the plan, checking still dips on ${shortDay(plan.withPlan.firstNegative.date)}.`
    : `With the plan, checking never goes negative. Lowest point: ${money(plan.withPlan.lowest.balance, false)}.`;
  return (
    <figure className={styles.futures} aria-label="Example from the demo: a trip that would overdraw checking, and the transfer that fixes it">
      <p className={styles.fLabel}>Present-you wants</p>
      <p className={styles.fWant}>{plan.want}</p>

      <MiniChart asIs={plan.asIs} withPlan={plan.withPlan} />
      <p className={styles.fLegend}>
        <span><i className={styles.fSwRed} aria-hidden="true" /> As is</span>
        <span><i className={styles.fSwBlue} aria-hidden="true" /> With the plan</span>
      </p>

      <div className={`${styles.fWarn} ${styles.fPop}`}>
        <p className={styles.fLabel}>Future-you warns</p>
        <p>
          {neg
            ? `PNC checking is overdrawn on ${shortDay(neg.date)}${neg.date < tripDate ? ", months before the trip" : ""}.`
            : `PNC checking stays positive. Lowest point: ${money(plan.asIs.lowest.balance, false)}.`}
        </p>
      </div>

      {move && (
        <div className={styles.fFix}>
          <div>
            <p className={styles.fLabel}>The fix is at your other bank</p>
            <p>
              Move <strong>{money(move.amount, false)}</strong> from {name(move.fromId)} to {name(move.toId)}.
            </p>
          </div>
          <div className={styles.fAction}>
            <span className={styles.fApply}>Apply plan</span>
            <span className={styles.fDone}>✓ Sent via Nessie</span>
          </div>
        </div>
      )}
      <p className={`${styles.fOutcome} ${styles.fLate}`}>{safe}</p>
    </figure>
  );
}

export function WarnCard({ base, asOf }: { base: Forecast; asOf: string }) {
  const neg = base.firstNegative;
  const days = neg ? Math.round((Date.parse(neg.date) - Date.parse(asOf)) / 86400000) : 0;
  return (
    <figure className={styles.warnCard} aria-label="Example from the demo: the checking safety card">
      <p className={styles.fLabel}><span className={neg ? styles.warnDotBad : styles.warnDotGood} aria-hidden="true" /> PNC checking safety</p>
      <p className={styles.warnValue}>{neg ? `Overdrawn ${shortDay(neg.date)}` : `Lowest ${money(base.lowest.balance, false)}`}</p>
      <p className={styles.warnSub}>
        {neg ? `In ${days} days, if nothing changes. ` : "Stays positive all year. "}
        {base.monthly.shortfall < 0 ? `Bills outrun paychecks by ${money(-base.monthly.shortfall, false)} a month.` : ""}
      </p>
      <p className={styles.warnFoot}>Worked out day by day from live balances at both banks.</p>
    </figure>
  );
}
