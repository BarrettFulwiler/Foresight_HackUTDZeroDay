"use client";
import { useMemo, useState } from "react";
import type { Account, ScheduleEvent } from "../../lib/finance";
import { planFacts, splitNumbers } from "../../lib/explain";
import type { Forecast } from "../../lib/forecast";
import { money, shortMonth } from "../../lib/format";
import { BUSINESS_PRESETS, buildBusinessPlan } from "../../lib/business-plans";
import { FLOOR, PRESETS, type BusinessPresetId, type Plan, type PresetId, buildPlan, compareRows, shortDay } from "../../lib/plans";
import type { Prefs } from "../../lib/prefs";
import { buildCustomPlan, customFacts, type CustomPlan, type WhatIfSpec } from "../../lib/whatif";
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
  cuts: Record<string, number>; // budget changes from the Edit tab
  companyId?: string; // the company dashboard: business what-ifs, and the chat runs on this company's data
};

export default function Advising({ accounts, schedule, asOf, goal, live, receipts, onTransfer, onShowReceipts, cuts, companyId }: Props) {
  const business = Boolean(companyId);
  const presets = business ? BUSINESS_PRESETS : PRESETS;
  const [preset, setPreset] = useState<PresetId | BusinessPresetId>(business ? "slow" : "trip");
  // A typed what-if: the server reads the question (Gemini) and returns the spec; the plan itself is
  // recomputed here from live balances and Edit budgets, so it redraws after Apply like the presets.
  const [customSpec, setCustomSpec] = useState<WhatIfSpec | null>(null);
  const [applied, setApplied] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const presetPlan = useMemo(
    () => (business ? buildBusinessPlan(preset as BusinessPresetId, accounts, schedule, asOf, goal, cuts) : buildPlan(preset as PresetId, accounts, schedule, asOf, goal, cuts)),
    [business, preset, accounts, schedule, asOf, goal, cuts],
  );
  const custom = useMemo(() => (customSpec ? buildCustomPlan(customSpec, accounts, schedule, asOf, cuts) : null), [customSpec, accounts, schedule, asOf, cuts]);
  const plan: Plan | CustomPlan = custom ?? presetPlan;
  const planKey = custom ? `custom:${custom.want}` : preset;
  const facts = useMemo(() => (custom ? customFacts(custom, accounts) : planFacts(presetPlan, accounts)), [custom, presetPlan, accounts]);

  const nessie = (id: string) => accounts.find((a) => a.id === id)?.nessieId;
  const mainChecking = accounts.find((a) => a.id === plan.asIs.checkingId);
  const checkingName = business ? (mainChecking?.name ?? "Checking") : "PNC checking";
  const name = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.bank} ${a.name}` : id;
  };
  const canApply = live && plan.nowMoves.length > 0 && plan.nowMoves.every((m) => nessie(m.fromId) && nessie(m.toId));
  const myReceipts = (applied[planKey] ?? []).map((rid) => receipts.find((r) => r.requestId === rid)).filter((r): r is Receipt => Boolean(r));

  async function apply() {
    if (!canApply || busy) return;
    setBusy(true);
    const ids: string[] = [];
    for (const m of plan.nowMoves) ids.push(await onTransfer(nessie(m.fromId)!, nessie(m.toId)!, m.amount));
    setApplied((a) => ({ ...a, [planKey]: [...(a[planKey] ?? []), ...ids] }));
    setBusy(false);
  }

  function pickPreset(id: PresetId | BusinessPresetId) {
    setCustomSpec(null);
    setPreset(id);
  }

  return (
    <div className={styles.advise}>
      <section className={styles.panel} aria-labelledby="ask-title">
        <h2 id="ask-title" className={styles.cardTitle}>Ask future-you</h2>
        <p className={styles.cardSub}>Pick a what-if. Foresight runs the next 12 months both ways, using {business ? "the company's live Nessie balances" : "your real balances at both banks"}{Object.keys(cuts).length ? " and your budgets from Edit" : ""}.</p>
        <div className={styles.presets} role="radiogroup" aria-label="What-if">
          {presets.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={!custom && preset === p.id} className={!custom && preset === p.id ? styles.presetOn : styles.preset} onClick={() => pickPreset(p.id)}>
              <span className={styles.presetText}>
                <strong>{p.title}</strong>
                <span>{p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        <WhatIfChat onResult={setCustomSpec} activeTitle={custom?.title} cuts={cuts} companyId={companyId} />
      </section>

      <div className={styles.adviseRow}>
        <div className={styles.voices}>
          <section className={`${styles.panel} ${styles.voice} ${styles.voiceNow}`} aria-label="Present-you wants">
            <p className={styles.voiceLabel}>Present-you wants</p>
            <p className={styles.voiceWant}>{plan.want}</p>
          </section>
          <section className={`${styles.panel} ${styles.voice} ${styles.voiceFuture}`} aria-label="Future-you warns">
            <p className={styles.voiceLabel}>Future-you warns</p>
            <ul className={styles.voiceList}>
              {plan.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </section>
          {/* For a typed what-if, future-you's Gemini reply is already in the chat above; the note card is for presets. */}
          {!custom && <FutureNote facts={facts} />}
          {custom && (
            <section className={`${styles.panel} ${styles.voice} ${styles.noteCard}`} aria-label="How future-you read it">
              <p className={styles.voiceLabel}>How future-you read it</p>
              <p className={styles.note}>{custom.interpretation}</p>
              <p className={styles.note}>The chart and plan now show this what-if. Pick a preset above to go back.</p>
            </section>
          )}
        </div>
        <section className={styles.panel} aria-labelledby="pc-title">
          <h2 id="pc-title" className={styles.cardTitle}>{custom ? `${custom.title} · ` : ""}{checkingName}, next 12 months</h2>
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

type ChatMsg = { role: "you" | "future"; text: string; headline?: string; meta?: string };
type WhatIfResponse = {
  spec: WhatIfSpec;
  answer: { headline: string; message: string; checked: number; model: string | null; fallback: boolean };
  parsedBy: "gemini" | "rules";
  source: "nessie" | "demo";
  error?: string;
};

const EXAMPLES = [
  "What if I buy a $2,400 laptop in December?",
  "What if I cut dining by $100 a month?",
  "Can I afford a $3,000 car repair next month?",
  "What if I save $200 a month?",
];
const BUSINESS_EXAMPLES = [
  "What if we buy a $40,000 truck next month?",
  "What if we cut marketing by $2,000 a month?",
  "Can we cover a $25,000 tax bill in April?",
  "What if we save $10,000 a month?",
];

// Free-text what-if chat: type anything, Gemini reads it, the forecast engine runs both futures,
// and future-you replies in the thread. The full result (chart, plan) replaces the preset below.
function WhatIfChat({ onResult, activeTitle, cuts, companyId }: { onResult: (spec: WhatIfSpec) => void; activeTitle?: string; cuts: Record<string, number>; companyId?: string }) {
  const examples = companyId ? BUSINESS_EXAMPLES : EXAMPLES;
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "future", text: companyId ? "Ask me anything about the company. I'll run the next 12 months both ways, as is and with a plan, using its live Nessie balances." : "Ask me anything. I'll run your next 12 months both ways, as is and with a plan, using your real balances at both banks." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "you", text: question }, { role: "future", text: "Running your next 12 months both ways…" }]);
    try {
      const res = await fetch("/api/whatif", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, cuts, companyId }) });
      const data = (await res.json().catch(() => ({}))) as WhatIfResponse;
      if (!res.ok || !data.spec || !data.answer) throw new Error(data.error ?? "Future-you didn't answer. Try again.");
      onResult(data.spec);
      const meta = [
        `Read as: ${data.spec.interpretation}`,
        data.answer.fallback
          ? "Written from the forecast (Gemini's reply wasn't used)"
          : `✓ All ${data.answer.checked} numbers match the forecast · Written by ${data.answer.model ? modelName(data.answer.model) : "Gemini"}${data.parsedBy === "rules" ? " · Question read by the backup parser" : ""}`,
        companyId ? "Balances: live from Nessie, the company's accounts" : data.source === "nessie" ? "Balances: live from Nessie, both banks" : "Balances: Nessie unreachable, using the demo snapshot",
        "Chart and plan below now show this what-if",
      ].join("\n");
      setMessages((m) => [...m.slice(0, -1), { role: "future", text: data.answer.message, headline: data.answer.headline, meta }]);
    } catch (e) {
      setMessages((m) => [...m.slice(0, -1), { role: "future", text: e instanceof Error ? e.message : "Something went wrong. Try again." }]);
    }
    setSending(false);
  }

  return (
    <div className={styles.chatBox}>
      <p className={styles.chatDivider}><span>Or type your own what-if</span></p>
      <div className={styles.chatLog} aria-live="polite" aria-label="What-if chat with future-you">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "you" ? styles.chatRowYou : styles.chatRowFuture}>
            <div className={m.role === "you" ? `${styles.bubble} ${styles.bubbleYou}` : `${styles.bubble} ${styles.bubbleFuture}`}>
              {m.headline && <strong className={styles.chatHeadline}>{m.headline}</strong>}
              <span>{m.text}</span>
              {m.meta && <span className={styles.chatMeta}>{m.meta}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.chatExamples} aria-label="Example what-ifs">
        {examples.map((ex) => (
          <button key={ex} type="button" className={styles.chatChip} disabled={sending} onClick={() => send(ex)}>{ex}</button>
        ))}
      </div>
      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className={styles.srOnly} htmlFor="whatif-input">Type your own what-if</label>
        <input
          id="whatif-input"
          className={styles.chatInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeTitle ? `Showing: ${activeTitle}. Ask another what-if…` : "e.g. What if I take a $2,000 trip in March?"}
          maxLength={300}
          autoComplete="off"
        />
        <button type="submit" className={styles.primaryBtn} disabled={sending || input.trim().length < 3}>
          {sending ? "Running…" : "Ask future-you"}
        </button>
      </form>
      <p className={styles.note}>Gemini reads your question and writes the reply. The numbers in between are never Gemini&rsquo;s: Foresight calculates them from your accounts and checks every number in the reply.</p>
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
