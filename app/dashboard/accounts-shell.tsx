"use client";
import { SignOutButton } from "@clerk/nextjs";
import { BRAND } from "../../lib/brand";
import type { Audience } from "../../lib/account-products";
import AccountsManager from "./accounts-manager";
import styles from "./dashboard.module.css";

// What a signed-in member sees before they've added enough accounts for a forecast: just the Accounts tab.
// Once they have a checking account (plus savings, for individuals), the full dashboard opens.
export default function AccountsShell({ name, audience, missing }: { name: string; audience: Audience; missing?: string }) {
  return (
    <main className={styles.page}>
      <header className={styles.navBar}>
        <div className={styles.navInner}>
          <a className={styles.navBrand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
          <nav className={styles.navTabs} role="tablist" aria-label="Dashboard">
            <button type="button" role="tab" aria-selected className={styles.navTabOn}>Accounts</button>
          </nav>
          <div className={styles.navProfile}>
            <div>
              <p className={styles.navHello}>{audience === "company" ? name : `Welcome, ${name.split(" ")[0]}`}</p>
              <p className={styles.navSub}>Signed in · let&rsquo;s add your accounts</p>
            </div>
            <a className={styles.avatar} href="/onboarding" title="Change your setup" aria-label="Change your setup">{name.slice(0, 1).toUpperCase() || "?"}</a>
            <SignOutButton redirectUrl="/">
              <button type="button" className={styles.signOut}>Sign out</button>
            </SignOutButton>
          </div>
        </div>
      </header>
      <div className={styles.body}>
        <AccountsManager audience={audience} missing={missing} />
        {/* Adding accounts never sends them away; this button opens the dashboard when they're ready. */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className={styles.primaryBtn} onClick={() => window.location.reload()}>Continue to my dashboard</button>
        </div>
      </div>
      <footer className={styles.foot}>Your accounts live in Capital One&rsquo;s Nessie sandbox · Educational prototype · Not financial advice.</footer>
    </main>
  );
}
