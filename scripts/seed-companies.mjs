// Account and loan types follow what PNC sells to businesses: business checking, savings, money market, sweep and CD accounts,
// business credit cards, term loans, secured and unsecured lines of credit, equipment financing, vehicle loans,
// commercial real estate loans and SBA loans. Nessie only has Checking, Savings and Credit Card accounts, so money
// market, sweep and CD accounts are Savings accounts with those names, and loans go through Nessie's loans endpoint.
//
// Seeds Nessie with mock companies (customers, accounts, loans and activity), each tagged "[Biz]" so they're
// easy to tell apart from the personal demo customer. Same names every run, so re-running only adds what's missing.
//
//   npm run seed:companies                 create up to 60 companies
//   npm run seed:companies -- --count 80   create up to 80
//   npm run seed:companies -- --dry-run    print what would be created, without calling Nessie
//   npm run seed:companies -- --reset      delete every "[Biz]" customer (and its accounts), nothing else
//
// Needs NESSIE_KEY in .env (the script runs with `node --env-file=.env`). It never calls DELETE /data.

import { KEY, between, call, cents, ensureMerchants, fmt, listAll, pick, pool, post, resetTagged, rngFor, roundTo, runActivity } from "./lib/nessie-seed.mjs";

const TAG = "[Biz]";
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const COUNT = Number(args[args.indexOf("--count") + 1]) || 60;
const DRY = flag("dry-run");

// ---------- what a company looks like ----------
const PREFIXES =
  "Lonestar Bluebonnet Pioneer Summit Redwood Harbor Ironwood Magnolia Cedar Falcon Meridian Crescent Prairie Ridgeline Evergreen Granite Beacon Sterling Cobalt Juniper Rio Mesa Alder Tidewater Keystone Northgate Silverline Copperfield Bayou Highland Oakridge Starlight Cardinal Longhorn Riverbend Westfork Kestrel Landmark Brazos Sagebrush Anchor Trailhead Foxglove Pinnacle Ember Horizon Cypress Driftwood Atlas Windmill Marigold Quarry Saddleback Firebrand Clearwater Rosewood Thistle Paloma Bristlecone Vireo Tallgrass"
    .split(" ");

const INDUSTRIES = [
  { name: "Logistics", suffixes: ["Freight Co", "Logistics", "Haulers"], size: [1, 5], loans: ["Equipment Financing", "Vehicle Loan", "Line of Credit"] },
  { name: "Restaurants", suffixes: ["Hospitality Group", "Kitchens", "Restaurant Group"], size: [0.5, 2.5], loans: ["Term Loan", "SBA Loan", "Equipment Financing"] },
  { name: "Construction", suffixes: ["Builders", "Construction", "Contracting"], size: [1, 6], loans: ["Line of Credit", "Equipment Financing", "Vehicle Loan", "Term Loan"] },
  { name: "Software", suffixes: ["Labs", "Systems", "Software"], size: [0.8, 5], loans: ["Line of Credit", "Term Loan"] },
  { name: "Healthcare", suffixes: ["Medical Group", "Health Partners", "Clinics"], size: [1, 5], loans: ["Term Loan", "Commercial Real Estate Loan", "SBA Loan"] },
  { name: "Retail", suffixes: ["Supply Co", "Mercantile", "Outfitters"], size: [0.5, 3], loans: ["Line of Credit", "Term Loan", "SBA Loan"] },
  { name: "Manufacturing", suffixes: ["Industries", "Manufacturing", "Fabrication"], size: [1.5, 6], loans: ["Equipment Financing", "Commercial Real Estate Loan", "Line of Credit"] },
  { name: "Agriculture", suffixes: ["Farms", "Ranch Co", "Growers"], size: [0.6, 4], loans: ["Term Loan", "Commercial Real Estate Loan", "Equipment Financing"] },
  { name: "Energy", suffixes: ["Energy", "Power Services", "Field Services"], size: [2, 6], loans: ["Term Loan", "Equipment Financing", "Line of Credit"] },
  { name: "Real Estate", suffixes: ["Properties", "Realty", "Land Co"], size: [1, 5], loans: ["Commercial Real Estate Loan", "Line of Credit"] },
  { name: "Staffing", suffixes: ["Staffing", "Talent Partners", "Workforce"], size: [1, 4], loans: ["Line of Credit", "Term Loan", "SBA Loan"] },
  { name: "Media", suffixes: ["Studios", "Media", "Creative Co"], size: [0.5, 3], loans: ["Term Loan", "Line of Credit", "Equipment Financing"] },
];

const CITIES = [
  ["Austin", "TX", "78701"], ["Dallas", "TX", "75201"], ["Houston", "TX", "77002"], ["San Antonio", "TX", "78205"],
  ["Fort Worth", "TX", "76102"], ["Plano", "TX", "75024"], ["Denver", "CO", "80202"], ["Atlanta", "GA", "30303"],
  ["Charlotte", "NC", "28202"], ["Phoenix", "AZ", "85004"], ["Nashville", "TN", "37203"], ["Chicago", "IL", "60601"],
];
const STREETS = ["Commerce St", "Industrial Blvd", "Main St", "Market St", "Congress Ave", "Elm St", "Technology Dr", "Riverside Pkwy"];

// Shared vendors that company purchases are paid to.
const MERCHANTS = [
  { name: "Gulf Coast Cloud Hosting", category: "Software" },
  { name: "Summit Office Supply", category: "Office" },
  { name: "Lone Star Fuel Network", category: "Fuel" },
  { name: "Brazos Insurance Group", category: "Insurance" },
  { name: "Capitol Legal & Tax", category: "Professional Services" },
  { name: "Redline Equipment Rental", category: "Equipment" },
  { name: "BlueSky Marketing Agency", category: "Marketing" },
  { name: "Metro Utilities Co-op", category: "Utilities" },
  { name: "Pioneer Wholesale Foods", category: "Supplies" },
  { name: "Northgate Telecom", category: "Telecom" },
  { name: "Keystone Freight Brokers", category: "Shipping" },
  { name: "Ironwood Facilities Services", category: "Facilities" },
  { name: "Harbor Payroll Services", category: "Payroll Services" },
  { name: "Cedar Travel Partners", category: "Travel" },
];

function buildCompany(i) {
  const r = rngFor(1000 + i * 7919);
  const ind = INDUSTRIES[i % INDUSTRIES.length];
  const prefix = PREFIXES[i % PREFIXES.length];
  const name = `${prefix} ${ind.suffixes[Math.floor(i / INDUSTRIES.length) % ind.suffixes.length]}`;
  const size = between(r, ind.size[0], ind.size[1]);
  const [city, state, zip] = pick(r, CITIES);
  const accounts = [];
  const add = (type, nickname, balance, extra = {}) => {
    const a = { type, nickname, balance: roundTo(balance, 100), ...extra };
    accounts.push(a);
    return a;
  };
  const operating = add("Checking", "Business Checking", between(r, 60_000, 380_000) * size);
  const payroll = add("Checking", "Payroll Checking", between(r, 30_000, 160_000) * size);
  add("Savings", "Business Savings", between(r, 25_000, 220_000) * size);
  if (r() < 0.65) add("Savings", "Business Money Market", between(r, 150_000, 1_200_000) * size);
  if (r() < 0.3) add("Savings", "Business CD (12 mo)", between(r, 50_000, 500_000) * size);
  if (size > 2.5 && r() < 0.5) add("Savings", "Sweep Account", between(r, 200_000, 1_500_000) * size);
  const limit = roundTo(between(r, 30_000, 120_000) * size, 5000);
  const card = add("Credit Card", "Business Credit Card", limit * between(r, 0.08, 0.55), { limit });
  if (r() < 0.4) {
    const limit2 = roundTo(between(r, 15_000, 60_000) * size, 5000);
    add("Credit Card", pick(r, ["Business Cash Rewards Card", "Business Travel Rewards Card"]), limit2 * between(r, 0.05, 0.6), { limit: limit2 });
  }

  // Loan sizes and terms follow PNC's business lending: unsecured lines of credit run up to $100k, secured lines and
  // commercial real estate loans start above $100k, real estate terms stretch to 20 years, and SBA loans to 10.
  const loans = [];
  const loanCount = 1 + Math.floor(r() * 3);
  const SHAPE = { "Commercial Real Estate Loan": [3, 20], "SBA Loan": [1.2, 10], "Vehicle Loan": [0.2, 5], "Equipment Financing": [1, 7], "Term Loan": [0.8, 5], "Line of Credit": [0.6, 5] };
  for (let k = 0; k < loanCount; k++) {
    let type = ind.loans[k % ind.loans.length];
    const [scale, years] = SHAPE[type];
    let amount = roundTo(between(r, 80_000, 650_000) * size * scale, 1000);
    if (type === "Commercial Real Estate Loan") amount = Math.max(amount, 150_000);
    if (type === "SBA Loan") amount = Math.min(amount, 5_000_000);
    if (type === "Line of Credit") {
      amount = Math.min(Math.max(amount, 15_000), 2_000_000);
      type = amount <= 100_000 ? "Unsecured Line of Credit" : "Secured Line of Credit";
    }
    loans.push({
      type,
      status: r() < 0.9 ? "Active" : "Late",
      credit_score: Math.round(between(r, 640, 835)),
      amount,
      monthly: roundTo(amount / (years * 12) + (amount * between(r, 0.055, 0.105)) / 12, 10),
      description: `${type} for ${name}`,
    });
  }

  // A burst of recent activity. Each step names the account kind it hits; sizes stay small next to the balances.
  const activity = [];
  for (let k = 0; k < 4 + Math.floor(r() * 3); k++) activity.push({ kind: "deposit", on: operating, amount: operating.balance * between(r, 0.02, 0.1), note: `Customer payments, invoice batch ${100 + Math.floor(r() * 900)}` });
  for (let k = 0; k < 3 + Math.floor(r() * 3); k++) activity.push({ kind: "purchase", on: operating, amount: operating.balance * between(r, 0.005, 0.03), merchant: pick(r, MERCHANTS).name });
  for (let k = 0; k < 4 + Math.floor(r() * 4); k++) activity.push({ kind: "purchase", on: card, amount: card.limit * between(r, 0.01, 0.06), merchant: pick(r, MERCHANTS).name });
  activity.push({ kind: "transfer", on: operating, to: payroll, amount: payroll.balance * between(r, 0.05, 0.12), note: "Fund payroll" });
  for (let k = 0; k < 1 + Math.floor(r() * 2); k++) activity.push({ kind: "withdrawal", on: payroll, amount: payroll.balance * between(r, 0.05, 0.12), note: "Payroll run" });

  return { name, industry: ind.name, address: { street_number: String(100 + Math.floor(r() * 9800)), street_name: pick(r, STREETS), city, state, zip }, accounts, loans, activity };
}

// ---------- Nessie calls ----------
async function seedCompany(co, merchantIds) {
  const customer = await post("/customers", { first_name: `${co.name} ${TAG}`, last_name: co.industry, address: co.address });
  for (const a of co.accounts) {
    const created = await post(`/customers/${customer.id}/accounts`, {
      type: a.type,
      nickname: a.nickname,
      balance_cents: cents(a.balance),
      ...(a.type === "Credit Card" ? { credit_limit_cents: cents(a.limit) } : {}),
    });
    a.id = created.id;
  }
  const operating = co.accounts[0];
  for (const l of co.loans) {
    await post(`/accounts/${operating.id}/loans`, {
      type: l.type, status: l.status, credit_score: l.credit_score, amount_cents: cents(l.amount), monthly_payment_cents: cents(l.monthly), description: l.description,
    });
  }
  for (const act of co.activity) await runActivity(act, merchantIds, co.name);
  return customer.id;
}

// ---------- run ----------
const companies = Array.from({ length: COUNT }, (_, i) => buildCompany(i));

if (DRY) {
  const cash = companies.flatMap((c) => c.accounts).filter((a) => a.type !== "Credit Card").reduce((s, a) => s + a.balance, 0);
  console.log(`${companies.length} companies, ${companies.reduce((s, c) => s + c.accounts.length, 0)} accounts, ${companies.reduce((s, c) => s + c.loans.length, 0)} loans, ${companies.reduce((s, c) => s + c.activity.length, 0)} transactions. Cash on hand across all: ${fmt(cash)}.`);
  for (const c of companies.slice(0, 3)) {
    console.log(`\n${c.name} ${TAG} (${c.industry}, ${c.address.city} ${c.address.state})`);
    for (const a of c.accounts) console.log(`  ${a.type.padEnd(11)} ${a.nickname.padEnd(24)} ${fmt(a.balance)}${a.limit ? ` of ${fmt(a.limit)} limit` : ""}`);
    for (const l of c.loans) console.log(`  Loan        ${l.type.padEnd(24)} ${fmt(l.amount)} · ${fmt(l.monthly)}/mo`);
  }
  process.exit(0);
}

if (!KEY) {
  console.error("NESSIE_KEY isn't set. Uncomment it in .env, then run: npm run seed:companies");
  process.exit(1);
}

const existing = (await listAll("/customers")).filter((c) => c.first_name.endsWith(TAG));

if (flag("reset")) {
  await resetTagged(TAG);
  process.exit(0);
}

const have = new Set(existing.map((c) => c.first_name));
const todo = companies.filter((c) => !have.has(`${c.name} ${TAG}`));
console.log(`${existing.length} companies already in Nessie, creating ${todo.length} more.`);
if (!todo.length) process.exit(0);

const merchantIds = await ensureMerchants(MERCHANTS);

let done = 0;
await pool(todo, 4, async (co) => {
  try {
    await seedCompany(co, merchantIds);
    console.log(`  ${++done}/${todo.length} ${co.name}`);
  } catch (e) {
    console.warn(`  failed ${co.name}: ${e.message}`);
  }
});
console.log("Done. Open the dashboard and choose Company.");
