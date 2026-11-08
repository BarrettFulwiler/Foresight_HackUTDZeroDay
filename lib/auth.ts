// Server-only. Clerk handles sign-up and sign-in (email + password, and Google/GitHub if turned on in Clerk).
// Clerk itself refuses a second sign-up with the same email and shows an error when signing in to an unknown account.
// Each Foresight account also gets a Nessie customer; its ID is kept on the Clerk user's public metadata.
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { createCustomer, deleteCustomer, openAccount } from "./nessie";
import { DEMO_COOKIE } from "./auth-client";

export { DEMO_COOKIE };

export type AccountType = "individual" | "company";
export type Member = { userId: string; type: AccountType; name: string; email: string; nessieCustomerId: string };
type Details = { type?: string; firstName?: string; lastName?: string; companyName?: string };

export const authConfigured = () => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** The signed-in member, or null if signed out or their account setup never finished. */
export async function currentMember(): Promise<Member | null> {
  if (!authConfigured()) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const m = user?.publicMetadata as Partial<Member> | undefined;
  if (!user || !m?.nessieCustomerId || !m.type) return null;
  return { userId, type: m.type, name: m.name ?? "", email: user.primaryEmailAddress?.emailAddress ?? "", nessieCustomerId: m.nessieCustomerId };
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
const settingUp = new Set<string>();

/**
 * Runs once right after Clerk signs someone in. Returns where to send them:
 * - an existing member goes to the dashboard;
 * - a brand-new sign-up (it carries the details from our form) gets a Nessie customer, then onboarding or the dashboard;
 * - someone new who used "Continue with Google" without our form (Clerk makes them a new user) gets a personal
 *   account from their Google profile, so Google works from both the Sign in and Create account tabs.
 *   Company accounts still need the Create account form (it asks for the company name).
 */
export async function finishSignIn(): Promise<string> {
  const { userId } = await auth();
  if (!userId) return "/start?mode=signin";
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  // Returning members pass through onboarding too: it forwards them to their dashboard if this browser already has their setup.
  if ((user.publicMetadata as Partial<Member>).nessieCustomerId) return "/onboarding?resume=1";

  const d = (user.unsafeMetadata ?? {}) as Details;
  // No type means they came straight from a provider like Google, not our form: treat them as a personal account.
  const type: AccountType = d.type === "company" ? "company" : "individual";
  const emailName = clean(user.primaryEmailAddress?.emailAddress?.split("@")[0]);
  const firstName = clean(d.firstName) || clean(user.firstName) || emailName;
  const lastName = clean(d.lastName) || clean(user.lastName); // some Google accounts have no last name
  const companyName = clean(d.companyName);
  if (type === "individual" ? !firstName : !companyName) {
    await client.users.deleteUser(userId).catch(() => {});
    return "/start?mode=signin&error=no_account";
  }

  if (settingUp.has(userId)) return "/onboarding"; // a double click is already creating this account
  settingUp.add(userId);
  let customerId = "";
  try {
    // Nessie requires a last name, so a single-name Google account gets a placeholder there (not in Clerk).
    const customer = type === "company" ? await createCustomer(companyName, "Company") : await createCustomer(firstName, lastName || "Member");
    customerId = customer.id;
    if (type === "company") {
      await openAccount(customerId, "Checking", "Business Checking");
      await openAccount(customerId, "Savings", "Business Savings");
    } else {
      await openAccount(customerId, "Checking", "Everyday Checking");
      await openAccount(customerId, "Savings", "Savings");
    }
    const name = type === "company" ? companyName : `${firstName} ${lastName}`.trim();
    await client.users.updateUser(userId, type === "company" ? { firstName: companyName } : { firstName, ...(lastName ? { lastName } : {}) });
    await client.users.updateUserMetadata(userId, { publicMetadata: { type, name, nessieCustomerId: customerId } });
    return "/onboarding"; // personal and business both set up their view next
  } catch {
    if (customerId) await deleteCustomer(customerId);
    return "/start?mode=signup&error=failed";
  } finally {
    settingUp.delete(userId);
  }
}
