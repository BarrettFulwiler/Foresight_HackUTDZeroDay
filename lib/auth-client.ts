// Small browser-side helpers for sign-in. Clerk's own components handle the actual sign-up and sign-in.

// "Try the demo" sets this so demo visitors reach the dashboard without an account (it only shows sample data).
export const DEMO_COOKIE = "fs_demo";
export const markDemo = () => {
  document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=86400; samesite=lax`;
};

/** Friendly text for the error codes /start/finish sends back to /start. */
export const AUTH_ERRORS: Record<string, string> = {
  no_account: "There's no Foresight account for that login yet. Create an account first.",
  signin_required: "Please sign in to see your dashboard.",
  failed: "Something went wrong setting up your account. Please try again.",
};
