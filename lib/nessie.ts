// Server-only client for Capital One's Nessie v2 API. Never import this from a client component:
// it reads NESSIE_KEY from the environment (.env.local), which must stay on the server.

export type NessieAccount = {
  id: string;
  customer_id: string;
  type: "Checking" | "Savings" | "Credit Card";
  nickname: string;
  balance_cents: number; // for a credit card, the amount owed
  available_cents: number;
  pending_debits_cents: number;
  account_number: string;
  credit_limit_cents?: number;
};

export type NessieTxn = {
  id: string;
  kind: string;
  status: "pending" | "completed" | "declined" | "cancelled";
  amount_cents: number;
  payer_id?: string;
  payee_id?: string;
  description?: string;
  decision_reason?: string;
  settle_at: string;
  created_at: string;
  updated_at: string;
};

export class NessieError extends Error {
  constructor(message: string, public status: number, public type?: string) {
    super(message);
  }
}

const BASE = process.env.NESSIE_URL || "https://v2-prod-api.nessieisreal.com";

export function nessieConfigured() {
  return Boolean(process.env.NESSIE_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.NESSIE_KEY;
  if (!key) throw new NessieError("NESSIE_KEY is not set", 500, "not_configured");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new NessieError(body.detail || body.title || res.statusText, res.status, body.type);
  return body as T;
}

export const getAccount = (id: string) => call<NessieAccount>(`/accounts/${id}`);
export const getTransaction = (id: string) => call<NessieTxn>(`/transactions/${id}`);

export function createTransfer(fromId: string, toId: string, amountCents: number, description: string) {
  return call<NessieTxn>(`/accounts/${fromId}/transfers`, {
    method: "POST",
    body: JSON.stringify({ payee_id: toId, amount_cents: amountCents, description }),
  });
}

// Ends the pending window early. On the hosted API the money still moves on the next
// once-a-minute sweep, so callers should poll getTransaction until it completes.
export const settleEarly = (id: string) => call<NessieTxn>(`/transactions/${id}/settle`, { method: "POST" });
