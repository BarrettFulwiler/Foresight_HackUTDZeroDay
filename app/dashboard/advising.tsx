"use client";
import { useMemo, useState } from "react";
import type { Account, ScheduleEvent } from "../../lib/finance";
import type { Forecast } from "../../lib/forecast";
import { money, shortMonth } from "../../lib/format";
import { FLOOR, PRESETS, type PresetId, buildPlan, shortDay } from "../../lib/plans";
import type { Prefs } from "../../lib/prefs";
import type { Receipt } from "./dashboard";
import styles from "./dashboard.module.css";

type Props = {
  accounts: Account[];
  schedule: ScheduleEvent[];
  asOf: string;
  goal?: Prefs["goal"];
  live: boolean;
  receipts: Receipt[];
  onTransfer: (fromNessieId: string, toNessieId: string, amount: number) => Promise<string>;
  onShowReceipts: () => void;
};

export default function Advising({ accounts, schedule, asOf, goal, live, receipts, onTransfer, onShowReceipts }: Props) {
  const [preset, setPreset] = useState<PresetId>("trip");
  const [applied, setApplied] = useState<Partial<Record<PresetId, string[]>>>({});
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => buildPlan(preset, accounts, schedule, asOf, goal), [preset, accounts, schedule, asOf, goal]);

  const nessie = (id: string) => accounts.find((a) => a.id === id)?.nessieId;
  const name = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.bank} ${a.name}` : id;
  };
  const canApply = live && plan.nowMoves.length > 0 && plan.nowMoves.every((m) => nessie(m.fromId) && nessie(m.toId));
  const myReceipts = (applied[preset] ?? []).map((rid) => receipts.find((r) => r.requestId === rid)).filter((r): r is Receipt => Boolean(r));

  async function apply() {
    if (!canApply || busy) return;
    setBusy(true);
    const ids: string[] = [];
    for (const m of plan.nowMoves) ids.push(await onTransfer(nessie(m.fromId)!, nessie(m.toId)!, m.amount));
    setApplied((a) => ({ ...a, [preset]: [...(a[preset] ?? []), ...ids] }));
    setBusy(false);
  }

  return (
    <div className={styles.advise}>
      <section className={styles.panel} aria-labelledby="ask-title">
        <h2 id="ask-title" className={styles.cardTitle}>Ask future-you</h2>
        <p className={styles.cardSub}>Pick a what-if. Foresight runs your next 12 months both ways, using your real balances at both banks.</p>
        <div className={styles.presets} role="radiogroup" aria-label="What-if">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={preset === p.id ? styles.presetOn : styles.preset} onClick={() => setPreset(p.id)}>
              <span className={styles.presetText}>
                <strong>{p.title}</strong>
                <span>{p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.adviseRow}>
        <div className={styles.voices}>
          <section className={`${styles.panel} ${styles.voice} ${styles.voiceNow}`} aria-label="Now-you wants">
            <p className={styles.voiceLabel}>Now-you wants</p>
            <p className={styles.voiceWant}>{plan.want}</p>
          </section>
          <section className={`${styles.panel} ${styles.voice} ${styles.voiceFuture}`} aria-label="Future-you warns">
            <p className={styles.voiceLabel}>Future-you warns</p>
            <ul className={styles.voiceList}>
              {plan.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </section>
        </div>
        <section className={styles.panel} aria-labelledby="pc-title">
          <h2 id="pc-title" className={styles.cardTitle}>PNC checking, next 12 months</h2>
          <PlanChart asIs={plan.asIs} withPlan={plan.withPlan} />
          <Compare asIs={plan.asIs} withPlan={plan.withPlan} cardIds={accounts.filter((a) => a.kind === "credit").map((a) => a.id)} />
        </section>
      </div>

      <section className={`${styles.panel} ${styles.planCard}`} aria-labelledby="plan-title">
        <h2 id="plan-title" className={styles.cardTitle}>The plan</h2>
        <ol className={styles.planSteps}>
          {plan.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className={styles.planOutcome}>
          <p className={styles.voiceLabel}>With the plan</p>
          <ul className={styles.voiceList}>
            {plan.outcome.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </div>

        <div className={styles.applyRow}>
          {plan.nowMoves.length > 0 ? (
            <>
              <button type="button" className={styles.primaryBtn} disabled={!canApply || busy} onClick={apply}>
                {busy ? "Sending…" : `Apply plan · move ${plan.nowMoves.map((m) => money(m.amount)).join(" + ")} now`}
              </button>
              <p className={styles.note}>
                {live
                  ? `Sends ${plan.nowMoves.map((m) => `${money(m.amount)} from ${name(m.fromId)} to ${name(m.toId)}`).join(", ")} through Capital One's Nessie API. Top-ups and spending cuts are simulated in the forecast.`
                  : "Nessie isn't connected, so the plan can't be applied right now."}
              </p>
            </>
          ) : (
            <p className={styles.note}>Nothing to move right now. The rest of the plan is simulated in the forecast.</p>
          )}
        </div>

        {myReceipts.length > 0 && (
          <ul className={styles.appliedList} aria-live="polite">
            {myReceipts.map((r) => (
              <li key={r.requestId}>
                <span className={`${styles.status} ${styles[`st_${r.status}`] ?? ""}`}>{r.status === "completed" ? "Completed" : r.status === "failed" || r.status === "declined" ? "Failed" : "Pending"}</span>
                {money(r.amount)} {r.after ? `· now ${money(r.after.to)} in the receiving account` : "· usually completes within a minute"}
                {r.error && <span className={styles.receiptErr}> · {r.error}</span>}
              </li>
            ))}
            <li>
              <button type="button" className={styles.linkBtn} onClick={onShowReceipts}>See the Nessie receipts →</button>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}

function Compare({ asIs, withPlan, cardIds }: { asIs: Forecast; withPlan: Forecast; cardIds: string[] }) {
  const end = shortMonth(withPlan.months.at(-1)!.month);
  const owed = (f: Forecast) => cardIds.reduce((sum, id) => sum + Math.max(0, f.months.at(-1)!.balances[id] ?? 0), 0);
  const rows = [
    { label: "First overdraft", a: asIs.firstNegative ? shortDay(asIs.firstNegative.date) : "None", b: withPlan.firstNegative ? shortDay(withPlan.firstNegative.date) : "None" },
    { label: "Lowest checking", a: money(asIs.lowest.balance, false), b: money(withPlan.lowest.balance, false) },
    { label: `Cash and savings, ${end}`, a: money(asIs.months.at(-1)!.liquid, false), b: money(withPlan.months.at(-1)!.liquid, false) },
    { label: `Owed on cards, ${end}`, a: money(owed(asIs), false), b: money(owed(withPlan), false) },
  ];
  return (
    <table className={styles.compare}>
      <thead>
        <tr><th scope="col"><span className={styles.srOnly}>Measure</span></th><th scope="col" className={styles.cAsIs}>As is</th><th scope="col" className={styles.cPlan}>With the plan</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}><th scope="row">{r.label}</th><td>{r.a}</td><td>{r.b}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

const W = 640;
const H = 230;
const PAD = { top: 14, right: 10, bottom: 26, left: 10 };

function PlanChart({ asIs, withPlan }: { asIs: Forecast; withPlan: Forecast }) {
  const a = asIs.checkingDaily;
  const b = withPlan.checkingDaily;
  const vals = [...a, ...b].map((p) => p.balance);
  const min = Math.min(0, ...vals);
  const max = Math.max(FLOOR, ...vals);
  const pad = (max - min) * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => PAD.left + (i / Math.max(1, a.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = (pts: typeof a) =>
    pts
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i % 2 === 0 || i === pts.length - 1)
      .map(({ p, i }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(" ");
  const months = a.map((p, i) => ({ i, p })).filter(({ p }) => p.date.endsWith("-01"));
  const zero = y(0);
  return (
    <figure className={styles.planChartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.lineChart} role="img" aria-label={`PNC checking over the next 12 months. As is: ${asIs.firstNegative ? `overdrawn from ${shortDay(asIs.firstNegative.date)}` : "stays positive"}. With the plan: ${withPlan.firstNegative ? `overdrawn from ${shortDay(withPlan.firstNegative.date)}` : "stays positive"}.`}>
        <rect x={PAD.left} y={zero} width={W - PAD.left - PAD.right} height={Math.max(0, H - PAD.bottom - zero)} className={styles.overdraftZone} />
        <line x1={PAD.left} x2={W - PAD.right} y1={zero} y2={zero} className={styles.zeroLine} />
        <text x={W - PAD.right} y={zero - 5} textAnchor="end" className={styles.axisLabel}>$0</text>
        <path d={path(a)} className={styles.lineAsIs} />
        <path d={path(b)} className={styles.linePlan} />
        {months.filter((_, k) => k % 2 === 0).map(({ i, p }) => (
          <text key={p.date} x={x(i)} y={H - 7} textAnchor="middle" className={styles.axisLabel}>{shortMonth(p.date.slice(0, 7))}</text>
        ))}
      </svg>
      <figcaption className={styles.legendRow}>
        <span><i className={styles.swAsIs} aria-hidden="true" /> As is</span>
        <span><i className={styles.swPlan} aria-hidden="true" /> With the plan</span>
        <span><i className={styles.swZone} aria-hidden="true" /> Overdrawn</span>
      </figcaption>
    </figure>
  );
}
