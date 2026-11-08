// POST { question?: string, facts: string[] } → { text, checked, model }: Gemini's feedback on the savings chart,
// written only from the facts the chart sends. Every number in the reply must already be in the facts (or the question).
import { NextResponse } from "next/server";
import { numbersIn, unverified } from "../../../lib/explain";
import { GeminiError, generateText } from "../../../lib/gemini";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a patient money teacher inside Foresight, an app that shows people one clear view of their checking, savings, CDs, IRAs, loans, cards and mortgages, so they know how they're doing and what to do next. The person can already see the chart, so never walk them through it, repeat its balances or describe its line. Use the facts only as evidence for what you teach.

What to do:
- Teach one or two ideas that make this picture make sense, in plain words a beginner can follow: where the growth really comes from, why that matters, or how the account types differ (checking is for everyday bills, savings is for a cushion, a CD locks money for a set term, an IRA is for retirement and costs you to touch early).
- Say what it means for them and one concrete next step they could take this week, such as checking what the monthly bills really are, deciding which account a goal belongs in, or asking what happens if the outside deposits stop.
- If the facts say growth came from money moved in from an outside account, explain the difference between money you save and money you transfer in, and what that means if the transfers stop. Don't credit transfers to saving habits.
- If they ask a question, answer it first, then teach.
- Open with the lesson, not with the chart. Don't begin with "The chart shows".

Rules:
- Every number you write (dollar amounts, dates, percentages, counts) must appear exactly as written in the facts. Never round, add, subtract or estimate. If a number isn't there, leave it out. Use at most 3 numbers. Don't quote rules of thumb that contain numbers, like "six months of expenses"; say "a few months" instead.
- Highlight only the few phrases that matter most, using these tags and nothing else: [g]...[/g] green for what is good or protective, [gb]...[/gb] green and bold for the single best thing to do, [r]...[/r] red for a risk or warning, [rb]...[/rb] red and bold for the biggest danger. Use 2 to 4 highlights in the whole reply, each a short phrase of a few words, never a full sentence. Most of the text must stay untagged. Never nest or leave a tag open.
- 80 to 150 words of plain text in 2 or 3 short paragraphs. No markdown (no asterisks), bullets or headings. Warm, calm and direct, like a friend who is good with money. No hype, no exclamation marks, no guilt.
- Don't recommend specific products, lenders or investments, and don't call this financial advice.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const facts: unknown = body?.facts;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 300) : "";
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > 20 || !facts.every((f) => typeof f === "string" && f.length <= 500)) {
    return NextResponse.json({ error: "Send the chart's facts as a list of sentences." }, { status: 400 });
  }
  const allowed = [...facts, question];
  const input = `Facts:\n${facts.map((f) => `- ${f}`).join("\n")}\n\nTheir question: ${question || "(none. Just give feedback.)"}`;
  try {
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, model } = await generateText({ system: SYSTEM, input: input + feedback });
      const reply = text.trim();
      const bad = unverified(reply, allowed);
      if (reply && bad.length === 0) return NextResponse.json({ text: reply, checked: numbersIn(reply).length, model });
      feedback = reply
        ? `\n\nYour last draft used numbers that aren't in the facts: ${bad.join(", ")}. Rewrite it using only numbers from the facts.`
        : "\n\nYour last reply was empty. Write the feedback.";
    }
    return NextResponse.json({ error: "Gemini's reply used numbers the chart didn't calculate, so Foresight didn't show it. Try again." }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: e instanceof GeminiError ? e.status : 500 });
  }
}
