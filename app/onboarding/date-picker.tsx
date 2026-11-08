"use client";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./date-picker.module.css";

// A date field that opens a small calendar: pick the month and year from the dropdowns (or the arrows),
// then click a day. Value and min are YYYY-MM-DD. Keyboard: arrows move between days, Enter picks, Esc closes.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const YEARS_AHEAD = 30;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
};
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const addDays = (s: string, n: number) => {
  const { y, m, d } = parse(s);
  const t = new Date(y, m, d + n);
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
};
export const formatDate = (s: string) => {
  const { y, m, d } = parse(s);
  return `${MONTHS[m]} ${d}, ${y}`;
};

export default function DatePicker({ value, min, onChange, labelledBy, placeholder = "Pick a date" }: { value: string; min: string; onChange: (v: string) => void; labelledBy?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const start = value || min;
  const [view, setView] = useState(() => ({ y: parse(start).y, m: parse(start).m }));
  const [focus, setFocus] = useState(start);
  const wrap = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const minP = parse(min);

  function show() {
    const s = value && value >= min ? value : min;
    setView({ y: parse(s).y, m: parse(s).m });
    setFocus(s);
    setOpen(true);
  }
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }
  function pick(s: string) {
    if (s < min) return;
    onChange(s);
    close();
  }
  function moveFocus(s: string) {
    if (s < min) s = min;
    setFocus(s);
    const p = parse(s);
    setView({ y: p.y, m: p.m });
  }

  // Close on a click outside the picker.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep keyboard focus on the highlighted day.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus, view]);

  function onGridKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(focus, step[e.key]));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  }

  const goMonth = (delta: number) => {
    const t = new Date(view.y, view.m + delta, 1);
    if (t.getFullYear() < minP.y || (t.getFullYear() === minP.y && t.getMonth() < minP.m)) return;
    setView({ y: t.getFullYear(), m: t.getMonth() });
    const d = Math.min(parse(focus).d, daysIn(t.getFullYear(), t.getMonth()));
    const next = iso(t.getFullYear(), t.getMonth(), d);
    setFocus(next < min ? min : next);
  };
  const atMinMonth = view.y === minP.y && view.m === minP.m;
  const years = Array.from({ length: YEARS_AHEAD + 1 }, (_, i) => minP.y + i);
  const lead = new Date(view.y, view.m, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => iso(view.y, view.m, i + 1))];

  return (
    <div className={styles.wrap} ref={wrap} onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), close())}>
      <button
        type="button"
        ref={trigger}
        className={`${styles.trigger} ${value ? "" : styles.empty}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-labelledby={labelledBy}
        onClick={() => (open ? close() : show())}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <CalendarIcon />
      </button>

      {open && (
        <div className={styles.pop} id={dialogId} role="dialog" aria-modal="false" aria-label="Choose a date">
          <div className={styles.head}>
            <button type="button" className={styles.nav} onClick={() => goMonth(-1)} disabled={atMinMonth} aria-label="Previous month">‹</button>
            <select
              aria-label="Month"
              value={view.m}
              onChange={(e) => {
                const m = Number(e.target.value);
                const y = view.y === minP.y && m < minP.m ? minP.y + 1 : view.y;
                setView({ y, m });
                const d = Math.min(parse(focus).d, daysIn(y, m));
                const next = iso(y, m, d);
                setFocus(next < min ? min : next);
              }}
            >
              {MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
            <select
              aria-label="Year"
              value={view.y}
              onChange={(e) => {
                const y = Number(e.target.value);
                const m = y === minP.y && view.m < minP.m ? minP.m : view.m;
                setView({ y, m });
                const d = Math.min(parse(focus).d, daysIn(y, m));
                const next = iso(y, m, d);
                setFocus(next < min ? min : next);
              }}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className={styles.nav} onClick={() => goMonth(1)} aria-label="Next month">›</button>
          </div>

          <div className={styles.week} aria-hidden="true">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className={styles.grid} ref={grid} role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onGridKey}>
            {cells.map((day, i) =>
              day === null ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  tabIndex={day === focus ? 0 : -1}
                  disabled={day < min}
                  aria-selected={day === value}
                  aria-label={formatDate(day)}
                  className={`${styles.day} ${day === value ? styles.selected : ""}`}
                  onClick={() => pick(day)}
                >
                  {parse(day).d}
                </button>
              ),
            )}
          </div>
          <p className={styles.hint}>Pick a month and year above, then a day.</p>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </svg>
  );
}
