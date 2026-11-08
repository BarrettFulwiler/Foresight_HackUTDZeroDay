"use client";
import { FormEvent, useEffect, useState } from "react";
import { SignIn, SignOutButton, SignUp } from "@clerk/nextjs";
import { BRAND, SLOGAN } from "../../lib/brand";
import { AUTH_ERRORS } from "../../lib/auth-client";
import styles from "../onboarding/onboarding.module.css";

type Details = { type: "individual" | "company"; firstName: string; lastName: string; companyName: string };

// Create account: pick Individual or Company and fill in the names, then Clerk's box takes email and password
// (and rejects an email that already has an account). Sign in: Clerk's box (errors on an unknown account).
// Both finish at /start/finish, which sets up the Nessie customer for new accounts.
export default function StartForm({ initialMode, error, configured, signedIn = false }: { initialMode: "signup" | "signin"; error?: string; configured: boolean; signedIn?: boolean }) {
  const [mode, setMode] = useState(initialMode);
  const [details, setDetails] = useState<Details>({ type: "individual", firstName: "", lastName: "", companyName: "" });
  const [ready, setReady] = useState(false); // names filled in, show Clerk's email + password box
  const problem = !configured ? "Login isn't set up yet. Add the Clerk keys to .env." : error ? (AUTH_ERRORS[error] ?? AUTH_ERRORS.failed) : "";
  const set = (k: keyof Details, v: string) => setDetails((d) => ({ ...d, [k]: v }));

  // "Continue with Google" for someone without an account: Clerk turns the sign-in into a sign-up and sends them
  // back here as /start#/continue (or #/verify...). Show Clerk's sign-up box straight away so it can finish,
  // instead of our names form; /start/finish then sets up a personal account from their Google profile.
  useEffect(() => {
    if (/^#\/(continue|verify|sso-callback)/.test(window.location.hash)) {
      setMode("signup");
      setReady(true);
    }
  }, []);
  const named = details.type === "company" ? details.companyName.trim() : `${details.firstName} ${details.lastName}`.trim();

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

          {/* Signed in but setup didn't finish (the page only shows this with an error; otherwise it forwards on). */}
          {configured && signedIn && (
            <div className={styles.form}>
              <p className={styles.small}>You&rsquo;re signed in, but your Foresight account isn&rsquo;t set up yet.</p>
              <a className={styles.primaryBtn} href="/start/finish" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Try again</a>
              <SignOutButton redirectUrl="/start?mode=signin">
                <button type="button" className={styles.linkBtn}>Sign out and use a different account</button>
              </SignOutButton>
            </div>
          )}

          {configured && !signedIn && mode === "signin" && (
            <div className={styles.clerkBox}>
              {/* signUpForceRedirectUrl: a Google sign-in that Clerk turns into a new sign-up also finishes at /start/finish. */}
              <SignIn routing="hash" forceRedirectUrl="/start/finish" signUpForceRedirectUrl="/start/finish" signUpUrl="/start" />
            </div>
          )}

          {configured && !signedIn && mode === "signup" && !ready && (
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

          {configured && !signedIn && mode === "signup" && ready && (
            <>
              {named && (
                <p className={styles.small}>
                  {named} ·{" "}
                  <button type="button" className={styles.linkBtn} onClick={() => setReady(false)}>Change</button>
                </p>
              )}
              <div className={styles.clerkBox}>
                <SignUp
                  routing="hash"
                  forceRedirectUrl="/start/finish"
                  signInForceRedirectUrl="/start/finish"
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
