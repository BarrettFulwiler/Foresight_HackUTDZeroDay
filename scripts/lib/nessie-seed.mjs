// Shared helpers for the Nessie seed scripts (companies and individuals).
// Needs NESSIE_KEY in .env; the scripts run with `node --env-file=.env`.

export const BASE = process.env.NESSIE_URL || "https://v2-prod-api.nessieisreal.com";
export const KEY = process.env.NESSIE_KEY;

// Deterministic random, so every run builds the same customers and re-running only adds what's missing.
export function rngFor(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const between = (r, lo, hi) => lo + r() * (hi - lo);
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const cents = (dollars) => Math.max(1, Math.round(dollars * 100));
export const roundTo = (n, step) => Math.round(n / step) * step;
export const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function call(path, init = {}, tries = 4) {
  for (let t = 0; t < tries; t++) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    }).catch((e) => ({ networkError: e }));
    if (res.networkError || res.status === 429 || res.status >= 500) {
      await new Promise((ok) => setTimeout(ok, 800 * (t + 1) + (Number(res.headers?.get("retry-after")) || 0) * 1000));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${body.detail || body.title || ""}`);
    return body;
  }
  throw new Error(`${init.method || "GET"} ${path} failed after ${tries} tries`);
}
export const post = (path, body) => call(path, { method: "POST", body: JSON.stringify(body) });

export async function listAll(path) {
  const out = [];
  let cursor = "";
  do {
    const page = await call(`${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...(page.items ?? []));
    cursor = page.next_cursor || "";
  } while (cursor);
  return out;
}

export async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Deletes every customer whose first name ends in `tag`, with their accounts. Nothing else is touched. */
export async function resetTagged(tag) {
  const existing = (await listAll("/customers")).filter((c) => c.first_name.endsWith(tag));
  console.log(`Deleting ${existing.length} ${tag} customers…`);
  await pool(existing, 4, async (c) => {
    const accounts = (await call(`/customers/${c.id}/accounts?limit=100`)).items ?? [];
    for (const a of accounts) await call(`/accounts/${a.id}`, { method: "DELETE" }).catch((e) => console.warn(`  ${e.message}`));
    await call(`/customers/${c.id}`, { method: "DELETE" }).catch((e) => console.warn(`  ${e.message}`));
  });
  console.log("Done.");
}

/** Makes sure every merchant exists and returns a name → id map. */
export async function ensureMerchants(list) {
  const ids = new Map((await listAll("/merchants")).map((m) => [m.name, m.id]));
  for (const m of list) if (!ids.has(m.name)) ids.set(m.name, (await post("/merchants", { name: m.name, category: m.category })).id);
  return ids;
}

/** Runs one activity step; a failure is reported and skipped so one bad call never stops a customer. */
export async function runActivity(act, merchantIds, label) {
  const cap = act.on.limit ? act.on.limit * 0.1 : act.on.balance * 0.5;
  const amount = cents(Math.min(act.amount, cap));
  try {
    if (act.kind === "deposit") await post(`/accounts/${act.on.id}/deposits`, { amount_cents: amount, description: act.note });
    if (act.kind === "withdrawal") await post(`/accounts/${act.on.id}/withdrawals`, { amount_cents: amount, description: act.note });
    if (act.kind === "purchase") await post(`/accounts/${act.on.id}/purchases`, { merchant_id: merchantIds.get(act.merchant), amount_cents: amount, description: act.merchant });
    if (act.kind === "transfer") await post(`/accounts/${act.on.id}/transfers`, { payee_id: act.to.id, amount_cents: amount, description: act.note });
  } catch (e) {
    console.warn(`  skipped one ${act.kind} for ${label}: ${e.message}`);
  }
}
