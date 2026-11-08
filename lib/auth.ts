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
 * - anyone else (e.g. "Sign in with Google" for a Google account that never signed up, which Clerk turns into a new
 *   user) is removed again and told to create an account first.
 */
export async function finishSignIn(): Promise<string> {
  const { userId } = await auth();
  if (!userId) return "/start?mode=signin";
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if ((user.publicMetadata as Partial<Member>).nessieCustomerId) return "/dashboard";

  const d = user.unsafeMetadata as Details;
  const type: AccountType | null = d.type === "company" ? "company" : d.type === "individual" ? "individual" : null;
  const firstName = clean(d.firstName) || user.firstName || "";
  const lastName = clean(d.lastName) || user.lastName || "";
  const companyName = clean(d.companyName);
  if (!type || (type === "individual" ? !firstName || !lastName : !companyName)) {
    await client.users.deleteUser(userId).catch(() => {});
    return "/start?mode=signin&error=no_account";
  }

  if (settingUp.has(userId)) return "/dashboard"; // a double click is already creating this account
  settingUp.add(userId);
  let customerId = "";
  try {
    const customer = type === "company" ? await createCustomer(companyName, "Company") : await createCustomer(firstName, lastName);
    customerId = customer.id;
    if (type === "company") {
      await openAccount(customerId, "Checking", "Business Checking");
      await openAccount(customerId, "Savings", "Business Savings");
    } else {
      await openAccount(customerId, "Checking", "Everyday Checking");
      await openAccount(customerId, "Savings", "Savings");
    }
    const name = type === "company" ? companyName : `${firstName} ${lastName}`;
    await client.users.updateUser(userId, type === "company" ? { firstName: companyName } : { firstName, lastName });
    await client.users.updateUserMetadata(userId, { publicMetadata: { type, name, nessieCustomerId: customerId } });
    return type === "individual" ? "/onboarding" : "/dashboard";
  } catch {
    if (customerId) await deleteCustomer(customerId);
    return "/start?mode=signup&error=failed";
  } finally {
    settingUp.delete(userId);
  }
}
