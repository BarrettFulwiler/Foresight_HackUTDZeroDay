"use client";
import { useEffect, useState } from "react";

// What the user chose during onboarding. Stored in this browser for now.
export type PersonalGoalKind = "emergency" | "card" | "trip" | "car" | "retire";
export type BusinessGoalKind = "reserve" | "payroll" | "paydown" | "equipment" | "expand" | "taxes";
export type GoalKind = PersonalGoalKind | BusinessGoalKind;
export type Prefs = {
  name: string;
  email: string;
  accountType: "individual" | "company";
  country: string;
  state: string;
  currency: "USD";
  view: "simple" | "detailed";
  units: "dollars" | "days";
  period: 1 | 3;
  goals: GoalKind[];
  goal: { kind: GoalKind; label: string; target: number; saved: number; by: string }; // by = YYYY-MM
  consent: { pnc: boolean; capitalOne: boolean; disclaimer: boolean };
  completedAt: string;
};

type GoalOption = { kind: GoalKind; label: string; example: string };

export const GOAL_OPTIONS: GoalOption[] = [
  { kind: "trip", label: "Take a trip", example: "Trip to Cancún" },
  { kind: "emergency", label: "Build an emergency fund", example: "Emergency fund" },
  { kind: "card", label: "Pay off my credit card", example: "Credit card payoff" },
  { kind: "car", label: "Buy or replace a car", example: "Next car" },
  { kind: "retire", label: "Save for retirement", example: "Retirement" },
];

// Goals offered in onboarding when the account is for a company.
export const BUSINESS_GOAL_OPTIONS: GoalOption[] = [
  { kind: "reserve", label: "Build a cash reserve", example: "3-month operating reserve" },
  { kind: "payroll", label: "Cover payroll in slow months", example: "Payroll cushion" },
  { kind: "paydown", label: "Pay down a loan or line of credit", example: "Line of credit payoff" },
  { kind: "equipment", label: "Buy equipment or vehicles", example: "New delivery truck" },
  { kind: "expand", label: "Open a new location", example: "Second location" },
  { kind: "taxes", label: "Set aside for taxes", example: "Quarterly tax set-aside" },
];

export const goalOptionsFor = (accountType: Prefs["accountType"]) => (accountType === "company" ? BUSINESS_GOAL_OPTIONS : GOAL_OPTIONS);
export const goalOption = (kind: GoalKind) => [...GOAL_OPTIONS, ...BUSINESS_GOAL_OPTIONS].find((o) => o.kind === kind);

export const DEMO_PREFS: Prefs = {
  name: "Alex",
  email: "",
  accountType: "individual",
  country: "US",
  state: "TX",
  currency: "USD",
  view: "detailed",
  units: "dollars",
  period: 3,
  goals: ["trip", "emergency"],
  goal: { kind: "trip", label: "Trip to Cancún", target: 1500, saved: 960, by: "2027-03" },
  consent: { pnc: true, capitalOne: true, disclaimer: true },
  completedAt: "",
};

// The demo when "My company" is picked: same profile, business goals.
export const DEMO_BUSINESS_PREFS: Prefs = {
  ...DEMO_PREFS,
  accountType: "company",
  goals: ["reserve", "payroll"],
  goal: { kind: "reserve", label: "3-month operating reserve", target: 150000, saved: 40000, by: "2027-06" },
};

const KEY = "foresight.prefs";
export const LIST_KEY = "foresight.categoriesOpen"; // read by the spending chart

export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? ({ ...DEMO_PREFS, ...JSON.parse(raw) } as Prefs) : null;
  } catch {
    return null;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem(LIST_KEY, p.view === "simple" ? "0" : "1");
  } catch {}
}

// Reads saved prefs after the page mounts (null until then, or if onboarding was never done).
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);
  return { prefs, ready };
}

// Months from the start of `from` (YYYY-MM-DD or YYYY-MM) until the end of `to` (YYYY-MM), at least 1.
export function monthsUntil(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm));
}
