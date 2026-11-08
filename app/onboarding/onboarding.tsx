"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "../../lib/brand";
import { categoryMeta, longMonth, money, shortMonth } from "../../lib/format";
import { markDemo } from "../../lib/auth-client";
import { DEMO_BUSINESS_PREFS, DEMO_PREFS, type GoalKind, type Prefs, goalOption, goalOptionsFor, loadPrefs, monthsUntil, savePrefs } from "../../lib/prefs";
import type { Summary } from "../../lib/summary";
import DatePicker, { formatDate } from "./date-picker";
import styles from "./onboarding.module.css";

const STEPS = ["Who it's for", "Location", "Your view", "Goals", "Consent"];
const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const BLANK: Prefs = {
  ...DEMO_PREFS,
  name: "",
  view: "detailed",
  units: "dollars",
  period: 3,
  goals: [],
  goal: { kind: "trip", label: "", target: 0, saved: 0, by: "" },
  consent: { pnc: false, capitalOne: false, disclaimer: false },
};

// member: the signed-in account. Its type (personal or company) was chosen at sign-up, so it's fixed here.
// resume: a returning member who already finished setup in this browser goes straight to their dashboard.
export default function Onboarding({ summary, member, resume = false }: { summary: Summary; member?: { name: string; type: Prefs["accountType"] }; resume?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Prefs>(BLANK);
  const [demo, setDemo] = useState(false);

  // ?demo=1 ("Try the demo") starts here with every step pre-filled, so the visitor picks personal or business
  // and clicks through. Otherwise start from what the sign-up form passed along.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo")) {
      markDemo(); // lets the demo into the dashboard without an account
      setDemo(true);
      setP({ ...DEMO_PREFS, completedAt: "" });
      return;
    }
    if (member) {
      const saved = loadPrefs();
      if (resume && saved?.completedAt && saved.accountType === member.type) {
        router.replace(member.type === "company" ? "/dashboard/company" : "/dashboard");
        return;
      }
      setP((cur) => ({ ...cur, accountType: member.type, name: member.type === "company" ? member.name : member.name.split(" ")[0] }));
      return;
    }
    try {
      const pending = JSON.parse(sessionStorage.getItem("foresight.pending") || "{}");
      setP((cur) => ({ ...cur, name: pending.name || cur.name, email: pending.email || cur.email }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const setGoal = (g: Partial<Prefs["goal"]>) => setP((cur) => ({ ...cur, goal: { ...cur.goal, ...g } }));
  const setConsent = (c: Partial<Prefs["consent"]>) => setP((cur) => ({ ...cur, consent: { ...cur.consent, ...c } }));
  // Personal and business goals are different lists, so switching who it's for clears the goals picked so far.
  // In the demo, switching fills in that type's demo goals instead, so every step stays ready to click through.
  const demoFor = (accountType: Prefs["accountType"]) => (accountType === "company" ? DEMO_BUSINESS_PREFS : DEMO_PREFS);
  const setType = (accountType: Prefs["accountType"]) =>
    setP((cur) => {
      if (cur.accountType === accountType || member) return cur; // a member's type was set at sign-up
      const goals = demo ? { goals: demoFor(accountType).goals, goal: demoFor(accountType).goal } : { goals: [], goal: BLANK.goal };
      return { ...cur, accountType, ...goals };
    });
  const business = p.accountType === "company";
  const options = goalOptionsFor(p.accountType);

  const valid = [
    true,
    Boolean(p.state),
    true,
    p.goals.length > 0 && p.goal.target > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.goal.by),
    p.consent.pnc && p.consent.disclaimer,
  ][step];

  function finish(prefs: Prefs) {
    savePrefs({ ...prefs, completedAt: new Date().toISOString() });
    router.push(prefs.accountType === "company" ? "/dashboard/company" : "/dashboard?welcome=1");
  }

  function toggleGoal(kind: GoalKind) {
    setP((cur) => {
      const goals = cur.goals.includes(kind) ? cur.goals.filter((g) => g !== kind) : [...cur.goals, kind];
      const example = (k: GoalKind) => goalOption(k)?.example ?? "";
      const main = goals.includes(cur.goal.kind) ? cur.goal : { ...cur.goal, kind: goals[0] ?? kind, label: example(goals[0] ?? kind) };
      return { ...cur, goals, goal: main.label ? main : { ...main, label: example(main.kind) } };
    });
  }

  const nextMonth = useMemo(() => {
    const [y, m] = summary.asOf.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }, [summary.asOf]);
  const monthsLeft = p.goal.by ? monthsUntil(summary.asOf, p.goal.by) : 0;
  const perMonth = monthsLeft ? Math.max(0, p.goal.target - p.goal.saved) / monthsLeft : 0;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <a className={styles.brand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
        <button type="button" className={styles.skip} onClick={() => { markDemo(); finish({ ...demoFor(p.accountType), name: p.name || DEMO_PREFS.name }); }}>
          {demo ? `Skip to the ${p.accountType === "company" ? "company" : "personal"} dashboard` : "Skip, use demo profile"}
        </button>
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
              <p className={styles.stepSub}>
                {demo
                  ? "Demo: pick personal or business. Every step is already filled in, so just press Continue."
                  : member
                    ? `You signed up as ${member.type === "company" ? "a business" : "an individual"}, so this is set. Press Continue.`
                    : "We’ll tailor what you see to how you use money."}
              </p>
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
                  <select value={p.country} onChange={(e) => set("country", e.target.value)}>
                    <option value="US">United States</option>
                    <option value="CA" disabled>Canada (coming soon)</option>
                    <option value="MX" disabled>Mexico (coming soon)</option>
                  </select>
                </label>
                <label className={styles.field}>State
                  <select value={p.state} onChange={(e) => set("state", e.target.value)}>
                    <option value="">Choose your state</option>
                    {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>Currency
                  <select value="USD" disabled><option value="USD">US dollar (USD)</option></select>
                  <small>All of your linked accounts are in US dollars.</small>
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
                      <input value={p.goal.label} onChange={(e) => setGoal({ label: e.target.value })} placeholder={business ? "3-month operating reserve" : "Trip to Cancún"} />
                    </label>
                    <label className={styles.field}>Target ($)
                      <input inputMode="numeric" value={p.goal.target || ""} onChange={(e) => setGoal({ target: Number(e.target.value.replace(/\D/g, "")) })} placeholder={business ? "150000" : "1500"} />
                    </label>
                    <label className={styles.field}>{business ? "Set aside so far ($)" : "Saved so far ($)"}
                      <input inputMode="numeric" value={p.goal.saved || ""} onChange={(e) => setGoal({ saved: Number(e.target.value.replace(/\D/g, "")) })} placeholder="0" />
                    </label>
                    <div className={styles.field}>
                      <span id="goal-by-label">By</span>
                      <DatePicker labelledBy="goal-by-label" min={`${nextMonth}-01`} value={p.goal.by.length === 10 ? p.goal.by : ""} onChange={(by) => setGoal({ by })} />
                    </div>
                  </div>
                  {p.goal.target > 0 && p.goal.by && (
                    <p className={styles.goalMath}>
                      That&rsquo;s <strong>{money(perMonth, false)} a month</strong> for {monthsLeft} month{monthsLeft === 1 ? "" : "s"} to reach {money(p.goal.target, false)} by {p.goal.by.length === 10 ? formatDate(p.goal.by) : longMonth(p.goal.by)}.
                    </p>
                  )}
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
              <button type="button" className={styles.primaryBtn} disabled={!valid} onClick={() => finish(p)}>Finish setup</button>
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
function Preview({ p, summary }: { p: Prefs; summary: Summary }) {
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
