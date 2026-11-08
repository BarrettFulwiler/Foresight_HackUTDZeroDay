import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, authConfigured, currentMember } from "../../../lib/auth";
import { BRAND } from "../../../lib/brand";
import { getRandomCompany } from "../../../lib/companies";
import { companyDashboardData, todayIso } from "../../../lib/company-dashboard";
import { memberDashboard } from "../../../lib/member-accounts";
import AccountsShell from "../accounts-shell";
import Dashboard from "../dashboard";
import base from "../dashboard.module.css";

export const metadata: Metadata = { title: `Company · ${BRAND}` };
export const dynamic = "force-dynamic"; // a different company is pulled from Nessie on every visit

// The company dashboard: the same dashboard and tools as the individual one, on a seeded Nessie company's data.
// Reached by choosing "My company" in onboarding.
// Like the personal dashboard, it needs a signed-in account or the demo (open when Clerk isn't set up on this machine).
export default async function CompanyPage() {
  const member = await currentMember();
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  if (authConfigured() && !member && !demo) redirect("/start?mode=signin&error=signin_required");

  // A signed-in company sees its own accounts from Nessie; individuals have the personal dashboard.
  if (member) {
    if (member.type !== "company") redirect("/dashboard");
    const own = await memberDashboard(member).catch(() => null);
    if (!own) return <AccountsShell name={member.name} audience="company" />;
    const info = { id: member.nessieCustomerId, name: member.name, industry: "", city: "", pool: 0 };
    return <Dashboard data={own.data} source="nessie" company={info} member={{ name: member.name, type: member.type, ready: own.ready, missing: own.missing }} />;
  }

  // The demo: a random seeded "[Biz]" company on each visit.
  const result = await getRandomCompany();
  if ("company" in result) {
    const { data, info } = companyDashboardData(result.company, todayIso());
    return <Dashboard data={data} source="nessie" company={info} />;
  }
  return (
    <main className={base.page}>
      <header className={base.navBar}>
        <div className={base.navInner}>
          <a className={base.navBrand} href="/"><img src="/brand/foresight-eye.png" alt="" width={43} height={24} style={{ display: "block" }} />{BRAND}</a>
        </div>
      </header>
      <div className={base.body}>
        <section className={base.panel} role="alert">
          <h1 className={base.cardTitle}>Can&rsquo;t load a company</h1>
          <p className={base.cardSub}>{result.error}</p>
        </section>
      </div>
      <footer className={base.foot}>Synthetic data only · Pulled live from Nessie · Educational prototype · Not financial advice.</footer>
    </main>
  );
}
