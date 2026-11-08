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
/** All of a customer's accounts in one request (cheaper than one call per account, which trips Nessie's rate limit). */
export const listCustomerAccounts = (customerId: string) => call<{ items: NessieAccount[] }>(`/customers/${customerId}/accounts`).then((r) => r.items);
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

// ---------- Customers for signed-up users (see lib/auth.ts) ----------
type Address = { street_number: string; street_name: string; city: string; state: string; zip: string };
// Nessie requires an address, but sign-up doesn't ask for one, so new customers get a placeholder until they add theirs.
const PLACEHOLDER_ADDRESS: Address = { street_number: "0", street_name: "Not provided", city: "Not provided", state: "TX", zip: "00000" };

export const createCustomer = (firstName: string, lastName: string) =>
  call<{ id: string }>("/customers", { method: "POST", body: JSON.stringify({ first_name: firstName, last_name: lastName, address: PLACEHOLDER_ADDRESS }) });

export const openAccount = (customerId: string, type: "Checking" | "Savings", nickname: string) =>
  call<NessieAccount>(`/customers/${customerId}/accounts`, { method: "POST", body: JSON.stringify({ type, nickname, balance_cents: 0 }) });

/** Removes a customer and its accounts. Used to undo a sign-up that failed halfway. */
export async function deleteCustomer(customerId: string) {
  const accounts = await listCustomerAccounts(customerId).catch(() => [] as NessieAccount[]);
  for (const a of accounts) await call(`/accounts/${a.id}`, { method: "DELETE" }).catch(() => {});
  await call(`/customers/${customerId}`, { method: "DELETE" }).catch(() => {});
}
