import type { Metadata } from "next";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import Dashboard from "./dashboard";

export const metadata: Metadata = { title: `Dashboard · ${BRAND}` };

// Demo user is hardcoded to synthetic customer C005 (all 8 PNC account types).
export default function DashboardPage() {
  return <Dashboard data={getDashboardData("C005")} />;
}
