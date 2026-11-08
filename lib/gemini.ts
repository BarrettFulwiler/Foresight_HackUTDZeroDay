// Server-only Gemini client (Interactions API). The key stays on the server and never reaches the browser.
// Tries each model in order, so a busy model (503) or a slow one falls through to the next.
const URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3-flash-preview")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = 12_000;

export class GeminiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

type Step = { type?: string; content?: { type?: string; text?: string }[] };

function outputText(body: { steps?: Step[] } | null): string {
  return (body?.steps ?? [])
    .filter((s) => s?.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

export async function generateJson<T>(opts: { system: string; input: string; schema: object; temperature?: number }): Promise<{ data: T; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("Gemini isn't set up. Add GEMINI_API_KEY to .env.local.", 503);
  let last = "";
  for (const model of MODELS) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": "2026-05-20" },
        body: JSON.stringify({
          model,
          store: false,
          system_instruction: opts.system,
          input: opts.input,
          generation_config: { temperature: opts.temperature ?? 0.6, thinking_level: "low" },
          response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        last = `${model}: ${body?.error?.message ?? `HTTP ${res.status}`}`;
        continue;
      }
      const text = outputText(body);
      if (!text) {
        last = `${model}: empty reply`;
        continue;
      }
      return { data: JSON.parse(text) as T, model };
    } catch (e) {
      last = `${model}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new GeminiError(`Gemini didn't answer (${last}).`);
}
