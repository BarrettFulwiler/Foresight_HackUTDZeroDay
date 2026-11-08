import type { Metadata } from "next";
import styles from "./landing.module.css";
import { BRAND, SLOGAN } from "../lib/brand";
import { getDashboardData } from "../lib/finance";
import { withLiveBalances } from "../lib/live-accounts";
import { buildPlan } from "../lib/plans";
import type { Prefs } from "../lib/prefs";
import { buildCustomPlan, horizonMonths } from "../lib/whatif";
import { AskCard, FuturesCard } from "./landing-futures";

// Opens the dashboard straight away with the demo profile (see app/onboarding).
const DEMO_HREF = "/onboarding?demo=1";
// The demo profile's goal (same as DEMO_PREFS in lib/prefs.ts), so the landing matches the demo.
const DEMO_GOAL: Prefs["goal"] = { kind: "trip", label: "Trip to Cancún", target: 1500, saved: 960, by: "2027-03" };
const ASK_EXAMPLE = "Can I afford a $3,000 car repair next month?";

export const metadata: Metadata = {
  title: `${BRAND} · ${SLOGAN}`,
  description: "See what's ahead for your money across your banks, and plan with confidence.",
};
// The hero card uses live Nessie balances, so it always shows the same numbers as the demo.
export const dynamic = "force-dynamic";

const BANKS = [
  { name: "PNC", accounts: ["Checking", "Savings", "CD", "IRA", "Credit card", "Auto loan", "Personal loan", "Mortgage"] },
  { name: "Capital One", accounts: ["Checking", "Savings", "Credit card"] },
];

const STEPS = [
  { title: "See it", body: "Your accounts at both banks, projected day by day from today's balances. Foresight flags the projected date checking runs short." },
  { title: "Plan it", body: "Pick a what-if (a trip, paying off a card, a surprise bill) or type your own. See both futures side by side, with a plan. Code does the math." },
  { title: "Fix it", body: "Review the plan and approve the transfer. It moves between your banks through Nessie, and the forecast redraws from the new balances." },
];

const TRUST = [
  { label: "Calculated", body: "Balances, bills and forecasts come from code, not from an AI's guess." },
  { label: "Explained", body: "Gemini puts the calculated facts into plain words, in future-you's voice." },
  { label: "Checked", body: "Every number in that reply must match one the forecast calculated, or Foresight doesn't show it." },
];

// Logos are the companies' own marks, used only to credit what the prototype is built on.
const BUILT_WITH: { name: string; logo?: string }[] = [
  { name: "PNC financial wellness data", logo: "/brand/logos/pnc.png" },
  { name: "Capital One Nessie", logo: "/brand/logos/capitalone.png" },
  { name: "Google Gemini", logo: "/brand/logos/gemini.svg" },
  { name: "Next.js", logo: "/brand/logos/nextjs.svg" },
];

export default async function Landing() {
  const data = getDashboardData("C005");
  const { accounts } = await withLiveBalances(data.accounts);
  const plan = buildPlan("trip", accounts, data.schedule, data.asOf, DEMO_GOAL);
  // The typed what-if example, run through the same engine as the in-app chat (the spec Gemini returns for it).
  const askPlan = buildCustomPlan(
    {
      title: "Car repair",
      kind: "event",
      want: ASK_EXAMPLE,
      interpretation: "A one-time $3,000 car repair next month, paid from PNC checking.",
      oneOffAmount: 3000,
      oneOffMonth: horizonMonths(data.asOf)[0],
      oneOffLabel: "Car repair",
    },
    accounts,
    data.schedule,
    data.asOf,
  );
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/">
          <img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />
          {BRAND}
        </a>
        <nav className={styles.navLinks} aria-label="Main">
          <a href="#how">How it works</a>
          <a href="/start?mode=signin">Sign in</a>
          <a className={styles.navCta} href={DEMO_HREF}>Try the demo</a>
        </nav>
      </header>

      <section className={`${styles.wrap} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{SLOGAN}</p>
          <h1 className={styles.title}>Know you&rsquo;re covered before you spend.</h1>
          <p className={styles.lead}>
            {BRAND} projects your balances at both banks day by day, so you can see what&rsquo;s ahead. Ask future-you a
            what-if, and you get a plan you approve before any money moves.
          </p>
          <div className={styles.ctas}>
            <a className={styles.primary} href={DEMO_HREF}>Try the demo</a>
            <a className={styles.secondary} href="#how">How it works</a>
          </div>
          <p className={styles.micro}>
            The demo starts with a quick setup where you pick personal or business, then opens the dashboard, using PNC&rsquo;s synthetic customer data and Capital One&rsquo;s Nessie
            sandbox. No real accounts or money.
          </p>
          <ul className={styles.proof}>
            <li><strong>Day by day</strong><span>Every account projected 12 months ahead</span></li>
            <li><strong>Both banks</strong><span>PNC and Capital One in one forecast</span></li>
            <li><strong>Checked AI</strong><span>Every number Gemini writes must match the math</span></li>
          </ul>
        </div>
        <div className={styles.heroArt}>
          <FuturesCard plan={plan} tripDate={`${DEMO_GOAL.by}-10`} tripTarget={DEMO_GOAL.target} />
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.banks}`} aria-labelledby="banks-title">
        <h2 id="banks-title" className={styles.h2}>Both banks. One picture.</h2>
        <p className={styles.body}>In the demo: one customer&rsquo;s PNC accounts and Capital One accounts, side by side.</p>
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
          <p className={styles.eyebrow}>Ask your own</p>
          <h2 id="guard-title" className={styles.h2}>Type any what-if. See both futures.</h2>
          <p className={styles.body}>
            Not just the presets. Ask in plain words, like a car repair next month or cutting dining by $100. Gemini
            reads the question, the forecast runs both futures from the demo&rsquo;s live balances, and you get a plan
            to review.
          </p>
        </div>
        <AskCard question={ASK_EXAMPLE} plan={askPlan} />
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
        <p className={styles.body}>Pick personal or business, click through the pre-filled setup, and land on the forecast.</p>
        <div className={styles.ctas}>
          <a className={styles.primary} href={DEMO_HREF}>Try the demo</a>
          <a className={styles.secondary} href="/onboarding">Set up your own view</a>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.built}`} aria-label="Built with">
        <p className={styles.eyebrow}>Built with</p>
        <ul className={styles.builtList}>
          {BUILT_WITH.map((b) => (
            <li key={b.name}>
              {b.logo && <img src={b.logo} alt="" width={20} height={20} className={styles.builtLogo} />}
              {b.name}
            </li>
          ))}
        </ul>
        <p className={styles.builtNote}>Logos are trademarks of their owners and are shown only to credit the tools and data this prototype uses. No endorsement implied.</p>
      </section>

      <footer className={styles.footer}>
        <p>Synthetic data only · Educational prototype · Not financial advice.</p>
        <p>{BRAND} · Built at HackUTD Zero Day 2026</p>
      </footer>
    </main>
  );
}
