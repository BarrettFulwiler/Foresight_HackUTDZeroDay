"use client";
import { useMemo, useRef, useState } from "react";
import type { Point } from "../../lib/finance";
import { longMonth, money, shortMonth } from "../../lib/format";
import styles from "./dashboard.module.css";

const RANGES = { "6M": 6, "1Y": 12, "2Y": 24 } as const;
type Range = keyof typeof RANGES;
const W = 640;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

export default function SavingsChart({ points, topUps }: { points: Point[]; topUps?: { total: number; count: number } }) {
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
      {topUps && topUps.total > 0 && (
        <p className={styles.chartNote}>
          This history includes {money(topUps.total, false)} moved in from an outside account ({topUps.count} deposits) in PNC&rsquo;s
          sample data, which is why it rises. Without those, you&rsquo;re short each month; the forecast below leaves them out.
        </p>
      )}
    </div>
  );
}
