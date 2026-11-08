"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "../../lib/finance";
import { longMonth, money, shortMonth } from "../../lib/format";
import type { Display } from "../../lib/display";
import styles from "./dashboard.module.css";

const RANGES = { "6M": 6, "1Y": 12, "2Y": 24 } as const;
type Range = keyof typeof RANGES;
const W = 640;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

const REVEAL_MS = 16;

// Gemini marks the few important phrases with [g] [gb] [r] [rb] (green, green bold, red, red bold).
type Seg = { text: string; tone?: "g" | "gb" | "r" | "rb" };
const TONE_CLASS = { g: styles.gemG, gb: `${styles.gemG} ${styles.gemB}`, r: styles.gemR, rb: `${styles.gemR} ${styles.gemB}` };
function parseTone(raw: string): Seg[] {
  const segs: Seg[] = [];
  const strip = (t: string) => t.replace(/\[\/?(?:gb|rb|g|r)\]/g, "");
  let last = 0;
  for (const m of raw.matchAll(/\[(gb|rb|g|r)\]([\s\S]*?)\[\/\1\]/g)) {
    if (m.index > last) segs.push({ text: strip(raw.slice(last, m.index)) });
    segs.push({ text: strip(m[2]), tone: m[1] as Seg["tone"] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) segs.push({ text: strip(raw.slice(last)) });
  return segs;
}

// The first `n` visible characters of the segments, keeping each one's color and weight.
function revealed(segs: Seg[], n: number) {
  const out: React.ReactNode[] = [];
  for (const [i, g] of segs.entries()) {
    if (n <= 0) break;
    const t = g.text.slice(0, n);
    n -= t.length;
    out.push(g.tone ? <span key={i} className={TONE_CLASS[g.tone]}>{t}</span> : t);
  }
  return out;
}

function GeminiMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="geminiGrad" x1="4" y1="24" x2="24" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.55" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path fill="url(#geminiGrad)" d="M14 0c.5 7.6 6.4 13.5 14 14-7.6.5-13.5 6.4-14 14C13.5 20.4 7.6 14.5 0 14 7.6 13.5 13.5 7.6 14 0Z" />
    </svg>
  );
}

type Reply = { status: "idle" } | { status: "loading" } | { status: "error"; error: string } | { status: "done"; text: string; checked: number; model: string };

// Ask Gemini about the chart. The server only sends it the chart's facts and checks every number it writes.
// The reply types out, and the card grows taller as it does.
function GeminiFeedback({ facts }: { facts: string[] }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<Reply>({ status: "idle" });
  const [shown, setShown] = useState(0);
  const segs = useMemo(() => (reply.status === "done" ? parseTone(reply.text) : []), [reply]);
  const text = segs.map((g) => g.text).join("");

  useEffect(() => {
    if (!text) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(text.length); return; }
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(id), n) : n + 2)), REVEAL_MS);
    return () => clearInterval(id);
  }, [text]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (reply.status === "loading") return;
    setReply({ status: "loading" });
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, facts }) });
      const data = await res.json().catch(() => ({}));
      setReply(res.ok ? { status: "done", ...data } : { status: "error", error: data.error ?? "Gemini didn't answer. Try again." });
    } catch {
      setReply({ status: "error", error: "Couldn't reach Foresight's server." });
    }
  }

  const typing = reply.status === "done" && shown < text.length;
  return (
    <div className={styles.gemBox}>
      <form className={styles.gemForm} onSubmit={ask}>
        <input
          className={styles.gemInput}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Gemini for feedback"
          aria-label="Ask Gemini for feedback on this chart"
          maxLength={300}
        />
        <button type="submit" className={styles.gemBtn} disabled={reply.status === "loading"} aria-label="Ask Gemini">
          <GeminiMark />
        </button>
      </form>
      {reply.status === "loading" && <p className={styles.gemStatus} role="status">Gemini is reading your chart…</p>}
      {reply.status === "error" && <p className={styles.gemError} role="alert">{reply.error}</p>}
      {reply.status === "done" && (
        <div className={styles.gemReply} aria-live="polite" aria-busy={typing}>
          <p className={styles.gemText}>{revealed(segs, shown)}{typing && <span className={styles.gemCaret} aria-hidden="true" />}</p>
          {!typing && <p className={styles.gemMeta}>✓ All {reply.checked} {reply.checked === 1 ? "number matches" : "numbers match"} the chart · Written by Gemini</p>}
        </div>
      )}
    </div>
  );
}

// Each month's gain or loss as a green or red bar around a zero line. Hovering a bar shows that month above.
function ChangeBars({ pts, hover, onHover }: { pts: Point[]; hover: number | null; onHover: (i: number | null) => void }) {
  const bars = pts.slice(1).map((p, i) => ({ i: i + 1, month: p.month, d: p.value - pts[i].value }));
  const lo = Math.min(0, ...bars.map((b) => b.d));
  const hi = Math.max(0, ...bars.map((b) => b.d));
  const span = hi - lo || 1;
  const top = PAD.top + 10;
  const bottom = H - PAD.bottom - 10;
  const y = (v: number) => top + ((hi - v) / span) * (bottom - top);
  const band = (W - PAD.left - PAD.right) / Math.max(1, bars.length);
  const labelEvery = Math.ceil(bars.length / 6);
  const gains = bars.filter((b) => b.d >= 0).length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={styles.lineChart}
      role="img"
      aria-label={`Monthly change in balance: ${gains} months up, ${bars.length - gains} down`}
      onPointerLeave={() => onHover(null)}
    >
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className={styles.zeroLine} />
      {bars.map((b, k) => {
        const x = PAD.left + k * band + band * 0.18;
        const y0 = y(Math.max(0, b.d));
        const h = Math.max(1.5, Math.abs(y(b.d) - y(0)));
        const lit = hover === b.i;
        return (
          <g key={b.month} onPointerEnter={() => onHover(b.i)}>
            <rect x={PAD.left + k * band} y={top} width={band} height={bottom - top} fill="transparent" />
            <rect x={x} y={y0} width={band * 0.64} height={h} rx={3} className={b.d >= 0 ? styles.gainBar : styles.lossBar} opacity={hover !== null && !lit ? 0.4 : 1}>
              <title>{`${shortMonth(b.month)}: ${b.d >= 0 ? "+" : "-"}${money(Math.abs(b.d))}`}</title>
            </rect>
            {(k % labelEvery === 0 || k === bars.length - 1) && (bars.length - 1 - k >= labelEvery || k === bars.length - 1) && (
              <text x={x + band * 0.32} y={H - 8} textAnchor="middle" className={styles.axisLabel}>{shortMonth(b.month)}</text>
            )}
          </g>
        );
      })}
      {hover !== null && hover > 0 && (
        <text x={PAD.left + (hover - 1) * band + band / 2} y={bars[hover - 1].d >= 0 ? y(bars[hover - 1].d) - 6 : y(bars[hover - 1].d) + 16} textAnchor="middle" className={styles.barValue}>
          {bars[hover - 1].d >= 0 ? "+" : "-"}{money(Math.abs(bars[hover - 1].d), false)}
        </text>
      )}
    </svg>
  );
}

export default function SavingsChart({ points, topUps, layout = "chart" }: { points: Point[]; topUps?: { total: number; count: number }; layout?: Display["history"] }) {
  const [range, setRange] = useState<Range>("1Y");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chart = useMemo(() => {
    const pts = points.slice(-RANGES[range]);
    const vals = pts.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo || 1) * 0.15;
    const min = lo - pad;
    const max = hi + pad;
    const x = (i: number) => PAD.left + (i / Math.max(1, pts.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;
    return { pts, x, y, line, area };
  }, [points, range]);

  const { pts, x, y } = chart;
  const shown = hover ?? pts.length - 1;
  const current = pts[shown];
  const change = current.value - pts[0].value;
  const changePct = pts[0].value ? (change / pts[0].value) * 100 : 0;
  const labelEvery = Math.ceil(pts.length / 6);

  const facts = [
    `The chart shows PNC checking, savings, CD and IRA balances combined, over the last ${range === "6M" ? "6 months" : range === "1Y" ? "12 months" : "24 months"}.`,
    `The balance in ${longMonth(pts.at(-1)!.month)} is ${money(pts.at(-1)!.value, false)}.`,
    `In ${longMonth(pts[0].month)} it was ${money(pts[0].value, false)}.`,
    `That is a ${change >= 0 ? "gain" : "drop"} of ${money(Math.abs(change), false)}.`,
    ...(topUps && topUps.total > 0
      ? [`The full history includes ${money(topUps.total, false)} moved in from an outside account in ${topUps.count} deposits, in PNC's sample data, which is why it rises.`, "Without those deposits, the person is short each month."]
      : []),
  ];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const rel = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((rel - PAD.left) / (W - PAD.left - PAD.right)) * (pts.length - 1));
    setHover(Math.min(pts.length - 1, Math.max(0, i)));
  }

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>Account history</h2>
          <p className={styles.cardSub}>PNC checking, savings, CD and IRA · {longMonth(current.month)}</p>
        </div>
        <div className={styles.segmented} role="group" aria-label="Time range">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} className={range === r ? styles.segOn : undefined} onClick={() => { setRange(r); setHover(null); }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.bigValue}>{money(current.value)}</p>
      <p className={`${styles.change} ${change >= 0 ? styles.pos : styles.neg}`}>
        {change >= 0 ? "▲" : "▼"} {money(Math.abs(change))} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%) since {shortMonth(pts[0].month)}
      </p>

      {layout === "table" ? (
        <div className={`${styles.tableWrap} ${styles.tableScroll}`}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Balances by month, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className={styles.num}>Balance</th>
                <th scope="col" className={styles.num}>Change</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p, i) => ({ p, d: i ? p.value - pts[i - 1].value : null })).reverse().map(({ p, d }) => (
                <tr key={p.month}>
                  <th scope="row">{longMonth(p.month)}</th>
                  <td className={styles.num}>{money(p.value)}</td>
                  <td className={`${styles.num} ${d === null ? styles.tableMuted : d >= 0 ? styles.pos : styles.neg}`}>{d === null ? "—" : `${d >= 0 ? "+" : "-"}${money(Math.abs(d))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : layout === "change" ? (
        <ChangeBars pts={pts} hover={hover} onHover={setHover} />
      ) : (
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.lineChart}
        role="img"
        aria-label={`Savings and investments over ${range}, now ${money(pts.at(-1)!.value)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="savingsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3B5BFD" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3B5BFD" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + f * (H - PAD.top - PAD.bottom)} y2={PAD.top + f * (H - PAD.top - PAD.bottom)} className={styles.gridLine} />
        ))}
        <path d={chart.area} fill="url(#savingsFill)" />
        <path d={chart.line} className={styles.linePath} />
        {pts.map((p, i) =>
          (i % labelEvery === 0 && pts.length - 1 - i >= labelEvery) || i === pts.length - 1 ? (
            <text key={p.month} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} className={styles.axisLabel}>
              {shortMonth(p.month)}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className={styles.hoverLine} />
            <circle cx={x(hover)} cy={y(pts[hover].value)} r={6} className={styles.hoverDot} />
          </g>
        )}
        <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!.value)} r={4.5} className={styles.endDot} />
      </svg>
      )}
      <GeminiFeedback facts={facts} />
      {topUps && topUps.total > 0 && (
        <p className={styles.chartNote}>
          This history includes {money(topUps.total, false)} moved in from an outside account ({topUps.count} deposits) in PNC&rsquo;s
          sample data, which is why it rises. Without those, you&rsquo;re short each month; the forecast below leaves them out.
        </p>
      )}
    </div>
  );
}
