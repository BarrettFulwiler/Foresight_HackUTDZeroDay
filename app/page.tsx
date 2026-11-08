import type { Metadata } from "next";
import styles from "./landing.module.css";
import { BRAND, SLOGAN } from "../lib/brand";
import { getDashboardData } from "../lib/finance";
import { runForecast } from "../lib/forecast";
import { withLiveBalances } from "../lib/live-accounts";
import { buildPlan } from "../lib/plans";
import type { Prefs } from "../lib/prefs";
import { FuturesCard, WarnCard } from "./landing-futures";

const DEMO_HREF = "/onboarding?demo=1";
// The demo profile's goal (same as DEMO_PREFS in lib/prefs.ts), so the landing matches the demo.
const DEMO_GOAL: Prefs["goal"] = { kind: "trip", label: "Trip to Cancún", target: 1500, saved: 960, by: "2027-03" };

export const metadata: Metadata = {
  title: `${BRAND} · ${SLOGAN}`,
  description: "See the day your money runs short, at every bank, and fix it before it happens.",
};
// The hero card uses live Nessie balances, so it always shows the same numbers as the demo.
export const dynamic = "force-dynamic";

const BANKS = [
  { name: "PNC", accounts: ["Checking", "Savings", "CD", "IRA", "Credit card", "Auto loan", "Personal loan", "Mortgage"] },
  { name: "Capital One", accounts: ["Checking", "Savings", "Credit card"] },
];

const STEPS = [
  { title: "See the day it goes wrong", body: "Every account at every bank, run forward day by day from today's balances. Foresight finds the exact date your checking runs short." },
  { title: "Pick a what-if", body: "A trip, paying off a card, a surprise bill. See both futures side by side and get a plan. Code does the math." },
  { title: "Apply the plan", body: "One tap moves the money between your banks, and the forecast redraws from the new balances." },
];

const TRUST = [
  { label: "Calculated", body: "Balances, bills and forecasts come from code, not from an AI's guess." },
  { label: "Checked", body: "Every number is verified against your accounts before you see it." },
  { label: "Explained", body: "Only then does it get put into plain words, from the you who's already there." },
];

const BUILT_WITH = ["PNC financial wellness data", "Capital One Nessie", "Google Gemini", "Next.js"];

export default async function Landing() {
  const data = getDashboardData("C005");
  const { accounts } = await withLiveBalances(data.accounts);
  const plan = buildPlan("trip", accounts, data.schedule, data.asOf, DEMO_GOAL);
  const base = runForecast(accounts, data.schedule, data.asOf);
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/">
          <img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />
          {BRAND}
        </a>
        <nav className={styles.navLinks} aria-label="Main">
          <a href="#how">How it works</a>
          <a href="/dashboard">Dashboard</a>
          <a className={styles.navCta} href={DEMO_HREF}>Try the demo</a>
        </nav>
      </header>

      <section className={`${styles.wrap} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Your money, seen from the future</p>
          <h1 className={styles.title}>{SLOGAN}.</h1>
          <p className={styles.lead}>
            {BRAND} sees every account you have, at every bank, and shows you the day your money runs short. Pick a
            what-if, like a $1,500 trip in March, and future-you shows what goes wrong and moves the money to fix it.
          </p>
          <div className={styles.ctas}>
            <a className={styles.primary} href={DEMO_HREF}>Try the demo</a>
            <a className={styles.secondary} href="/start">Get started</a>
          </div>
          <p className={styles.micro}>The demo uses a sample customer. Nothing to install.</p>
        </div>
        <div className={styles.heroArt}>
          <FuturesCard plan={plan} accounts={accounts} tripDate={`${DEMO_GOAL.by}-10`} />
          <p className={styles.fCaption}>Live from the demo: a sample customer, with real balances from Capital One&rsquo;s Nessie API.</p>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.banks}`} aria-labelledby="banks-title">
        <h2 id="banks-title" className={styles.h2}>Every account. Every bank. One picture.</h2>
        <div className={styles.bankRow}>
          {BANKS.map((bank) => (
            <div key={bank.name} className={styles.bankCard}>
              <p className={styles.bankName}>{bank.name}</p>
              <ul className={styles.chips}>
                {bank.accounts.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          ))}
          <div className={styles.merge} aria-hidden="true">→</div>
          <div className={`${styles.bankCard} ${styles.onePicture}`}>
            <p className={styles.bankName}>One picture</p>
            <p className={styles.onePictureText}>What you have, what you owe, and whether you can take that trip.</p>
          </div>
        </div>
      </section>

      <section id="how" className={`${styles.wrap} ${styles.how}`} aria-labelledby="how-title">
        <p className={styles.eyebrow}>How it works</p>
        <h2 id="how-title" className={styles.h2}>See it. Plan it. Fix it.</h2>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <h3 className={styles.h3}>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${styles.wrap} ${styles.guard}`} aria-labelledby="guard-title">
        <div>
          <p className={styles.eyebrow}>It has your back</p>
          <h2 id="guard-title" className={styles.h2}>Future-you warns you before the mistake, not after.</h2>
          <p className={styles.body}>
            Your bank tells you after you&rsquo;re overdrawn. Foresight runs every account forward from today&rsquo;s
            balances, so the warning comes weeks early, with the exact day, the amount, and a plan to fix it.
          </p>
        </div>
        <WarnCard base={base} asOf={data.asOf} />
      </section>

      <section className={`${styles.wrap} ${styles.trust}`} aria-labelledby="trust-title">
        <h2 id="trust-title" className={styles.h2}>Not a chatbot that guesses.</h2>
        <div className={styles.trustRow}>
          {TRUST.map((t, i) => (
            <div key={t.label} className={styles.trustItem}>
              <p className={styles.trustLabel}>
                <span>{t.label}</span>
                {i < TRUST.length - 1 && <span className={styles.trustArrow} aria-hidden="true">→</span>}
              </p>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.tryIt}`} aria-labelledby="try-title">
        <h2 id="try-title" className={styles.h2}>See where your money is headed.</h2>
        <p className={styles.body}>Two minutes of setup, then future-you takes it from there.</p>
        <div className={styles.ctas}>
          <a className={styles.primary} href={DEMO_HREF}>Try the demo</a>
          <a className={styles.secondary} href="/start">Create an account</a>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.built}`} aria-label="Built with">
        <p className={styles.eyebrow}>Built with</p>
        <ul className={styles.builtList}>
          {BUILT_WITH.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </section>

      <footer className={styles.footer}>
        <p>Synthetic data only · Educational prototype · Not financial advice.</p>
        <p>{BRAND} · Built at HackUTD Zero Day 2026</p>
      </footer>
    </main>
  );
}
