"use client";
import { useMemo, useState } from "react";
import type { Account, ScheduleEvent } from "../../lib/finance";
import { planFacts, splitNumbers } from "../../lib/explain";
import type { Forecast } from "../../lib/forecast";
import { money, shortMonth } from "../../lib/format";
import { FLOOR, PRESETS, type PresetId, buildPlan, compareRows, shortDay } from "../../lib/plans";
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
  const facts = useMemo(() => planFacts(plan, accounts), [plan, accounts]);

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
          <FutureNote facts={facts} />
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

type NoteState =
  | { status: "loading" }
  | { status: "done"; headline: string; message: string; checked: number; model: string }
  | { status: "error"; error: string };

const modelName = (m: string) => m.replace(/^gemini-/, "Gemini ").replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Gemini writes a note in future-you's voice from the plan's facts; the server checks every number before it's shown.
function FutureNote({ facts }: { facts: string[] }) {
  const key = facts.join("\n");
  const [notes, setNotes] = useState<Record<string, NoteState>>({});
  const note = notes[key];
  const prev = note?.status === "loading" ? undefined : note;

  async function ask(fresh: boolean) {
    setNotes((n) => ({ ...n, [key]: { status: "loading" } }));
    let next: NoteState;
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facts, fresh }) });
      const data = await res.json().catch(() => ({}));
      next = res.ok ? { status: "done", ...data } : { status: "error", error: data.error ?? "Gemini didn't answer. Try again." };
    } catch {
      next = { status: "error", error: "Couldn't reach Foresight's server." };
    }
    setNotes((n) => ({ ...n, [key]: next }));
  }

  return (
    <section className={`${styles.panel} ${styles.voice} ${styles.noteCard}`} aria-labelledby="note-title" aria-busy={note?.status === "loading"}>
      <p id="note-title" className={styles.voiceLabel}>A note from future-you</p>
      {note?.status === "done" ? (
        <div aria-live="polite" className={styles.noteText}>
          <p className={styles.noteHeadline}>{note.headline}</p>
          <p className={styles.noteBody}>
            {splitNumbers(note.message).map((part, i) => (i % 2 ? <mark key={i} className={styles.checkedNum}>{part}</mark> : part))}
          </p>
          <p className={styles.noteCheck}>
            ✓ All {note.checked} {note.checked === 1 ? "number matches" : "numbers match"} the forecast · Written by {modelName(note.model)}
          </p>
        </div>
      ) : (
        <p className={styles.note}>
          {note?.status === "loading"
            ? "Gemini is writing, and Foresight will check every number against the forecast…"
            : "Gemini turns this forecast into a note from future-you. It sees only the calculated facts below, never your name or account numbers, and Foresight checks every number it writes."}
        </p>
      )}
      {prev?.status === "error" && <p className={styles.receiptErr} role="alert">{prev.error}</p>}
      <div className={styles.noteActions}>
        <button type="button" className={styles.noteBtn} onClick={() => ask(note?.status === "done")} disabled={note?.status === "loading"}>
          {note?.status === "loading" ? "Writing…" : note?.status === "done" ? "Write another" : "Explain it with Gemini"}
        </button>
      </div>
      <details className={styles.noteFacts}>
        <summary>What Gemini sees ({facts.length} facts)</summary>
        <ul>
          {facts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </details>
    </section>
  );
}

function Compare({ asIs, withPlan, cardIds }: { asIs: Forecast; withPlan: Forecast; cardIds: string[] }) {
  const rows = compareRows(asIs, withPlan, cardIds);
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
const H = 250;
const PAD = { top: 12, right: 14, bottom: 28, left: 50 };

/** A round step that splits `range` into about 5 bands (500, 1k, 2.5k, 5k…). */
function niceStep(range: number) {
  const raw = Math.max(range, 1) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1.5 ? 1 : n <= 2.25 ? 2 : n <= 3.5 ? 2.5 : n <= 7 ? 5 : 10) * mag;
}
const tickLabel = (v: number) => {
  const abs = Math.abs(v);
  return `${v < 0 ? "-" : ""}$${abs >= 1000 ? `${+(abs / 1000).toFixed(1)}k` : abs}`;
};

function PlanChart({ asIs, withPlan }: { asIs: Forecast; withPlan: Forecast }) {
  const a = asIs.checkingDaily;
  const b = withPlan.checkingDaily;
  const max = Math.max(FLOOR, ...a.map((p) => p.balance), ...b.map((p) => p.balance));
  const min = Math.min(0, ...a.map((p) => p.balance), ...b.map((p) => p.balance));
  // If "as is" plunges far below zero, show only as much below $0 as above it, so the plan line keeps its detail.
  // A note on the chart says how low "as is" goes. The plan line itself is never cut off.
  const planMin = Math.min(0, ...b.map((p) => p.balance));
  const limit = Math.min(-Math.max(max, 1000), planMin * 1.1);
  const clipped = min < limit;
  const step = niceStep(max - (clipped ? limit : min));
  const hi = Math.ceil((max * 1.02) / step) * step;
  const lo = Math.floor((clipped ? limit : min * 1.02) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(Math.round(v));

  const plotRight = W - PAD.right;
  const plotBottom = H - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(1, a.length - 1)) * (plotRight - PAD.left);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (plotBottom - PAD.top);
  const path = (pts: typeof a, end?: { i: number; v: number }) =>
    [
      ...pts.map((p, i) => ({ i, v: p.balance })).filter(({ i }) => i % 2 === 0 || i === pts.length - 1),
      ...(end ? [end] : []),
    ]
      .map(({ i, v }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  // When the scale is cut off, "as is" stops where it first leaves the bottom (with an arrow there),
  // so later paycheck spikes don't poke back in as stray fragments.
  const cut = clipped ? a.findIndex((p) => p.balance < lo) : -1;
  const exit = cut > 0 ? { i: cut - 1 + (a[cut - 1].balance - lo) / (a[cut - 1].balance - a[cut].balance), v: lo } : undefined;
  const asIsPath = exit ? path(a.slice(0, cut), exit) : path(a);
  const months = a.map((p, i) => ({ i, p })).filter(({ p }) => p.date.endsWith("-01"));
  const anchor = (px: number) => (px - PAD.left < 24 ? "start" : plotRight - px < 24 ? "end" : "middle");
  const zero = y(0);
  return (
    <figure className={styles.planChartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.lineChart} role="img" aria-label={`PNC checking over the next 12 months. As is: ${asIs.firstNegative ? `overdrawn from ${shortDay(asIs.firstNegative.date)}, falling to ${money(asIs.lowest.balance, false)}` : "stays positive"}. With the plan: ${withPlan.firstNegative ? `overdrawn from ${shortDay(withPlan.firstNegative.date)}` : `stays positive, lowest ${money(withPlan.lowest.balance, false)}`}.`}>
        <defs>
          <clipPath id="plan-plot">
            <rect x={PAD.left} y={PAD.top - 4} width={plotRight - PAD.left} height={plotBottom - PAD.top + 4} />
          </clipPath>
        </defs>
        <rect x={PAD.left} y={zero} width={plotRight - PAD.left} height={Math.max(0, plotBottom - zero)} className={styles.overdraftZone} />
        {ticks.map((t) => (
          <g key={t}>
            {t !== 0 && <line x1={PAD.left} x2={plotRight} y1={y(t)} y2={y(t)} className={styles.gridLine} />}
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={t === 0 ? styles.axisZero : styles.axisLabel}>{tickLabel(t)}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={plotRight} y1={zero} y2={zero} className={styles.zeroLine} />
        <g clipPath="url(#plan-plot)">
          <path d={asIsPath} className={styles.lineAsIs} />
          <path d={path(b)} className={styles.linePlan} />
        </g>
        {exit && (
          <path
            d={`M${(x(exit.i) - 6).toFixed(1)},${plotBottom - 9} L${(x(exit.i) + 6).toFixed(1)},${plotBottom - 9} L${x(exit.i).toFixed(1)},${plotBottom} Z`}
            className={styles.clipArrow}
          />
        )}
        {clipped && (
          <text x={plotRight - 6} y={(zero + plotBottom) / 2 + 4} textAnchor="end" className={styles.clipNote}>
            ↓ As is keeps falling, to {money(asIs.lowest.balance, false)} by {shortDay(asIs.lowest.date)}
          </text>
        )}
        {months.filter((_, k) => k % 2 === 0).map(({ i, p }) => (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor={anchor(x(i))} className={styles.axisLabel}>{shortMonth(p.date.slice(0, 7))}</text>
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
