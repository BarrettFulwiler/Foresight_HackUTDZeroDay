"use client";
import { useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

// The "Ask Gemini" box under a card. The server only sends Gemini that card's facts and checks every number it writes.
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
// topic tells the server which card is asking, so Gemini teaches about the right thing.
export default function GeminiFeedback({ facts, topic, label, placeholder = "Ask Gemini for feedback" }: { facts: string[]; topic: "history" | "spending"; label: string; placeholder?: string }) {
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

  const trimmed = question.trim();

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || reply.status === "loading") return; // nothing typed: don't ask Gemini
    setReply({ status: "loading" });
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed, facts, topic }) });
      const data = await res.json().catch(() => ({}));
      setReply(res.ok ? { status: "done", ...data } : { status: "error", error: data.error ?? "Gemini didn't answer. Try again." });
    } catch {
      setReply({ status: "error", error: "Couldn't reach Foresight's server." });
    }
  }

  const typing = reply.status === "done" && shown < text.length;
  return (
    <div className={styles.gemBox} data-report-skip="">
      <form className={styles.gemForm} onSubmit={ask}>
        <input
          className={styles.gemInput}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          maxLength={300}
        />
        <button
          type="submit"
          className={styles.gemBtn}
          disabled={!trimmed || reply.status === "loading"}
          aria-label="Ask Gemini"
          title={trimmed ? "Ask Gemini" : "Type a question first"}
        >
          <GeminiMark />
        </button>
      </form>
      {reply.status === "loading" && <p className={styles.gemStatus} role="status">Gemini is reading the numbers…</p>}
      {reply.status === "error" && <p className={styles.gemError} role="alert">{reply.error}</p>}
      {reply.status === "done" && (
        <div className={styles.gemReply} aria-live="polite" aria-busy={typing}>
          <p className={styles.gemText}>{revealed(segs, shown)}{typing && <span className={styles.gemCaret} aria-hidden="true" />}</p>
          {!typing && <p className={styles.gemMeta}>✓ All {reply.checked} {reply.checked === 1 ? "number matches" : "numbers match"} what you see · Written by Gemini</p>}
        </div>
      )}
    </div>
  );
}
