// POST { question: string } → a custom what-if, answered chatbot-style by future-you.
//
// How it works, in the same order every time:
//   1. Gemini (lib/gemini.ts) reads the free-text question and returns a structured WhatIfSpec.
//      No Gemini key / no answer → lib/whatif.ts's rule-based parser reads it instead.
//   2. The forecast engine runs the next 12 months BOTH WAYS from the user's real balances
//      (live Nessie balances at both banks via withLiveBalances; demo balances if Nessie is down).
//   3. Gemini writes future-you's reply from the calculated facts only. Every number is checked
//      against the facts (lib/explain.ts unverified()); a reply with an uncalculated number is
//      retried once, then replaced by a deterministic reply built from the same facts.
import { NextResponse } from "next/server";
import { numbersIn, unverified } from "../../../lib/explain";
import { getDashboardData } from "../../../lib/finance";
import { geminiConfigured, generateJson } from "../../../lib/gemini";
import { longMonth, money } from "../../../lib/format";
import { withLiveBalances } from "../../../lib/live-accounts";
import { shortDay } from "../../../lib/plans";
import { buildCustomPlan, customFacts, fallbackParse, horizonMonths, normalizeSpec, type WhatIfSpec } from "../../../lib/whatif";

export const dynamic = "force-dynamic";

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "At most 5 words naming the what-if, e.g. 'Buy a laptop'." },
    kind: { type: "string", enum: ["event", "habit"], description: "event = a cost or shock that happens to the user; habit = a deliberate change (a spending cut, saving more, paying off a card, extra income)." },
    want: { type: "string", description: "The user's question, restated in one plain sentence." },
    interpretation: { type: "string", description: "One sentence saying exactly what you assumed: amounts, month, category. The user sees this." },
    oneOffAmount: { type: "number", description: "One-time expense in dollars, or 0 if none." },
    oneOffMonth: { type: "string", description: "YYYY-MM from the horizon list when the one-time expense lands, or empty." },
    oneOffLabel: { type: "string", description: "Short label for the expense, e.g. 'Laptop', or empty." },
    monthlyDelta: { type: "number", description: "Recurring monthly change to checking in dollars: positive = extra income, negative = extra monthly cost. 0 if none." },
    cutsCategory: { type: "string", description: "A spending category from the provided list to cut, or empty." },
    cutsAmount: { type: "number", description: "Dollars per month to cut from that category, or 0." },
    saveMonthly: { type: "number", description: "Dollars per month to move from checking to savings, or 0." },
    payoffCard: { type: "boolean", description: "True if the user wants to pay off their credit card." },
  },
  required: ["title", "kind", "want", "interpretation"],
};

const NOTE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "At most 10 words: the verdict on this what-if." },
    message: { type: "string", description: "60 to 110 words of plain text, chatbot-style: answer the question directly, then the plan in one or two sentences." },
  },
  required: ["headline", "message"],
};

const NOTE_SYSTEM = `You are the user's future self, replying in a chat to a what-if they just typed. You have lived through the next 12 months both ways — with and without the plan — and the facts you are given are what you know.

Rules:
- Use only the facts. Every number you write (dollar amounts, dates, percentages, counts) must appear exactly as written in the facts. Never round, add, subtract or estimate. If a number isn't in the facts, leave it out.
- Use at most 5 numbers, the ones that answer the question.
- Speak as "I" (future-you) to "you", warm, calm and direct, like a text from a friend who has seen how it turns out. No guilt, no hype, no exclamation marks.
- First answer the question (can they / what happens), then name the one move in the plan that changes the outcome.
- Don't open with "I am writing" or "As your future self". Don't sign off. No markdown or lists.
- headline: at most 10 words, specific to this situation. message: 60 to 110 words, plain text.`;

type RawParse = {
  title?: string; kind?: string; want?: string; interpretation?: string;
  oneOffAmount?: number; oneOffMonth?: string; oneOffLabel?: string;
  monthlyDelta?: number; cutsCategory?: string; cutsAmount?: number;
  saveMonthly?: number; payoffCard?: boolean;
};

async function parseWithGemini(question: string, asOf: string, categories: { name: string; monthly: number }[], accountsLine: string): Promise<WhatIfSpec | null> {
  if (!geminiConfigured()) return null;
  const horizon = horizonMonths(asOf).map((ym) => `${ym} (${longMonth(ym)})`).join(", ");
  const input = [
    `Today in the app's data is ${asOf}. The forecast horizon (YYYY-MM) is: ${horizon}.`,
    `The user's accounts (balances are real, from both banks): ${accountsLine}.`,
    `Spending categories in a typical month: ${categories.map((c) => `${c.name} ${money(c.monthly, false)}`).join(", ") || "none"}.`,
    `Question: ${question}`,
    `Map the question onto the fields. If the user names a month, use that YYYY-MM from the horizon; if they give no month for a one-off expense, leave oneOffMonth empty. If they give no amount for a cut, use 75. Amounts are in dollars, not cents.`,
  ].join("\n");
  try {
    const { data } = await generateJson<RawParse>({
      system: "You translate a personal-finance what-if question into structured fields for a forecast engine. You do not do any math and you do not give advice; you only extract what the user said, with the assumptions spelled out in 'interpretation'.",
      input,
      schema: PARSE_SCHEMA,
      temperature: 0.2,
    });
    const raw: WhatIfSpec = {
      title: String(data?.title ?? ""),
      kind: data?.kind === "habit" ? "habit" : "event",
      want: String(data?.want ?? question),
      interpretation: String(data?.interpretation ?? ""),
      oneOffAmount: Number(data?.oneOffAmount) || undefined,
      oneOffMonth: String(data?.oneOffMonth ?? "") || undefined,
      oneOffLabel: String(data?.oneOffLabel ?? "") || undefined,
      monthlyDelta: Number(data?.monthlyDelta) || undefined,
      cutsCategory: String(data?.cutsCategory ?? "") || undefined,
      cutsAmount: Number(data?.cutsAmount) || undefined,
      saveMonthly: Number(data?.saveMonthly) || undefined,
      payoffCard: Boolean(data?.payoffCard),
    };
    return normalizeSpec(raw, asOf, categories.map((c) => c.name));
  } catch {
    return null; // caller falls back to the rule-based parser
  }
}

/** A reply built only from calculated values, used when Gemini can't write a verified one. */
function deterministicReply(plan: ReturnType<typeof buildCustomPlan>) {
  const endA = plan.asIs.months.at(-1)!;
  const endB = plan.withPlan.months.at(-1)!;
  const verdict = plan.withPlan.firstNegative
    ? `Even with the plan, PNC checking goes negative on ${shortDay(plan.withPlan.firstNegative.date)}`
    : plan.asIs.firstNegative
      ? `As is, PNC checking is overdrawn from ${shortDay(plan.asIs.firstNegative.date)}. With the plan it never goes negative, and its lowest point is ${money(plan.withPlan.lowest.balance)}`
      : `PNC checking stays positive both ways. With the plan its lowest point is ${money(plan.withPlan.lowest.balance)}`;
  return {
    headline: plan.title,
    message: `${verdict}. Cash and savings end the year at ${money(endB.liquid)} with the plan, versus ${money(endA.liquid)} as is. The first step: ${plan.steps[0] ?? "turn on automatic top-ups from savings"} The chart below shows both futures.`,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 300) {
    return NextResponse.json({ error: "Type a what-if in a sentence or two — e.g. “What if I buy a $2,400 laptop in December?”" }, { status: 400 });
  }

  const data = getDashboardData("C005");
  const live = await withLiveBalances(data.accounts);
  const accounts = live.accounts;

  // Typical-month category totals, so the parser knows what there is to cut.
  const totals = new Map<string, number>();
  for (const e of data.schedule) if (e.flow === "expense") totals.set(e.category, (totals.get(e.category) ?? 0) + Math.abs(e.delta));
  const categories = [...totals.entries()].map(([name, monthly]) => ({ name, monthly: Math.round(monthly) }));
  const accountsLine = accounts.map((a) => `${a.bank} ${a.name} ${money(a.balance, false)}`).join("; ");

  const fromGemini = await parseWithGemini(question, data.asOf, categories, accountsLine);
  const spec = fromGemini ?? normalizeSpec(fallbackParse(question, data.asOf), data.asOf, categories.map((c) => c.name));
  const parsedBy = fromGemini ? "gemini" : "rules";

  // The user's Edit-tab budgets (category → monthly $ cut), so the answer matches the chart they see.
  const cuts: Record<string, number> = {};
  if (body?.cuts && typeof body.cuts === "object") {
    for (const [k, v] of Object.entries(body.cuts as Record<string, unknown>)) {
      if (totals.has(k) && typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100_000) cuts[k] = v;
    }
  }

  const plan = buildCustomPlan(spec, accounts, data.schedule, data.asOf, cuts);
  const facts = customFacts(plan, accounts);

  // Gemini writes the reply from the facts; verify every number before it reaches the user.
  let answer: { headline: string; message: string; checked: number; model: string | null; fallback: boolean };
  try {
    let feedback = "";
    let done: typeof answer | null = null;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const { data: note, model } = await generateJson<{ headline: string; message: string }>({
        system: NOTE_SYSTEM,
        input: `The user asked: ${question}\n\nFacts:\n${facts.map((f) => `- ${f}`).join("\n")}` + feedback,
        schema: NOTE_SCHEMA,
      });
      const headline = String(note?.headline ?? "").trim();
      const message = String(note?.message ?? "").trim();
      if (!headline || !message) { feedback = "\n\nYour last reply left a field empty. Fill in both."; continue; }
      const bad = unverified(`${headline}\n${message}`, facts);
      if (bad.length === 0) done = { headline, message, checked: numbersIn(`${headline}\n${message}`).length, model, fallback: false };
      else feedback = `\n\nYour last draft used numbers that aren't in the facts: ${bad.join(", ")}. Rewrite it using only numbers from the facts.`;
    }
    answer = done ?? { ...deterministicReply(plan), checked: 0, model: null, fallback: true };
  } catch {
    // Any Gemini failure (busy, timeout, unreadable JSON) falls back to the calculated reply instead of a 500.
    answer ={ ...deterministicReply(plan), checked: 0, model: null, fallback: true };
  }

  return NextResponse.json({
    question,
    source: live.source, // "nessie" = real balances at both banks, "demo" = Nessie unreachable, snapshot balances used
    spec,
    plan,
    facts,
    answer,
    parsedBy,
  });
}
