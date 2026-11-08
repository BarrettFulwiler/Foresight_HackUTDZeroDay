// Seeds Nessie with mock individuals (customers, accounts, loans and activity), each tagged "[Ind]".
// Same names every run, so re-running only adds what's missing.
//
//   npm run seed:individuals                 create up to 100 people
//   npm run seed:individuals -- --count 150  create up to 150
//   npm run seed:individuals -- --dry-run    print what would be created (and how it compares to the research)
//   npm run seed:individuals -- --reset      delete every "[Ind]" customer (and its accounts), nothing else
//
// The numbers follow US survey data, so the people look like real households: a few have a lot, most have a little.
//   Federal Reserve, Survey of Consumer Finances 2022: median checking, transaction-account and retirement balances by age.
//   Experian consumer debt study 2025: average credit card ($6,768), auto ($24,731), student ($33,255), mortgage (~$261k)
//   and personal-loan balances among people who have them.
// Ownership rates and the 65+ retirement medians are rounded estimates, not exact survey figures.
//
// Account and loan types follow what PNC sells to individuals: checking (some on the Virtual Wallet bundle), savings,
// money market, CDs, IRAs, cash-back and secured credit cards, mortgages, home equity lines of credit, auto, student
// and personal loans. Nessie only has Checking, Savings and Credit Card accounts, so money market, CD and IRA accounts
// are Savings accounts with those names, and loans go through Nessie's loans endpoint.

import { KEY, between, cents, ensureMerchants, fmt, pick, pool, post, resetTagged, rngFor, roundTo, runActivity, listAll } from "./lib/nessie-seed.mjs";

const TAG = "[Ind]";
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const COUNT = Number(args[args.indexOf("--count") + 1]) || 100;
const DRY = flag("dry-run");

// ---------- who they are ----------
const FIRST = "Maria James Aisha Daniel Priya Marcus Sofia Tyler Hannah Luis Grace Omar Emily Andre Natalie Kevin Rosa Brandon Mei Carlos Jasmine Ethan Linda Raj Olivia Miguel Tanya Noah Angela Victor Chloe Darnell Elena Jorge Fatima Patrick Camila Owen Naomi Samuel Ingrid Leo Dana Hector Alicia Trevor Yuki Gabriel Whitney Anil".split(" ");
const LAST = "Garcia Johnson Nguyen Patel Williams Martinez Brown Kim Hernandez Davis Lopez Wilson Anderson Thomas Moore Jackson Lee Gonzalez Harris Clark Lewis Robinson Walker Young Allen King Wright Scott Torres Hill Flores Green Adams Nelson Baker Rivera Campbell Mitchell Carter Roberts Phillips Evans Turner Parker Collins Edwards Stewart Morris Reed Cook".split(" ");
const CITIES = [
  ["Austin", "TX", "78701"], ["Dallas", "TX", "75201"], ["Houston", "TX", "77002"], ["San Antonio", "TX", "78205"], ["Plano", "TX", "75024"],
  ["Denver", "CO", "80202"], ["Atlanta", "GA", "30303"], ["Charlotte", "NC", "28202"], ["Phoenix", "AZ", "85004"], ["Nashville", "TN", "37203"],
  ["Chicago", "IL", "60601"], ["Columbus", "OH", "43215"], ["Seattle", "WA", "98101"], ["Tampa", "FL", "33602"], ["Richmond", "VA", "23219"],
];
const STREETS = ["Oak St", "Maple Ave", "Cedar Ln", "Park Blvd", "Elm St", "Sunset Dr", "Lakeview Rd", "Willow Way", "Pine St", "Main St"];

// Shared places they spend money.
const MERCHANTS = [
  { name: "Lone Star Grocers", category: "Groceries" },
  { name: "Corner Pantry Market", category: "Groceries" },
  { name: "Quick Stop Fuel", category: "Gas" },
  { name: "Bluebonnet Cafe", category: "Dining" },
  { name: "Taco Row", category: "Dining" },
  { name: "StreamBox Subscription", category: "Entertainment" },
  { name: "Metro Power & Light", category: "Utilities" },
  { name: "Clear Wave Internet", category: "Utilities" },
  { name: "Wellness Pharmacy", category: "Health" },
  { name: "Urban Threads", category: "Shopping" },
  { name: "RideNow", category: "Transport" },
  { name: "Peak Fitness Club", category: "Health" },
  { name: "Maple Ridge Apartments", category: "Rent" },
  { name: "HomeStyle Hardware", category: "Home" },
];
const EVERYDAY = MERCHANTS.filter((m) => !["Rent", "Utilities"].includes(m.category));

// ---------- what US households hold, by age: under 35, 35-44, 45-54, 55-64, 65-74, 75+ ----------
const BRACKETS = [
  { ages: [22, 34], weight: 0.28, checking: 1600, savings: 2500, saveOwn: 0.55, retire: 18880, retireOwn: 0.45, income: 48000, score: 670, mort: 0.18, auto: 0.35, student: 0.35, personal: 0.1, cardLimit: 6000, cardOwn: 0.75, cd: 0.02 },
  { ages: [35, 44], weight: 0.18, checking: 2500, savings: 4000, saveOwn: 0.62, retire: 45000, retireOwn: 0.55, income: 68000, score: 690, mort: 0.45, auto: 0.4, student: 0.2, personal: 0.11, cardLimit: 12000, cardOwn: 0.85, cd: 0.03 },
  { ages: [45, 54], weight: 0.17, checking: 3400, savings: 4500, saveOwn: 0.65, retire: 115000, retireOwn: 0.58, income: 72000, score: 710, mort: 0.5, auto: 0.38, student: 0.1, personal: 0.1, cardLimit: 16000, cardOwn: 0.88, cd: 0.04 },
  { ages: [55, 64], weight: 0.17, checking: 3500, savings: 4000, saveOwn: 0.68, retire: 185000, retireOwn: 0.58, income: 70000, score: 730, mort: 0.45, auto: 0.32, student: 0.06, personal: 0.08, cardLimit: 18000, cardOwn: 0.9, cd: 0.06 },
  { ages: [65, 74], weight: 0.12, checking: 3100, savings: 8000, saveOwn: 0.75, retire: 200000, retireOwn: 0.5, income: 45000, score: 750, mort: 0.32, auto: 0.22, student: 0.02, personal: 0.05, cardLimit: 18000, cardOwn: 0.9, cd: 0.1 },
  { ages: [75, 84], weight: 0.08, checking: 3300, savings: 6000, saveOwn: 0.75, retire: 130000, retireOwn: 0.35, income: 40000, score: 760, mort: 0.18, auto: 0.12, student: 0.01, personal: 0.03, cardLimit: 15000, cardOwn: 0.85, cd: 0.12 },
];

// A skewed amount: `median` is the typical value, `sigma` how stretched the top is (most people small, a few large).
function skewed(r, median, sigma, max) {
  const gauss = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Math.min(max ?? Infinity, median * Math.exp(sigma * gauss));
}
const monthlyPayment = (principal, apr, months) => {
  const i = apr / 12;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
};

function buildPerson(i, taken) {
  const r = rngFor(5000 + i * 104729);
  const b = (() => {
    let x = r();
    for (const k of BRACKETS) if ((x -= k.weight) < 0) return k;
    return BRACKETS[0];
  })();
  const age = Math.round(between(r, b.ages[0], b.ages[1]));
  const retired = age >= 66;

  let first, last, name;
  do {
    first = pick(r, FIRST);
    last = pick(r, LAST);
    name = `${first} ${last}`;
  } while (taken.has(name));
  taken.add(name);
  const [city, state, zip] = pick(r, CITIES);
  const income = skewed(r, b.income, 0.45, 400_000);
  const net = (income * 0.78) / 12; // monthly take-home

  const accounts = [];
  const add = (type, nickname, balance, extra = {}) => {
    const a = { type, nickname, balance: Math.max(25, roundTo(balance, 1)), ...extra };
    accounts.push(a);
    return a;
  };
  const wallet = r() < 0.35; // PNC's Virtual Wallet bundles a spending account with savings
  const checking = add("Checking", wallet ? "Virtual Wallet Spend" : "Everyday Checking", skewed(r, b.checking, 1.3, 150_000));
  const savings = r() < b.saveOwn ? add("Savings", wallet ? "Virtual Wallet Reserve" : r() < 0.5 ? "Savings" : "Emergency Fund", skewed(r, b.savings, 1.4, 250_000)) : null;
  if (r() < 0.1) add("Savings", "Money Market", skewed(r, 12_000, 1.0, 200_000));
  if (r() < b.retireOwn) add("Savings", r() < 0.55 ? "Traditional IRA" : "Roth IRA", skewed(r, b.retire, 1.4, 2_000_000));
  if (r() < b.cd) add("Savings", pick(r, ["12-Month CD", "24-Month CD", "IRA CD"]), skewed(r, 15_000, 0.9, 150_000));
  const score = Math.round(Math.min(840, Math.max(520, skewed(r, b.score, 0.07))));
  let card = null;
  if (r() < b.cardOwn) {
    // Lower scores and the youngest adults start on a secured card, which has a small deposit-backed limit.
    const secured = score < 620 || (age < 25 && r() < 0.5);
    const limit = secured ? roundTo(between(r, 300, 1500), 100) : roundTo(skewed(r, b.cardLimit, 0.8, 80_000), 500) || 500;
    // About half carry a balance; those who do owe roughly the national average (~$6.8k), never over the limit.
    const owed = r() < 0.55 ? Math.min(limit * 0.95, skewed(r, 4200, 1.0)) : limit * between(r, 0, 0.08);
    card = add("Credit Card", secured ? "Secured Card" : "Cash Rewards Card", owed, { limit });
    if (!secured && r() < 0.3) add("Credit Card", "Store Card", Math.min(3000, owed * 0.3), { limit: roundTo(limit * 0.4, 500) || 500 });
  }

  const loans = [];
  const addLoan = (type, amount, apr, months, description) =>
    loans.push({ type, status: r() < 0.94 ? "Active" : "Late", credit_score: score, amount: roundTo(amount, 10), monthly: roundTo(monthlyPayment(amount, apr, months), 1), description });
  if (r() < b.mort) {
    const principal = skewed(r, 245_000, 0.5, 900_000);
    const left = principal * (age < 40 ? between(r, 0.85, 1) : between(r, 0.35, 0.9));
    addLoan("Mortgage", Math.max(60_000, left), between(r, 0.03, 0.07), 360 - (age < 40 ? 24 : 120), "30-year fixed home loan");
    if (r() < 0.12) addLoan("Home Equity Line of Credit", skewed(r, 30_000, 0.6, 250_000), between(r, 0.07, 0.095), 180, "Home equity line of credit");
  }
  if (r() < b.auto) addLoan("Auto Loan", skewed(r, 22_000, 0.5, 90_000), between(r, 0.05, 0.11), 60, "New or used car loan");
  if (r() < b.student) addLoan("Student Loan", skewed(r, 22_000, 0.65, 150_000), between(r, 0.04, 0.075), 120, "Student loan");
  if (r() < b.personal) addLoan("Personal Loan", skewed(r, 9000, 0.6, 35_000), between(r, 0.09, 0.18), 48, "Personal loan");

  // Recent activity. Paychecks land first so the checking account can cover what follows.
  const activity = [];
  const paychecks = retired ? 1 : 2;
  for (let k = 0; k < paychecks; k++)
    activity.push({ kind: "deposit", on: checking, amount: retired ? net : net / 2, note: retired ? "Social Security and pension deposit" : "Direct deposit, paycheck" });
  const rents = !loans.some((l) => l.type === "Mortgage") && r() < 0.6;
  if (rents) activity.push({ kind: "purchase", on: checking, amount: Math.min(net * 0.3, 2400), merchant: "Maple Ridge Apartments" });
  activity.push({ kind: "purchase", on: checking, amount: between(r, 70, 220), merchant: pick(r, MERCHANTS.filter((m) => m.category === "Utilities")).name });
  for (let k = 0; k < 3 + Math.floor(r() * 3); k++) activity.push({ kind: "purchase", on: checking, amount: between(r, 12, 140), merchant: pick(r, EVERYDAY).name });
  if (card) for (let k = 0; k < 3 + Math.floor(r() * 4); k++) activity.push({ kind: "purchase", on: card, amount: between(r, 10, 220), merchant: pick(r, EVERYDAY).name });
  if (savings) activity.push({ kind: "transfer", on: checking, to: savings, amount: net * between(r, 0.04, 0.1), note: "Monthly savings" });

  return { name, first, last, age, income, address: { street_number: String(100 + Math.floor(r() * 9800)), street_name: pick(r, STREETS), city, state, zip }, accounts, loans, activity };
}

async function seedPerson(p, merchantIds) {
  const customer = await post("/customers", { first_name: `${p.first} ${TAG}`, last_name: p.last, address: p.address });
  for (const a of p.accounts) {
    const created = await post(`/customers/${customer.id}/accounts`, {
      type: a.type,
      nickname: a.nickname,
      balance_cents: cents(a.balance),
      ...(a.type === "Credit Card" ? { credit_limit_cents: cents(a.limit) } : {}),
    });
    a.id = created.id;
  }
  for (const l of p.loans) {
    await post(`/accounts/${p.accounts[0].id}/loans`, {
      type: l.type, status: l.status, credit_score: l.credit_score, amount_cents: cents(l.amount), monthly_payment_cents: cents(l.monthly), description: l.description,
    });
  }
  for (const act of p.activity) await runActivity(act, merchantIds, p.name);
}

// ---------- run ----------
const taken = new Set();
const people = Array.from({ length: COUNT }, (_, i) => buildPerson(i, taken));

if (DRY) {
  const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const mean = (xs) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0);
  const of = (nick) => people.flatMap((p) => p.accounts).filter((a) => a.nickname === nick).map((a) => a.balance);
  const checking = of("Everyday Checking");
  const saved = people.flatMap((p) => p.accounts).filter((a) => ["Savings", "Emergency Fund", "Virtual Wallet Reserve"].includes(a.nickname)).map((a) => a.balance);
  const retire = people.flatMap((p) => p.accounts).filter((a) => /IRA$/.test(a.nickname) && !/CD/.test(a.nickname)).map((a) => a.balance);
  const owedCards = people.flatMap((p) => p.accounts).filter((a) => a.nickname === "Cash Rewards Card" && a.balance > a.limit * 0.1).map((a) => a.balance);
  const loanAvg = (t) => mean(people.flatMap((p) => p.loans).filter((l) => l.type === t).map((l) => l.amount));
  const has = (pred) => Math.round((people.filter(pred).length / people.length) * 100);
  console.log(`${people.length} people, ${people.reduce((s, p) => s + p.accounts.length, 0)} accounts, ${people.reduce((s, p) => s + p.loans.length, 0)} loans, ${people.reduce((s, p) => s + p.activity.length, 0)} transactions.\n`);
  console.log("                              this set     national figure");
  console.log(`checking, median              ${fmt(med(checking)).padStart(9)}     about $3,000 (SCF 2022, by age $1,600 to $3,500)`);
  console.log(`savings, median               ${fmt(med(saved)).padStart(9)}     about $4,500 among savers`);
  console.log(`retirement, median            ${fmt(med(retire)).padStart(9)}     $18,880 under 35 up to $185,000 at 55-64`);
  console.log(`card balance, average         ${fmt(mean(owedCards)).padStart(9)}     $6,768 (Experian 2025, those carrying a balance)`);
  console.log(`auto loan, average            ${fmt(loanAvg("Auto Loan")).padStart(9)}     $24,731`);
  console.log(`student loan, average         ${fmt(loanAvg("Student Loan")).padStart(9)}     $33,255`);
  console.log(`mortgage, average             ${fmt(loanAvg("Mortgage")).padStart(9)}     about $261,000`);
  console.log(`own a credit card / any loan  ${has((p) => p.accounts.some((a) => a.type === "Credit Card"))}% / ${has((p) => p.loans.length > 0)}%`);
  for (const p of people.slice(0, 3)) {
    console.log(`\n${p.name} ${TAG} (age ${p.age}, ${p.address.city} ${p.address.state}, earns ${fmt(p.income)})`);
    for (const a of p.accounts) console.log(`  ${a.type.padEnd(11)} ${a.nickname.padEnd(22)} ${fmt(a.balance)}${a.limit ? ` of ${fmt(a.limit)} limit` : ""}`);
    for (const l of p.loans) console.log(`  Loan        ${l.type.padEnd(22)} ${fmt(l.amount)} · ${fmt(l.monthly)}/mo`);
  }
  process.exit(0);
}

if (!KEY) {
  console.error("NESSIE_KEY isn't set. Add it to .env, then run: npm run seed:individuals");
  process.exit(1);
}

if (flag("reset")) {
  await resetTagged(TAG);
  process.exit(0);
}

const existing = (await listAll("/customers")).filter((c) => c.first_name.endsWith(TAG));
const have = new Set(existing.map((c) => `${c.first_name} ${c.last_name}`));
const todo = people.filter((p) => !have.has(`${p.first} ${TAG} ${p.last}`));
console.log(`${existing.length} people already in Nessie, creating ${todo.length} more.`);
if (!todo.length) process.exit(0);

const merchantIds = await ensureMerchants(MERCHANTS);
let done = 0;
await pool(todo, 4, async (p) => {
  try {
    await seedPerson(p, merchantIds);
    console.log(`  ${++done}/${todo.length} ${p.name}`);
  } catch (e) {
    console.warn(`  failed ${p.name}: ${e.message}`);
  }
});
console.log("Done.");
