"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "../../lib/brand";
import { categoryMeta, longMonth, money, shortMonth } from "../../lib/format";
import { DEMO_PREFS, type GoalKind, type Prefs, goalOption, goalOptionsFor, monthsUntil, savePrefs } from "../../lib/prefs";
import type { Summary } from "../../lib/summary";
import { markDemo } from "../../lib/auth-client";
import DatePicker, { formatDate } from "./date-picker";
import styles from "./onboarding.module.css";

const STEPS = ["Who it's for", "Location", "Your view", "Goals", "Consent"];
// Regions per country, as [code, name]. The label above the list changes with the country.
const REGIONS: Record<string, { label: string; list: [string, string][] }> = {
  US: {
    label: "State",
    list: [
      ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
      ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
      ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
      ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
      ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
      ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
      ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
      ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
    ],
  },
  MX: {
    label: "State",
    list: [
      ["AGU", "Aguascalientes"], ["BCN", "Baja California"], ["BCS", "Baja California Sur"], ["CAM", "Campeche"], ["CHP", "Chiapas"],
      ["CHH", "Chihuahua"], ["CMX", "Ciudad de México"], ["COA", "Coahuila"], ["COL", "Colima"], ["DUR", "Durango"], ["GUA", "Guanajuato"],
      ["GRO", "Guerrero"], ["HID", "Hidalgo"], ["JAL", "Jalisco"], ["MEX", "Estado de México"], ["MIC", "Michoacán"], ["MOR", "Morelos"],
      ["NAY", "Nayarit"], ["NLE", "Nuevo León"], ["OAX", "Oaxaca"], ["PUE", "Puebla"], ["QUE", "Querétaro"], ["ROO", "Quintana Roo"],
      ["SLP", "San Luis Potosí"], ["SIN", "Sinaloa"], ["SON", "Sonora"], ["TAB", "Tabasco"], ["TAM", "Tamaulipas"], ["TLA", "Tlaxcala"],
      ["VER", "Veracruz"], ["YUC", "Yucatán"], ["ZAC", "Zacatecas"],
    ],
  },
  CA: {
    label: "Province or territory",
    list: [
      ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"],
      ["NS", "Nova Scotia"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"],
      ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["YT", "Yukon"],
    ],
  },
};
const COUNTRIES: [string, string][] = [["US", "United States"], ["MX", "Mexico"], ["CA", "Canada"]];
const CURRENCIES: [Prefs["currency"], string][] = [["USD", "US dollar (USD)"], ["MXN", "Mexican peso (MXN)"], ["CAD", "Canadian dollar (CAD)"]];

// Onboarding starts with nothing chosen: every choice is blank until the person picks it.
type Draft = Omit<Prefs, "accountType" | "currency" | "view" | "units" | "period"> & {
  accountType: Prefs["accountType"] | "";
  currency: Prefs["currency"] | "";
  view: Prefs["view"] | "";
  units: Prefs["units"] | "";
  period: Prefs["period"] | 0;
};

const BLANK: Draft = {
  ...DEMO_PREFS,
  name: "",
  email: "",
  accountType: "",
  country: "",
  state: "",
  currency: "",
  view: "",
  units: "",
  period: 0,
  goals: [],
  goal: { kind: "trip", label: "", target: 0, saved: 0, by: "" },
  consent: { pnc: false, capitalOne: false, disclaimer: false },
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const monthsAfter = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return isoDay(new Date(y, m - 1 + n, d));
};

export default function Onboarding({ summary }: { summary: Summary }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Draft>(BLANK);
  const [today, setToday] = useState("");
  useEffect(() => setToday(isoDay(new Date())), []);

  // ?demo=1 goes straight to the dashboard with the demo profile, so visitors see the forecast first
  // (they can customize later from the avatar). Otherwise start from what the sign-up form passed along.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo")) {
      markDemo(); // lets the demo into the dashboard without an account
      savePrefs({ ...DEMO_PREFS, completedAt: new Date().toISOString() });
      router.replace("/dashboard?welcome=1");
      return;
    }
    try {
      const pending = JSON.parse(sessionStorage.getItem("foresight.pending") || "{}");
      setP((cur) => ({ ...cur, name: pending.name || cur.name, email: pending.email || cur.email }));
    } catch {}
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const setGoal = (g: Partial<Prefs["goal"]>) => setP((cur) => ({ ...cur, goal: { ...cur.goal, ...g } }));
  const setConsent = (c: Partial<Prefs["consent"]>) => setP((cur) => ({ ...cur, consent: { ...cur.consent, ...c } }));
  // Personal and business goals are different lists, so switching who it's for clears the goals picked so far.
  const setType = (accountType: Prefs["accountType"]) =>
    setP((cur) => (cur.accountType === accountType ? cur : { ...cur, accountType, goals: [], goal: BLANK.goal }));
  const business = p.accountType === "company";
  const options = goalOptionsFor(p.accountType || "individual");
  const regions = REGIONS[p.country];

  const valid = [
    Boolean(p.accountType),
    Boolean(p.country && p.state && p.currency),
    Boolean(p.view && p.units && p.period),
    p.goals.length > 0 && p.goal.target > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.goal.by) && (!today || p.goal.by >= today),
    p.consent.pnc && p.consent.disclaimer,
  ][step];

  function complete(d: Draft) {
    // Every step had to be filled in before this button unlocks, so the draft is a full setup now.
    const label = d.goal.label.trim() || goalOption(d.goal.kind)?.example || "";
    finish({ ...(d as Prefs), goal: { ...d.goal, label } });
  }

  function finish(prefs: Prefs) {
    savePrefs({ ...prefs, completedAt: new Date().toISOString() });
    router.push(prefs.accountType === "company" ? "/dashboard/company" : "/dashboard?welcome=1");
  }

  function toggleGoal(kind: GoalKind) {
    setP((cur) => {
      const goals = cur.goals.includes(kind) ? cur.goals.filter((g) => g !== kind) : [...cur.goals, kind];
      const example = (k: GoalKind) => goalOption(k)?.example ?? "";
      // The name stays blank (the example shows as a placeholder) until they type one.
      const main = goals.includes(cur.goal.kind) ? cur.goal : { ...cur.goal, kind: goals[0] ?? kind, label: "" };
      return { ...cur, goals, goal: main };
    });
  }

  // Goal math runs from today's date. Less than a month away: a daily amount; otherwise monthly.
  const hasBy = /^\d{4}-\d{2}-\d{2}$/.test(p.goal.by) && Boolean(today);
  const left = Math.max(0, p.goal.target - p.goal.saved);
  const underMonth = hasBy && p.goal.by < monthsAfter(today, 1);
  const daysLeft = hasBy ? Math.max(1, daysBetween(today, p.goal.by)) : 0;
  const monthsLeft = hasBy ? monthsUntil(today, p.goal.by) : 0;
  const perMonth = monthsLeft ? left / monthsLeft : 0;
  const perDay = daysLeft ? left / daysLeft : 0;
  const enough = p.goal.target > 0 && p.goal.saved >= p.goal.target;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <a className={styles.brand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
        <button type="button" className={styles.skip} onClick={() => {
          markDemo();
          finish({ ...DEMO_PREFS, name: p.name || DEMO_PREFS.name });
        }}>Skip, use demo profile</button>
      </header>

      <div className={styles.flow}>
        <div className={styles.progress} aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          <div className={styles.progressBar}><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <ol className={styles.stepNames}>
            {STEPS.map((s, i) => <li key={s} className={i === step ? styles.stepNow : i < step ? styles.stepDone : undefined}>{s}</li>)}
          </ol>
        </div>

        <section className={`${styles.card} ${step === 2 ? styles.cardWide : ""}`} aria-live="polite">
          {step === 0 && (
            <>
              <h1 className={styles.stepTitle}>{p.name ? `Hi ${p.name}! ` : ""}Who is this for?</h1>
              <p className={styles.stepSub}>We&rsquo;ll tailor what you see to how you use money.</p>
              <div className={styles.choices} role="radiogroup" aria-label="Account type">
                <Choice checked={p.accountType === "individual"} title="Just me" text="My own accounts, bills and goals." onSelect={() => setType("individual")} />
                <Choice checked={p.accountType === "company"} title="My company" text="Business accounts, loans and cash on hand." onSelect={() => setType("company")} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className={styles.stepTitle}>Where are you based?</h1>
              <p className={styles.stepSub}>Used to show amounts in your currency and your local context.</p>
              <div className={styles.form}>
                <label className={styles.field}>Country
                  {/* Changing the country clears the region, since each country has its own list. */}
                  <select value={p.country} onChange={(e) => setP((cur) => ({ ...cur, country: e.target.value, state: "" }))}>
                    <option value="" disabled>Choose your country</option>
                    {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>{regions?.label ?? "State or province"}
                  <select value={p.state} onChange={(e) => set("state", e.target.value)} disabled={!regions}>
                    <option value="" disabled>{regions ? `Choose your ${regions.label.toLowerCase()}` : "Choose a country first"}</option>
                    {regions?.list.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>Currency
                  <select value={p.currency} onChange={(e) => set("currency", e.target.value as Prefs["currency"])}>
                    <option value="" disabled>Choose your currency</option>
                    {CURRENCIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  <small>Your linked accounts are in US dollars, so amounts still show in USD for now.</small>
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <div className={styles.split}>
              <div>
                <h1 className={styles.stepTitle}>How do you want to see your money?</h1>
                <p className={styles.stepSub}>Banking your way. You can change this anytime.</p>
                <Group label="Layout">
                  <Choice small checked={p.view === "simple"} title="Simple" text="Just the headline numbers." onSelect={() => set("view", "simple")} />
                  <Choice small checked={p.view === "detailed"} title="Detailed" text="Every category, every chart." onSelect={() => set("view", "detailed")} />
                </Group>
                <Group label="Show my cash as">
                  <Choice small checked={p.units === "dollars"} title="Dollars" text={money(summary.liquid, false)} onSelect={() => set("units", "dollars")} />
                  <Choice small checked={p.units === "days"} title="Days it lasts" text={`${summary.runwayDays} days`} onSelect={() => set("units", "days")} />
                </Group>
                <Group label="Spending view">
                  <Choice small checked={p.period === 1} title="This month" text="One month at a time." onSelect={() => set("period", 1)} />
                  <Choice small checked={p.period === 3} title="3 months" text="Smooths out big bills." onSelect={() => set("period", 3)} />
                </Group>
              </div>
              <Preview p={p} summary={summary} />
            </div>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.stepTitle}>{business ? "What is the business working toward?" : "What are you working toward?"}</h1>
              <p className={styles.stepSub}>
                {business ? "Pick any that apply. Future-you watches the company's cash flow against these." : "Pick any that apply. Future-you keeps an eye on these."}
              </p>
              <div className={styles.chips} role="group" aria-label={business ? "Business goals" : "Goals"}>
                {options.map((g) => (
                  <button key={g.kind} type="button" aria-pressed={p.goals.includes(g.kind)} className={p.goals.includes(g.kind) ? styles.chipOn : styles.chip} onClick={() => toggleGoal(g.kind)}>
                    {g.label}
                  </button>
                ))}
              </div>
              {p.goals.length > 0 && (
                <div className={styles.goalBox}>
                  <p className={styles.groupLabel}>{business ? "The company's main goal" : "Your main goal"}</p>
                  <div className={styles.goalGrid}>
                    <label className={styles.field}>Goal
                      <select value={p.goal.kind} onChange={(e) => { const kind = e.target.value as GoalKind; setGoal({ kind, label: goalOption(kind)?.example ?? "" }); }}>
                        {p.goals.map((k) => <option key={k} value={k}>{goalOption(k)?.label}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>Name it
                      <input value={p.goal.label} onChange={(e) => setGoal({ label: e.target.value })} placeholder={goalOption(p.goal.kind)?.example ?? ""} />
                    </label>
                    <label className={styles.field}>Target ($)
                      <input inputMode="numeric" value={p.goal.target || ""} onChange={(e) => setGoal({ target: Number(e.target.value.replace(/\D/g, "")) })} placeholder={business ? "150000" : "1500"} />
                    </label>
                    <label className={styles.field}>{business ? "Set aside so far ($)" : "Saved so far ($)"}
                      <input inputMode="numeric" value={p.goal.saved || ""} onChange={(e) => setGoal({ saved: Number(e.target.value.replace(/\D/g, "")) })} placeholder="0" />
                    </label>
                    <div className={styles.field}>
                      <span id="goal-by-label">By</span>
                      <DatePicker labelledBy="goal-by-label" min={today || isoDay(new Date())} value={p.goal.by.length === 10 ? p.goal.by : ""} onChange={(by) => setGoal({ by })} />
                    </div>
                  </div>
                  {enough ? (
                    <p className={styles.goalMath}>You already have enough money saved 😊</p>
                  ) : p.goal.target > 0 && hasBy ? (
                    <p className={styles.goalMath}>
                      {underMonth ? (
                        <>That&rsquo;s <strong>{money(perDay, false)} a day</strong> for {daysLeft} day{daysLeft === 1 ? "" : "s"}</>
                      ) : (
                        <>That&rsquo;s <strong>{money(perMonth, false)} a month</strong> for {monthsLeft} month{monthsLeft === 1 ? "" : "s"}</>
                      )}{" "}
                      to reach {money(p.goal.target, false)} by {formatDate(p.goal.by)}.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <h1 className={styles.stepTitle}>You&rsquo;re in control</h1>
              <p className={styles.stepSub}>Choose what {BRAND} can do. You can change these anytime.</p>
              <div className={styles.consents}>
                {business ? (
                  <>
                    <Consent checked={p.consent.pnc} required title="Connect the company's PNC business accounts" text="Read-only access to business balances, loans and transactions, so we can build the company's full picture. I'm authorized to share them." onChange={(v) => setConsent({ pnc: v })} />
                    <Consent checked={p.consent.capitalOne} title="Connect the company's Capital One business accounts" text="Through Capital One's Nessie API, so you can see and move the company's money across both banks." onChange={(v) => setConsent({ capitalOne: v })} />
                  </>
                ) : (
                  <>
                    <Consent checked={p.consent.pnc} required title="Connect my PNC accounts" text="Read-only access to balances and transactions, so we can build your full picture." onChange={(v) => setConsent({ pnc: v })} />
                    <Consent checked={p.consent.capitalOne} title="Connect my Capital One accounts" text="Through Capital One's Nessie API, so you can see and move money across both banks." onChange={(v) => setConsent({ capitalOne: v })} />
                  </>
                )}
                <Consent checked={p.consent.disclaimer} required title="I understand this is a prototype" text="It uses synthetic data, and nothing here is financial advice. Every number is calculated by code before AI explains it." onChange={(v) => setConsent({ disclaimer: v })} />
              </div>
            </>
          )}

          <div className={styles.nav}>
            {step > 0 ? <button type="button" className={styles.backBtn} onClick={() => setStep(step - 1)}>Back</button> : <span />}
            {step < STEPS.length - 1 ? (
              <button type="button" className={styles.primaryBtn} disabled={!valid} onClick={() => setStep(step + 1)}>Continue</button>
            ) : (
              <button type="button" className={styles.primaryBtn} disabled={!valid} onClick={() => complete(p)}>Finish setup</button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Choice({ checked, disabled, title, text, tag, small, onSelect }: { checked: boolean; disabled?: boolean; title: string; text: string; tag?: string; small?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} aria-label={`${title}: ${text}${tag ? ` (${tag})` : ""}`} disabled={disabled} className={`${small ? styles.choiceSm : styles.choice} ${checked ? styles.choiceOn : ""}`} onClick={onSelect}>
      <span className={styles.choiceText}>
        <strong>{title}{tag && <em>{tag}</em>}</strong>
        <span>{text}</span>
      </span>
      <span className={styles.radio} aria-hidden="true" />
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.group}>
      <p className={styles.groupLabel}>{label}</p>
      <div className={styles.groupRow} role="radiogroup" aria-label={label}>{children}</div>
    </div>
  );
}

function Consent({ checked, required, title, text, onChange }: { checked: boolean; required?: boolean; title: string; text: string; onChange: (v: boolean) => void }) {
  return (
    <div className={`${styles.consent} ${checked ? styles.consentOn : ""}`}>
      <label className={styles.consentRow}>
        <input type="checkbox" checked={checked} aria-label={`${title}${required ? " (required)" : ""}`} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <strong>{title}{required && <em>Required</em>}</strong>
          <span>{text}</span>
        </span>
      </label>
    </div>
  );
}

// Live mini-dashboard: changes as the user picks options in step 3.
// Until a choice is made, it previews the detailed, dollars, 3-month view.
function Preview({ p: draft, summary }: { p: Draft; summary: Summary }) {
  const p = { view: draft.view || "detailed", units: draft.units || "dollars", period: draft.period || 3 };
  const months = summary.recent.slice(-p.period);
  const totals: Record<string, number> = {};
  for (const m of months) for (const [k, v] of Object.entries(m.byCategory)) totals[k] = (totals[k] ?? 0) + v;
  const cats = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const spent = cats.reduce((s, [, v]) => s + v, 0);
  const shown = p.view === "simple" ? cats.slice(0, 3) : cats;
  const range = months.length > 1 ? `${shortMonth(months[0].month)} – ${shortMonth(months.at(-1)!.month)}` : longMonth(months[0].month);
  return (
    <aside className={styles.preview} aria-label="Preview of your dashboard">
      <p className={styles.previewTag}>Live preview</p>
      <div className={styles.previewHero}>
        <span>{p.units === "days" ? "Your cash covers" : "Cash and savings"}</span>
        <strong>{p.units === "days" ? `${summary.runwayDays} days` : money(summary.liquid, false)}</strong>
        <small>{p.units === "days" ? `of spending at ${money(summary.monthlyOut, false)} a month` : "Across PNC and Capital One"}</small>
      </div>
      <div className={styles.previewSpend}>
        <div className={styles.previewSpendHead}>
          <span>Spending · {range}</span>
          <strong>{money(spent, false)}</strong>
        </div>
        <ul>
          {shown.map(([k, v], i) => {
            const meta = categoryMeta(k, i);
            return (
              <li key={k}>
                <span className={styles.previewDot} style={{ background: meta.color }} aria-hidden="true" />
                <span>{meta.label}</span>
                {p.view === "detailed" && <span className={styles.previewBar}><span style={{ width: `${(v / (cats[0]?.[1] || 1)) * 100}%`, background: meta.color }} /></span>}
                <span>{money(v, false)}</span>
              </li>
            );
          })}
        </ul>
        {p.view === "simple" && cats.length > 3 && <p className={styles.previewMore}>+{cats.length - 3} more, tucked away</p>}
      </div>
    </aside>
  );
}
