// (Named middleware.ts, not proxy.ts: Clerk 7.9 loops forever under Next 16's proxy.ts.)
// Lets Clerk read the session on every request, so server pages can call auth().
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
