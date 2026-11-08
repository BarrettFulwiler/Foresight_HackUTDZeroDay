import type { Metadata } from "next";
import { BRAND } from "../../lib/brand";
import { getDashboardData } from "../../lib/finance";
import { summarize } from "../../lib/summary";
import Onboarding from "./onboarding";

export const metadata: Metadata = { title: `Set up · ${BRAND}` };

export default function OnboardingPage() {
  return <Onboarding summary={summarize(getDashboardData("C005"))} />;
}
