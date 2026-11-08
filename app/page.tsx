import type { Metadata } from "next";
import styles from "./landing.module.css";
import { BRAND, SLOGAN } from "../lib/brand";

const STARTER_QUESTION = "Can I do a $1,500 trip in March?";
const DEMO_HREF = "/onboarding?demo=1";
// The amounts in the example conversations are placeholders: swap in real C005 output once the forecast works.

export const metadata: Metadata = {
  title: `${BRAND} · ${SLOGAN}`,
  description: "See where your money is headed. Every account, every bank, one honest answer from future-you.",
};

type Bubble = { from: "you" | "future"; text: string };

const HERO_THREAD: Bubble[] = [
  { from: "you", text: STARTER_QUESTION },
  { from: "future", text: "Yes, if you move $300 from your Capital One savings in January. Without it, rent comes up $212 short." },
  { from: "you", text: "do it" },
  { from: "future", text: "✅ Done. See you in March." },
];

const GUARD_THREAD: Bubble[] = [
  { from: "future", text: "Heads up from March-you: this $240 purchase pushes your trip back 3 weeks." },
  { from: "future", text: "Allow it anyway?" },
  { from: "you", text: "skip it" },
  { from: "future", text: "Held. The trip stays on track. 🌴" },
];

const BANKS = [
  { name: "PNC", accounts: ["Checking", "Savings", "CD", "IRA", "Credit card", "Auto loan", "Personal loan", "Mortgage"] },
  { name: "Capital One", accounts: ["Checking", "Savings", "Credit card"] },
];

const STEPS = [
  { title: "Ask in plain words", body: "Ask what you'd ask a friend who's good with money: can I afford this, and when?" },
  { title: "Future-you checks everything", body: "Every account at every bank, in one picture. Code does the math and checks it before you see a single number." },
  { title: "Say “do it”", body: "The money moves between your banks. And if a purchase would break the plan, future-you warns you first." },
];

const TRUST = [
  { label: "Calculated", body: "Balances, bills and forecasts come from code, not from an AI's guess." },
  { label: "Checked", body: "Every number is verified against your accounts before you see it." },
  { label: "Explained", body: "Only then does it get put into plain words, from the you who's already there." },
];

const BUILT_WITH = ["PNC financial wellness data", "Capital One Nessie", "Next.js"];

function Thread({ bubbles, name, label, animate = false }: { bubbles: Bubble[]; name: string; label: string; animate?: boolean }) {
  return (
    <figure className={styles.phone} aria-label={label}>
      <div className={styles.phoneTop}>
        <span className={styles.avatar} aria-hidden="true">{name.charAt(0)}</span>
        <span className={styles.contact}>{name}</span>
        <span className={styles.service}>in {BRAND}</span>
      </div>
      <div className={styles.thread}>
        {bubbles.map((b, i) => (
          <p
            key={i}
            className={`${styles.bubble} ${b.from === "you" ? styles.you : styles.future} ${animate ? styles.rise : ""}`}
            style={animate ? ({ "--d": `${0.35 + i * 0.9}s` } as React.CSSProperties) : undefined}
          >
            {b.text}
          </p>
        ))}
      </div>
    </figure>
  );
}

export default function Landing() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/">
          <span className={styles.mark} aria-hidden="true" />
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
            {BRAND} sees every account you have, at every bank, and shows you where your money is headed. Ask
            &ldquo;{STARTER_QUESTION}&rdquo; and future-you answers with the numbers and a plan.
          </p>
          <div className={styles.ctas}>
            <a className={styles.primary} href={DEMO_HREF}>Try the demo</a>
            <a className={styles.secondary} href="/start">Get started</a>
          </div>
          <p className={styles.micro}>The demo uses a sample customer. Nothing to install.</p>
        </div>
        <div className={styles.heroArt}>
          <Thread bubbles={HERO_THREAD} name="March-you" label="Example conversation: asking March-you about a trip" animate />
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
        <h2 id="how-title" className={styles.h2}>One question. One honest answer.</h2>
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
            When a purchase would wreck your plan, it&rsquo;s held for a moment while future-you checks with you.
            One tap decides whether it goes through.
          </p>
        </div>
        <Thread bubbles={GUARD_THREAD} name="March-you" label="Example conversation: March-you holding a purchase" />
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
