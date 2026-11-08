import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, authConfigured, currentMember } from "../../../lib/auth";
import { BRAND } from "../../../lib/brand";
import { getRandomCompany } from "../../../lib/companies";
import { companyDashboardData, todayIso } from "../../../lib/company-dashboard";
import Dashboard from "../dashboard";
import base from "../dashboard.module.css";

export const metadata: Metadata = { title: `Company · ${BRAND}` };
export const dynamic = "force-dynamic"; // a different company is pulled from Nessie on every visit

// The company dashboard: the same dashboard and tools as the individual one, on a seeded Nessie company's data.
// Reached by choosing "My company" in onboarding.
export default async function CompanyPage() {
  // Same gate as the personal dashboard: signed-in members and demo visitors. A personal account goes to its own.
  const member = await currentMember();
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  if (authConfigured() && !member && !demo) redirect("/start?mode=signin&error=signin_required");
  if (member?.type === "individual") redirect("/dashboard");
  const result = await getRandomCompany();
  if ("company" in result) {
    const { data, info } = companyDashboardData(result.company, todayIso());
    return <Dashboard data={data} source="nessie" company={info} member={member ? { name: member.name, type: member.type } : undefined} />;
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
