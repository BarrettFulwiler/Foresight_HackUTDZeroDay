// PATCH  /api/accounts/<id> { name, values } → the saved account (a new balance gives it a new id; see updateAccount)
// DELETE /api/accounts/<id>                  → removes it from Nessie
// Only the signed-in member's own accounts can be changed; any other id is a 404.
import { NextRequest, NextResponse } from "next/server";
import { currentMember } from "../../../../lib/auth";
import { fail, removeAccount, updateAccount } from "../../../../lib/member-accounts";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in to change accounts." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ account: await updateAccount(m, id, body) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in to change accounts." }, { status: 401 });
  const { id } = await params;
  try {
    await removeAccount(m, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
