// POST { facts: string[], fresh?: boolean, audience?: "personal" | "business" } → a note from future-you, written by Gemini from the forecast's facts.
// Every number in the reply must already be in the facts; otherwise Gemini gets one retry, then the note is refused.
import { NextResponse } from "next/server";
import { AUDIENCE_RULES, numbersIn, toAudience, unverified } from "../../../lib/explain";
import { GeminiError, generateJson } from "../../../lib/gemini";

export const dynamic = "force-dynamic";

type Note = { headline: string; message: string };
type Result = Note & { checked: number; model: string };

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "At most 10 words: the one thing you most need them to hear." },
    message: { type: "string", description: "50 to 90 words of plain text." },
  },
  required: ["headline", "message"],
};

const SYSTEM = `You are the user's future self, writing a short note back to them from one year ahead. You have lived through the next 12 months, and the facts you are given are what you know.

Rules:
- Use only the facts. Every number you write (dollar amounts, dates, percentages, counts) must appear exactly as written in the facts. Never round, add, subtract or estimate. If a number isn't in the facts, leave it out.
- Write numbers with digits, exactly as the facts write them, and keep each number tied to the same thing and date it has in the facts.
- Use at most 4 numbers, the ones that matter most. Don't list every step; the plan is shown separately.
- Speak as "I" (future-you) to "you", like a text from a friend who has seen how it turns out. Warm, calm and direct. No guilt, no hype, no exclamation marks.
- Start with the moment that matters (what happens without the plan), then why the plan works, then how it feels to be on the other side.
- Don't open with "I am writing" or "As your future self". Don't sign off.
- Mention only the user's own accounts. Don't recommend other products, lenders or investments, and don't call this financial advice.
- headline: at most 10 words, specific to this situation. message: 50 to 90 words, plain text, no markdown or lists.`;

const cache = new Map<string, Result>();

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const facts: unknown = body?.facts;
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > 40 || !facts.every((f) => typeof f === "string" && f.length <= 500)) {
    return NextResponse.json({ error: "Send the plan's facts as a list of sentences." }, { status: 400 });
  }
  const audience = toAudience(body?.audience);
  const system = `${SYSTEM}\n\n${AUDIENCE_RULES[audience]}`;
  const key = `${audience}\n${facts.join("\n")}`;
  const hit = cache.get(key);
  if (hit && !body?.fresh) return NextResponse.json(hit);

  const input = `Facts:\n${facts.map((f) => `- ${f}`).join("\n")}`;
  try {
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, model } = await generateJson<Note>({ system, input: input + feedback, schema: SCHEMA });
      const headline = String(data?.headline ?? "").trim();
      const message = String(data?.message ?? "").trim();
      if (!headline || !message) {
        feedback = "\n\nYour last reply left a field empty. Fill in both.";
        continue;
      }
      const bad = unverified(`${headline}\n${message}`, facts);
      if (bad.length === 0) {
        const result: Result = { headline, message, checked: numbersIn(`${headline}\n${message}`).length, model };
        if (cache.size > 100) cache.clear();
        cache.set(key, result);
        return NextResponse.json(result);
      }
      feedback = `\n\nYour last draft used numbers that aren't in the facts: ${bad.join(", ")}. Rewrite it using only numbers from the facts.`;
    }
    return NextResponse.json({ error: "Gemini's note used numbers the forecast didn't calculate, so Foresight didn't show it. Try again." }, { status: 422 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: e instanceof GeminiError ? e.status : 500 });
  }
}
