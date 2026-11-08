import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { authConfigured } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import StartForm from "./start-form";

export const metadata: Metadata = { title: `Get started · ${BRAND}` };
export const dynamic = "force-dynamic";

// ?mode=signin opens the Sign in tab; ?error=<code> shows why the last attempt didn't work (see AUTH_ERRORS).
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  let signedIn = false;
  if (authConfigured()) {
    signedIn = Boolean((await auth()).userId);
    // Already signed in (e.g. right after "Continue with Google"): Clerk's sign-in box would render nothing,
    // so finish setting up the account instead. With an error we stay here, so a failed setup can't loop.
    if (signedIn && !error) redirect("/start/finish");
  }
  return <StartForm initialMode={sp.mode === "signin" ? "signin" : "signup"} error={error} configured={authConfigured()} signedIn={signedIn} />;
}
