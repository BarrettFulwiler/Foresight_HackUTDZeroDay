// The kinds of accounts a member can add on the Accounts tab, and the rules every amount must pass.
// Safe on both sides: the form uses validate() for instant feedback, and the server runs it again before Nessie.

export type Audience = "individual" | "company";
export type FieldKey = "balance" | "owed" | "limit" | "rate" | "apr" | "monthly";
export type ProductId =
  | "checking" | "savings" | "money_market" | "cd" | "credit_card" | "ira" | "personal_loan" | "mortgage"
  | "business_checking" | "business_savings" | "business_money_market" | "business_cd" | "business_card"
  | "line_of_credit" | "commercial_loan" | "merchant_services"
  | "business_checking_plus" | "treasury_enterprise" | "analysis_checking" | "commercial_banking";

export type Product = {
  id: ProductId;
  label: string;
  audience: Audience;
  // Where it lives in Nessie: a Checking, Savings or Credit Card account, or a loan.
  nessie: "Checking" | "Savings" | "Credit Card" | "Loan";
  // How the dashboard and forecast treat it (lib/finance.ts Account.type and kind).
  appType: string;
  kind: "cash" | "investment" | "credit" | "loan";
  fields: FieldKey[]; // asked for, in this order
  optional?: FieldKey[]; // may be left blank (counts as 0)
  example: string; // placeholder for the account name
  legacy?: boolean; // no longer offered when adding; existing ones still work
};

export const PRODUCTS: Product[] = [
  { id: "checking", label: "Checking", audience: "individual", nessie: "Checking", appType: "checking", kind: "cash", fields: ["balance"], example: "Everyday Checking" },
  { id: "savings", label: "Savings", audience: "individual", nessie: "Savings", appType: "savings", kind: "cash", fields: ["balance", "rate"], optional: ["rate"], example: "Emergency Savings" },
  { id: "money_market", label: "Money Market", audience: "individual", nessie: "Savings", appType: "money_market", kind: "cash", fields: ["balance", "rate"], optional: ["rate"], example: "Money Market" },
  { id: "cd", label: "Certificate of Deposit", audience: "individual", nessie: "Savings", appType: "cd", kind: "investment", fields: ["balance", "rate"], optional: ["rate"], example: "12-Month CD" },
  { id: "credit_card", label: "Credit Card", audience: "individual", nessie: "Credit Card", appType: "credit_card", kind: "credit", fields: ["owed", "limit", "apr"], example: "Cash Rewards Card" },
  { id: "ira", label: "Retirement / IRA", audience: "individual", nessie: "Savings", appType: "ira", kind: "investment", fields: ["balance", "rate"], optional: ["rate"], example: "Roth IRA" },
  { id: "personal_loan", label: "Personal Loan", audience: "individual", nessie: "Loan", appType: "personal_loan", kind: "loan", fields: ["owed", "monthly", "apr"], example: "Personal Loan" },
  { id: "mortgage", label: "Mortgage", audience: "individual", nessie: "Loan", appType: "mortgage", kind: "loan", fields: ["owed", "monthly", "apr"], example: "Home Mortgage" },

  // Companies: PNC's business account lineup. All are deposit accounts, so each asks for its balance.
  { id: "business_checking", label: "Business Checking", audience: "company", nessie: "Checking", appType: "checking", kind: "cash", fields: ["balance"], example: "Operating Account" },
  { id: "business_checking_plus", label: "Business Checking Plus", audience: "company", nessie: "Checking", appType: "checking", kind: "cash", fields: ["balance"], example: "Business Checking Plus" },
  { id: "treasury_enterprise", label: "Treasury Enterprise Plan", audience: "company", nessie: "Savings", appType: "savings", kind: "cash", fields: ["balance", "rate"], optional: ["rate"], example: "Treasury Reserve" },
  { id: "analysis_checking", label: "Analysis Business Checking", audience: "company", nessie: "Checking", appType: "checking", kind: "cash", fields: ["balance"], example: "Analysis Checking" },
  { id: "commercial_banking", label: "Commercial Banking", audience: "company", nessie: "Checking", appType: "checking", kind: "cash", fields: ["balance"], example: "Commercial Account" },

  // Earlier company accounts: no longer offered, kept so accounts already added still show and can be edited.
  { id: "business_savings", label: "Business Savings", audience: "company", legacy: true, nessie: "Savings", appType: "savings", kind: "cash", fields: ["balance", "rate"], optional: ["rate"], example: "Tax Reserve" },
  { id: "business_money_market", label: "Business Money Market", audience: "company", legacy: true, nessie: "Savings", appType: "money_market", kind: "cash", fields: ["balance", "rate"], optional: ["rate"], example: "Business Money Market" },
  { id: "business_cd", label: "Business Certificate of Deposit", audience: "company", legacy: true, nessie: "Savings", appType: "cd", kind: "investment", fields: ["balance", "rate"], optional: ["rate"], example: "12-Month Business CD" },
  { id: "business_card", label: "Corporate / Business Credit Card", audience: "company", legacy: true, nessie: "Credit Card", appType: "credit_card", kind: "credit", fields: ["owed", "limit", "apr"], example: "Business Credit Card" },
  { id: "line_of_credit", label: "Business Line of Credit", audience: "company", legacy: true, nessie: "Loan", appType: "line_of_credit", kind: "loan", fields: ["owed", "limit", "monthly", "apr"], optional: ["monthly"], example: "Business Line of Credit" },
  { id: "commercial_loan", label: "Commercial Loan", audience: "company", legacy: true, nessie: "Loan", appType: "business_loan", kind: "loan", fields: ["owed", "monthly", "apr"], example: "Equipment Loan" },
  { id: "merchant_services", label: "Merchant Services / Treasury", audience: "company", legacy: true, nessie: "Checking", appType: "merchant", kind: "cash", fields: ["balance"], example: "Merchant Deposits" },
];

export const productsFor = (audience: Audience) => PRODUCTS.filter((p) => p.audience === audience && !p.legacy);
export const product = (id: string) => PRODUCTS.find((p) => p.id === id);

/** The label for a field, worded for the product (a card's "Balance owed", a line of credit's "Amount drawn"). */
export function fieldLabel(p: Product, f: FieldKey) {
  switch (f) {
    case "balance": return "Balance";
    case "owed": return p.nessie === "Credit Card" ? "Balance owed" : p.id === "line_of_credit" ? "Amount drawn" : "Amount owed";
    case "limit": return p.id === "line_of_credit" ? "Credit line" : "Credit limit";
    case "rate": return p.id === "ira" ? "Expected yearly return (%)" : "Interest rate (APY %)";
    case "apr": return "APR (%)";
    case "monthly": return "Monthly payment";
  }
}
export const isMoney = (f: FieldKey) => f !== "rate" && f !== "apr";

export const MAX_AMOUNT = 10_000_000_000; // $10 billion: far above any real account, catches typos and overflow
export const NAME_MAX = 40; // Nessie's limit for an account nickname

export type Values = Partial<Record<FieldKey, number>>;
export type Errors = Partial<Record<FieldKey | "name" | "product", string>>;

/** Parses what the person typed ("1,250.50", "$300") into a number, or NaN if it isn't one. */
export function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return NaN;
  const s = raw.replace(/[$,\s%]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

/**
 * Checks an account before it's saved. Returns the cleaned name and values (money rounded to cents), or errors
 * keyed by field. Rules: nothing negative, money has at most 2 decimals, a card can't owe more than its limit,
 * a loan must owe something and its payment must cover at least the interest.
 */
export function validate(p: Product | undefined, nameRaw: unknown, raw: Partial<Record<FieldKey, unknown>>): { ok: true; name: string; values: Values } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  if (!p) return { ok: false, errors: { product: "Choose what kind of account this is." } };
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) errors.name = "Give the account a name.";
  else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters or fewer.`;

  const values: Values = {};
  for (const f of p.fields) {
    const blank = raw[f] === undefined || raw[f] === null || (typeof raw[f] === "string" && (raw[f] as string).trim() === "");
    if (blank) {
      if (p.optional?.includes(f)) values[f] = 0;
      else errors[f] = `Enter the ${fieldLabel(p, f).replace(/ \(.*\)$/, "").toLowerCase()}.`;
      continue;
    }
    const n = parseAmount(raw[f]);
    if (!Number.isFinite(n)) { errors[f] = "Enter a number, like 1250.50."; continue; }
    if (n < 0) { errors[f] = `${fieldLabel(p, f).replace(/ \(.*\)$/, "")} can't be negative.`; continue; }
    if (isMoney(f)) {
      if (Math.round(n * 100) !== Math.round(n * 1000) / 10) { errors[f] = "Use at most 2 decimal places (cents)."; continue; }
      if (n > MAX_AMOUNT) { errors[f] = "That's more than $10 billion. Check the amount."; continue; }
      values[f] = Math.round(n * 100) / 100;
    } else {
      const max = f === "rate" ? 25 : 100;
      if (n > max) { errors[f] = `Enter a rate between 0 and ${max}%.`; continue; }
      values[f] = Math.round(n * 1000) / 1000;
    }
  }

  // Rules that compare fields.
  const { owed = 0, limit, monthly = 0, apr = 0 } = values;
  if (p.fields.includes("limit") && limit !== undefined && !errors.limit) {
    if (limit <= 0) errors.limit = `The ${fieldLabel(p, "limit").toLowerCase()} must be more than $0.`;
    else if (!errors.owed && owed > limit) errors.owed = `${fieldLabel(p, "owed")} can't be more than the ${fieldLabel(p, "limit").toLowerCase()}.`;
  }
  if (p.nessie === "Loan" && !errors.owed && !errors.monthly && !errors.apr) {
    const interest = (owed * apr) / 1200; // one month's interest
    const needsPayment = p.id !== "line_of_credit" || owed > 0;
    if (p.id !== "line_of_credit" && owed <= 0) errors.owed = "A loan has to owe more than $0. Remove it instead if it's paid off.";
    else if (needsPayment && monthly <= 0) errors.monthly = "Enter the monthly payment.";
    else if (needsPayment && monthly <= interest) errors.monthly = `This payment doesn't cover the monthly interest (about $${interest.toFixed(2)}), so it would never be paid off.`;
    else if (monthly > owed + interest && owed > 0) errors.monthly = "The monthly payment is more than what's owed.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, name, values };
}

// ---------- Income and expenses (recurring, monthly) ----------
// Each one is stored in Nessie as a recurring bill on the account it lands in or is paid from (lib/member-accounts.ts).
export type FlowKind = "income" | "expense";
export const EXPENSE_CATEGORIES: Record<Audience, { id: string; label: string }[]> = {
  individual: [
    { id: "housing", label: "Housing (rent, HOA)" },
    { id: "utilities", label: "Utilities & phone" },
    { id: "groceries", label: "Groceries" },
    { id: "dining", label: "Dining" },
    { id: "transport", label: "Transport & gas" },
    { id: "shopping", label: "Shopping" },
    { id: "other_spending", label: "Other" },
  ],
  company: [
    { id: "payroll", label: "Payroll" },
    { id: "facilities", label: "Rent, facilities & utilities" },
    { id: "supplies", label: "Supplies & inventory" },
    { id: "software", label: "Software & telecom" },
    { id: "professional", label: "Insurance, legal & tax" },
    { id: "marketing", label: "Marketing" },
    { id: "fuel_equipment", label: "Fuel & equipment" },
    { id: "shipping_travel", label: "Shipping & travel" },
    { id: "other_spending", label: "Other" },
  ],
};

export type FlowInput = { name?: unknown; amount?: unknown; accountId?: unknown; day?: unknown; category?: unknown };
export type FlowErrors = Partial<Record<"name" | "amount" | "accountId" | "day" | "category", string>>;

/**
 * Checks one income source or expense. accounts: the member's own accounts it may use (income only lands in bank
 * accounts; expenses can be paid from a bank account or a credit card).
 */
export function validateFlow(kind: FlowKind, audience: Audience, input: FlowInput, accounts: { id: string; kind: string }[]):
  { ok: true; name: string; amount: number; accountId: string; day: number; category: string } | { ok: false; errors: FlowErrors } {
  const errors: FlowErrors = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = kind === "income" ? "Name the income source." : "Name the expense.";
  else if (name.length > 60) errors.name = "Keep the name to 60 characters or fewer.";

  const amount = parseAmount(input.amount);
  if (input.amount === undefined || input.amount === "") errors.amount = "Enter the monthly amount.";
  else if (!Number.isFinite(amount)) errors.amount = "Enter a number, like 1250.50.";
  else if (amount <= 0) errors.amount = "The amount has to be more than $0.";
  else if (Math.round(amount * 100) !== Math.round(amount * 1000) / 10) errors.amount = "Use at most 2 decimal places (cents).";
  else if (amount > MAX_AMOUNT) errors.amount = "That's more than $10 billion. Check the amount.";

  const day = Number(input.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) errors.day = "Pick a day of the month from 1 to 31.";

  const accountId = typeof input.accountId === "string" ? input.accountId : "";
  const acct = accounts.find((a) => a.id === accountId);
  const allowed = kind === "income" ? ["cash", "investment"] : ["cash", "investment", "credit"];
  if (!acct) errors.accountId = kind === "income" ? "Choose the account it's paid into." : "Choose the account it's paid from.";
  else if (!allowed.includes(acct.kind)) errors.accountId = kind === "income" ? "Income can only go into a bank account." : "Pay it from a bank account or credit card.";

  let category = "income";
  if (kind === "expense") {
    category = typeof input.category === "string" ? input.category : "";
    if (!EXPENSE_CATEGORIES[audience].some((c) => c.id === category)) errors.category = "Choose a category.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, name, amount: Math.round(amount * 100) / 100, accountId, day, category };
}
