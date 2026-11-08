// Landing page art: the Advising screen in miniature, computed by the same forecast as the demo, so the
// numbers a visitor sees here are the ones they'll see after clicking "Try the demo". Labeled as a demo
// preview: nothing here moves money; in the app the user reviews and approves each transfer.
import type { Forecast } from "../lib/forecast";
import { money, shortMonth } from "../lib/format";
import { FLOOR, type Plan, shortDay } from "../lib/plans";
import type { CustomPlan } from "../lib/whatif";
import styles from "./landing.module.css";

const W = 360;
const H = 160;
const PAD = { top: 16, right: 8, bottom: 22, left: 8 };
const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86400000).toISOString().slice(0, 10);

function MiniChart({ asIs, withPlan, markDate, markLabel, planOnly = false }: { asIs: Forecast; withPlan: Forecast; markDate?: string; markLabel?: string; planOnly?: boolean }) {
  const a = asIs.checkingDaily;
  const b = withPlan.checkingDaily;
  const all = (planOnly ? b : [...a, ...b]).map((p) => p.balance);
  const max = Math.max(FLOOR, ...all);
  const min = Math.min(0, ...all);
  // Show as much below $0 as above it; "as is" stops where it leaves the bottom. The plan line is never cut.
  // planOnly (the hero) shows just the plan's future, with $0 as a quiet baseline.
  const limit = Math.min(-max, Math.min(0, ...b.map((p) => p.balance)) * 1.1);
  const lo = planOnly ? min - max * 0.12 : Math.max(min * 1.05, limit);
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
  const negAt = !planOnly && asIs.firstNegative ? a.indexOf(asIs.firstNegative) : -1;
  const markAt = markDate ? a.findIndex((p) => p.date === markDate) : -1;
  const zero = y(0);
  const topTick = Math.floor(max / 1000) * 1000;
  const months = a.map((p, i) => ({ p, i })).filter(({ p }) => p.date.endsWith("-01")).filter((_, k) => k % 3 === 0);
  const anchor = (px: number) => (px - PAD.left < 20 ? "start" : right - px < 20 ? "end" : "middle");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.fChart} aria-hidden="true">
      {!planOnly && <rect x={PAD.left} y={zero} width={right - PAD.left} height={Math.max(0, bottom - zero)} className={styles.fZone} />}
      {topTick > 0 && (
        <>
          <line x1={PAD.left} x2={right} y1={y(topTick)} y2={y(topTick)} className={styles.fGrid} />
          <text x={PAD.left + 2} y={y(topTick) - 4} className={styles.fAxis}>{money(topTick, false)}</text>
        </>
      )}
      <line x1={PAD.left} x2={right} y1={zero} y2={zero} className={planOnly ? styles.fZeroCalm : styles.fZero} />
      <text x={PAD.left + 2} y={planOnly ? zero - 4 : zero + 13} className={planOnly ? styles.fAxis : styles.fAxisZero}>$0</text>
      {markAt >= 0 && (
        <g>
          <line x1={x(markAt)} x2={x(markAt)} y1={PAD.top - 6} y2={bottom} className={styles.fMark} />
          <text x={x(markAt)} y={PAD.top - 8} textAnchor="middle" className={styles.fMarkLabel}>{markLabel}</text>
        </g>
      )}
      {!planOnly && <path d={line(asIsPts)} pathLength={1} className={`${styles.fLine} ${styles.fRed}`} />}
      <path d={line(sample(b))} pathLength={1} className={`${styles.fLine} ${planOnly ? styles.fBlueFirst : styles.fBlue}`} />
      {negAt >= 0 && (
        <g className={styles.fPop}>
          <circle cx={x(negAt)} cy={zero} r={4.5} className={styles.fDot} />
          <line x1={x(negAt)} x2={x(negAt)} y1={zero + 6} y2={bottom - 18} className={styles.fDotStem} />
          <text x={x(negAt)} y={bottom - 6} textAnchor="middle" className={styles.fDotLabel}>{shortDay(asIs.firstNegative!.date)}</text>
        </g>
      )}
      {months.map(({ p, i }) => (
        <text key={p.date} x={x(i)} y={H - 6} textAnchor={anchor(x(i))} className={styles.fAxis}>{shortMonth(p.date.slice(0, 7))}</text>
      ))}
    </svg>
  );
}

function Legend() {
  return (
    <p className={styles.fLegend}>
      <span><i className={styles.fSwRed} aria-hidden="true" /> As is</span>
      <span><i className={styles.fSwBlue} aria-hidden="true" /> With the plan</span>
    </p>
  );
}

const outcomeLine = (f: Forecast) =>
  f.firstNegative
    ? `Even with the plan, checking dips on ${shortDay(f.firstNegative.date)}.`
    : `With the full plan, checking stays above $0 for the whole 12-month forecast. Lowest point: ${money(f.lowest.balance, false)}.`;

/** Hero: the trip what-if from the demo, led by the good outcome, with every part of the plan that produces it.
 *  (The "as is" future, with its overdraft, is shown further down the page and in the demo itself.) */
export function FuturesCard({ plan, tripDate, tripTarget }: { plan: Plan; tripDate: string; tripTarget: number }) {
  const ok = !plan.withPlan.firstNegative;
  const bridge = plan.nowMoves[0];
  return (
    <figure className={styles.futures} aria-label="Demo preview: a trip, and the plan that makes it work">
      <div className={styles.fTop}>
        <span className={styles.fBadge}>Demo preview</span>
        <span className={styles.fTopNote}>Sample customer · live Nessie demo balances</span>
      </div>

      <div>
        <p className={styles.fLabel}>Present-you wants</p>
        <p className={styles.fWant}>{plan.want}</p>
      </div>

      <div className={styles.fGood}>
        <p className={styles.fLabel}>Future-you says</p>
        <p className={styles.fBigGood}>{ok ? "You can take the trip." : "The trip is within reach."}</p>
        <p>
          {ok
            ? `With the plan, PNC checking stays above $0 for all 12 months. Lowest point: ${money(plan.withPlan.lowest.balance, false)}.`
            : `With the plan, checking still dips on ${shortDay(plan.withPlan.firstNegative!.date)}, so the plan needs one more step.`}
        </p>
      </div>

      <div>
        <p className={styles.fChartTitle}>Projected PNC checking balance, with the plan</p>
        <MiniChart asIs={plan.asIs} withPlan={plan.withPlan} markDate={tripDate} markLabel="Trip" planOnly />
      </div>

      <div className={`${styles.fFix} ${styles.fPop}`}>
        <p className={styles.fLabel}>How you get there</p>
        <ul className={styles.fPlan}>
          {bridge && (
            <li>
              Move <strong>{money(bridge.amount, false)}</strong> from Capital One savings to PNC checking now
            </li>
          )}
          <li>Trim dining and shopping by $150 a month</li>
          <li>Pay the {money(tripTarget, false)} trip from PNC savings on {shortDay(dayBefore(tripDate))}</li>
          <li>Automatic top-ups from PNC savings if checking would drop below {money(FLOOR, false)}</li>
        </ul>
        <p className={styles.fApprove}>You review and approve each transfer. Apply sends it through Capital One&rsquo;s Nessie API.</p>
      </div>
    </figure>
  );
}

/** "Ask your own what-if" section: a typed question run through the same engine as the in-app chat. */
export function AskCard({ question, plan }: { question: string; plan: CustomPlan }) {
  const neg = plan.asIs.firstNegative;
  return (
    <figure className={styles.askCard} aria-label="Demo preview: a typed what-if and the calculated answer">
      <div className={styles.fTop}>
        <span className={styles.fBadge}>Demo preview</span>
        <span className={styles.fTopNote}>Calculated by the forecast</span>
      </div>
      <p className={styles.askQ}>{question}</p>
      <div className={styles.askA}>
        <p>
          <strong>As is:</strong>{" "}
          {neg ? `PNC checking is projected to be overdrawn on ${shortDay(neg.date)} (${money(neg.balance)}).` : "PNC checking stays positive."}
        </p>
        <MiniChart asIs={plan.asIs} withPlan={plan.withPlan} />
        <Legend />
        <p><strong>The plan:</strong></p>
        <ol className={styles.askSteps}>
          {plan.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className={styles.fOutcomeStatic}>{outcomeLine(plan.withPlan)}</p>
      </div>
      <p className={styles.askNote}>
        In the app, Gemini reads the question and writes this answer in future-you&rsquo;s voice. Every number in the reply must match one the forecast calculated.
      </p>
    </figure>
  );
}
