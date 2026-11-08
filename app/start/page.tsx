import type { Metadata } from "next";
import { authConfigured } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import StartForm from "./start-form";

export const metadata: Metadata = { title: `Get started · ${BRAND}` };
export const dynamic = "force-dynamic";

// ?mode=signin opens the Sign in tab; ?error=<code> shows why the last attempt didn't work (see AUTH_ERRORS).
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <StartForm initialMode={sp.mode === "signin" ? "signin" : "signup"} error={typeof sp.error === "string" ? sp.error : undefined} configured={authConfigured()} />;
}
