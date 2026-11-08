"use client";
import { FormEvent, useState } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import { BRAND, SLOGAN } from "../../lib/brand";
import { AUTH_ERRORS } from "../../lib/auth-client";
import styles from "../onboarding/onboarding.module.css";

type Details = { type: "individual" | "company"; firstName: string; lastName: string; companyName: string };

// Create account: pick Individual or Company and fill in the names, then Clerk's box takes email and password
// (and rejects an email that already has an account). Sign in: Clerk's box (errors on an unknown account).
// Both finish at /start/finish, which sets up the Nessie customer for new accounts.
export default function StartForm({ initialMode, error, configured }: { initialMode: "signup" | "signin"; error?: string; configured: boolean }) {
  const [mode, setMode] = useState(initialMode);
  const [details, setDetails] = useState<Details>({ type: "individual", firstName: "", lastName: "", companyName: "" });
  const [ready, setReady] = useState(false); // names filled in, show Clerk's email + password box
  const problem = !configured ? "Login isn't set up yet. Add the Clerk keys to .env." : error ? (AUTH_ERRORS[error] ?? AUTH_ERRORS.failed) : "";
  const set = (k: keyof Details, v: string) => setDetails((d) => ({ ...d, [k]: v }));

  function next(e: FormEvent) {
    e.preventDefault();
    setReady(true);
  }

  const switchMode = (m: "signup" | "signin") => {
    setMode(m);
    setReady(false);
  };

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <a className={styles.brand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
      </header>

      <div className={styles.authWrap}>
        <section className={styles.authIntro}>
          <p className={styles.eyebrow}>{SLOGAN}</p>
          <h1 className={styles.h1}>Your money, set up the way you think.</h1>
          <p className={styles.lead}>Two minutes of setup. Then future-you watches every account and warns you before you overspend.</p>
          <a className={styles.demoBtn} href="/onboarding?demo=1">Skip to the demo <span aria-hidden="true">→</span></a>
          <p className={styles.small}>Uses a sample customer. No account needed.</p>
        </section>

        <section className={styles.card} aria-labelledby="auth-title">
          <div className={styles.switch} role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? styles.switchOn : undefined} onClick={() => switchMode("signup")}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? styles.switchOn : undefined} onClick={() => switchMode("signin")}>Sign in</button>
          </div>
          <h2 id="auth-title" className={styles.cardTitle}>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
          {problem && <p className={styles.authError} role="alert">{problem}</p>}

          {configured && mode === "signin" && (
            <div className={styles.clerkBox}>
              <SignIn routing="hash" forceRedirectUrl="/start/finish" signUpUrl="/start" />
            </div>
          )}

          {configured && mode === "signup" && !ready && (
            <form onSubmit={next} className={styles.form}>
              <div className={styles.typePick} role="radiogroup" aria-label="Account type">
                {(["individual", "company"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={details.type === t} className={details.type === t ? styles.typeOn : undefined} onClick={() => set("type", t)}>
                    {t === "individual" ? "Individual" : "Company"}
                  </button>
                ))}
              </div>
              {details.type === "individual" ? (
                <div className={styles.nameRow}>
                  <label className={styles.field}>First name
                    <input value={details.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" maxLength={80} required />
                  </label>
                  <label className={styles.field}>Last name
                    <input value={details.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="family-name" maxLength={80} required />
                  </label>
                </div>
              ) : (
                <label className={styles.field}>Company name
                  <input value={details.companyName} onChange={(e) => set("companyName", e.target.value)} autoComplete="organization" maxLength={80} required />
                </label>
              )}
              <button className={styles.primaryBtn}>Continue</button>
              <p className={styles.small}>Next you&rsquo;ll add your email and a password.</p>
            </form>
          )}

          {configured && mode === "signup" && ready && (
            <>
              <p className={styles.small}>
                {details.type === "company" ? details.companyName : `${details.firstName} ${details.lastName}`} ·{" "}
                <button type="button" className={styles.linkBtn} onClick={() => setReady(false)}>Change</button>
              </p>
              <div className={styles.clerkBox}>
                <SignUp
                  routing="hash"
                  forceRedirectUrl="/start/finish"
                  signInUrl="/start?mode=signin"
                  unsafeMetadata={details.type === "company" ? { type: "company", companyName: details.companyName.trim() } : { type: "individual", firstName: details.firstName.trim(), lastName: details.lastName.trim() }}
                />
              </div>
            </>
          )}
          <p className={styles.small}>Prototype with synthetic data only. Not financial advice.</p>
        </section>
      </div>
    </main>
  );
}
