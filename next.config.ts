import type { NextConfig } from "next";

// Clerk (sign-in) loads its scripts and API from its own host, which is encoded in the publishable key.
// Only that host is allowed, plus Cloudflare's bot check that Clerk's sign-up uses and Clerk's avatar images.
const clerkHost = (() => {
  try {
    const encoded = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").split("_")[2] ?? "";
    const host = Buffer.from(encoded, "base64").toString().replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : "";
  } catch {
    return "";
  }
})();
const clerk = clerkHost ? ` ${clerkHost}` : "";
const captcha = " https://challenges.cloudflare.com";
// Clerk's sign-up protection loads a script from cdn.protect.clerk.com, then probes *.client.protect.clerk.com on
// several non-standard ports (8443, 18443, 2082, 992), so connections to that host need ":*". Blocking it can break sign-up.
const clerkProtect = " https://cdn.protect.clerk.com https://*.protect.clerk.com";
const clerkProtectConnect = " https://cdn.protect.clerk.com https://*.protect.clerk.com:*";

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") + clerk + captcha + clerkProtect + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.clerk.com; connect-src 'self'" + clerk + clerkProtectConnect + "; frame-src" + captcha + "; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
    ] }];
  },
};
export default config;
