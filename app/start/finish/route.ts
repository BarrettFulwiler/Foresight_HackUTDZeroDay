// Clerk sends people here after sign-up or sign-in. Sets up their Foresight account if it's new, then forwards them.
import { NextResponse } from "next/server";
import { finishSignIn } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.redirect(new URL(await finishSignIn(), req.url));
}
