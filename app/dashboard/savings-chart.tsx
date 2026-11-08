"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "../../lib/finance";
import { longMonth, money, shortMonth } from "../../lib/format";
import type { Display } from "../../lib/display";
import GeminiFeedback from "./gemini-feedback";
import styles from "./dashboard.module.css";

const RANGES = { "6M": 6, "1Y": 12, "2Y": 24 } as const;
type Range = keyof typeof RANGES;
const W = 640;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

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

// scope: what the balance covers (the company dashboard passes its own); note: shown under the chart.
export default function SavingsChart({ points, topUps, layout = "chart", scope = "PNC checking, savings, CD and IRA", note }: {
  points: Point[];
  topUps?: { total: number; count: number };
  layout?: Display["history"];
  scope?: string;
  note?: string;
}) {
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
    `The chart shows ${scope} balances combined, over the last ${range === "6M" ? "6 months" : range === "1Y" ? "12 months" : "24 months"}.`,
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
          <p className={styles.cardSub}>{scope} · {longMonth(current.month)}</p>
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
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + f * (H - PAD.top - PAD.bottom)} y2={PAD.top + f * (H - PAD.top - PAD.bottom)} className={styles.gridLine} />
        ))}
        {/* A flat tint, not an SVG gradient: url(#id) fills come out black in the Download Report PNG. */}
        <path d={chart.area} fill="#1a66ad" fillOpacity={0.1} />
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
      <GeminiFeedback facts={facts} topic="history" label="Ask Gemini for feedback on this chart" />
      {note && <p className={styles.chartNote}>{note}</p>}
      {topUps && topUps.total > 0 && (
        <p className={styles.chartNote}>
          This history includes {money(topUps.total, false)} moved in from an outside account ({topUps.count} deposits) in PNC&rsquo;s
          sample data, which is why it rises. Without those, you&rsquo;re short each month; the forecast below leaves them out.
        </p>
      )}
    </div>
  );
}
