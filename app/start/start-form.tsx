"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND, SLOGAN } from "../../lib/brand";
import { loadPrefs } from "../../lib/prefs";
import styles from "../onboarding/onboarding.module.css";

// Sign-in is not connected to a back end yet. PNC's kit has working /auth/register and /auth/login
// routes; call them from submit() once the back end is running. Passwords are never stored here.
export default function StartForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem("foresight.pending", JSON.stringify({ name: name.trim(), email: email.trim() }));
    } catch {}
    const done = loadPrefs()?.completedAt;
    router.push(mode === "signin" && done ? "/dashboard" : "/onboarding");
  }

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
          <a className={styles.demoBtn} href="/onboarding?demo=1">Try the demo <span aria-hidden="true">→</span></a>
          <p className={styles.small}>Uses a sample customer. Nothing to type.</p>
        </section>

        <section className={styles.card} aria-labelledby="auth-title">
          <div className={styles.switch} role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? styles.switchOn : undefined} onClick={() => setMode("signup")}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? styles.switchOn : undefined} onClick={() => setMode("signin")}>Sign in</button>
          </div>
          <h2 id="auth-title" className={styles.cardTitle}>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
          <form onSubmit={submit} className={styles.form}>
            {mode === "signup" && (
              <label className={styles.field}>First name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
              </label>
            )}
            <label className={styles.field}>Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className={styles.field}>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required />
            </label>
            <button className={styles.primaryBtn}>{mode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          <p className={styles.small}>Prototype with synthetic data only. Not financial advice.</p>
        </section>
      </div>
    </main>
  );
}
