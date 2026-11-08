"use client";
import { useCallback, useEffect, useState } from "react";
import type { Prefs } from "./prefs";

// How each main card on the View tab presents its data. Chosen on the Edit tab, saved in this browser.
// Cash units and months per spending view start from onboarding's choices until the user changes them here.
export type Display = {
  cash: "dollars" | "days";
  goal: "bar" | "ring";
  spending: "chart" | "bars" | "budget" | "table";
  spendingMonths: 1 | 3;
  history: "chart" | "change" | "table";
  budget: "boxes" | "waterfall" | "table";
  accounts: "cards" | "balance" | "table";
  credit: "factors" | "score";
};

type Option<K extends keyof Display> = { value: Display[K]; label: string };
type Setting = { [K in keyof Display]: { key: K; label: string; options: Option<K>[] } }[keyof Display];
export type DisplayCard = { id: string; title: string; about: string; settings: Setting[]; personalOnly?: boolean };

// What the Edit tab lists, one entry per View card, in the order they appear on View.
export const DISPLAY_CARDS: DisplayCard[] = [
  {
    id: "cash",
    title: "Cash and savings",
    about: "The headline at the top of View.",
    settings: [{ key: "cash", label: "Show cash as", options: [{ value: "dollars", label: "Dollars" }, { value: "days", label: "Days it lasts" }] }],
  },
  {
    id: "goal",
    title: "Your goal",
    about: "Progress toward the goal you set.",
    settings: [{ key: "goal", label: "Progress as", options: [{ value: "bar", label: "Bar" }, { value: "ring", label: "Ring" }] }],
  },
  {
    id: "spending",
    title: "Spending",
    about: "Where your money went, by category.",
    settings: [
      { key: "spending", label: "Layout", options: [{ value: "chart", label: "Donut" }, { value: "bars", label: "Ranked bars" }, { value: "budget", label: "vs. Budget" }, { value: "table", label: "Table" }] },
      { key: "spendingMonths", label: "Months at a time", options: [{ value: 1, label: "1 month" }, { value: 3, label: "3 months" }] },
    ],
  },
  {
    id: "history",
    title: "Account history",
    about: "Your PNC balances over time.",
    settings: [{ key: "history", label: "Layout", options: [{ value: "chart", label: "Line chart" }, { value: "change", label: "Monthly change" }, { value: "table", label: "Table" }] }],
  },
  {
    id: "budget",
    title: "Budgeting",
    about: "Last month's income, spending and leftover.",
    settings: [{ key: "budget", label: "Layout", options: [{ value: "boxes", label: "Summary boxes" }, { value: "waterfall", label: "Waterfall" }, { value: "table", label: "Table" }] }],
  },
  {
    id: "accounts",
    title: "Money summary",
    about: "Every account at both banks.",
    settings: [{ key: "accounts", label: "Layout", options: [{ value: "cards", label: "Cards" }, { value: "balance", label: "Have vs. owe" }, { value: "table", label: "Table" }] }],
  },
  {
    id: "credit",
    title: "Credit score",
    about: "An estimate from your accounts.",
    personalOnly: true,
    settings: [{ key: "credit", label: "Show", options: [{ value: "factors", label: "Score and factors" }, { value: "score", label: "Score only" }] }],
  },
];

// Every card on View, for the Edit tab's "Show on View" switches. personalOnly cards don't exist on the company dashboard.
export type ViewCardId = "cash" | "goal" | "spending" | "history" | "health" | "budget" | "accounts" | "credit";
export const VIEW_CARDS: { id: ViewCardId; title: string; about: string; personalOnly?: boolean }[] = [
  { id: "cash", title: "Cash and savings", about: "The headline at the top." },
  { id: "goal", title: "Your goal", about: "Progress toward your goal." },
  { id: "spending", title: "Spending", about: "Where the money went." },
  { id: "history", title: "Account history", about: "Balances over time." },
  { id: "health", title: "Health cards", about: "Overdraft, cash flow and the third check." },
  { id: "budget", title: "Budgeting", about: "Last month's income and leftover." },
  { id: "accounts", title: "Money summary", about: "Every account and loan." },
  { id: "credit", title: "Credit score", about: "Estimated from your accounts.", personalOnly: true },
];
const HIDDEN_KEY = "foresight.hidden";

const KEY = "foresight.display";
const BASE: Display = { cash: "dollars", goal: "bar", spending: "chart", spendingMonths: 3, history: "chart", budget: "boxes", accounts: "cards", credit: "factors" };

const fromPrefs = (prefs: Prefs | null): Display => ({ ...BASE, cash: prefs?.units ?? BASE.cash, spendingMonths: prefs?.period ?? BASE.spendingMonths });

// Keeps only saved values that are still valid options, so an old or edited entry can't break a card.
function clean(raw: unknown): Partial<Display> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const card of DISPLAY_CARDS)
    for (const s of card.settings) {
      const v = (raw as Record<string, unknown>)[s.key];
      if (s.options.some((o) => o.value === v)) out[s.key] = v;
    }
  return out as Partial<Display>;
}

// The user's display choices on top of the defaults. `changed` holds only what they picked on the Edit tab.
export function useDisplay(prefs: Prefs | null) {
  const [changed, setChanged] = useState<Partial<Display>>({});
  const [hidden, setHidden] = useState<ViewCardId[]>([]);
  useEffect(() => {
    try {
      setChanged(clean(JSON.parse(localStorage.getItem(KEY) ?? "{}")));
    } catch {}
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(saved)) setHidden(VIEW_CARDS.map((c) => c.id).filter((id) => saved.includes(id)));
    } catch {}
  }, []);
  // Show or hide one View card (saved on this device). Builds on the latest list, like `update` below.
  const toggleHidden = useCallback((id: ViewCardId) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const showAll = useCallback(() => {
    setHidden([]);
    try {
      localStorage.setItem(HIDDEN_KEY, "[]");
    } catch {}
  }, []);
  // Builds on the latest saved choices (not this render's copy), so quick clicks don't undo each other.
  const update = useCallback((change: (prev: Partial<Display>) => Partial<Display>) => {
    setChanged((prev) => {
      const next = change(prev);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const defaults = fromPrefs(prefs);
  const display: Display = { ...defaults, ...changed };
  const set = <K extends keyof Display>(key: K, value: Display[K]) =>
    update((prev) => {
      const next = { ...prev, [key]: value };
      if (value === defaults[key]) delete next[key];
      return next;
    });
  return { display, set, edited: Object.keys(changed).length > 0, reset: () => update(() => ({})), hidden, toggleHidden, showAll };
}
