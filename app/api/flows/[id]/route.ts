// PATCH /api/flows/<id> { name, amount, accountId, day, category? }   DELETE /api/flows/<id>
// Only the signed-in member's own income and expenses; anything else is a 404.
import { NextRequest, NextResponse } from "next/server";
import { currentMember } from "../../../../lib/auth";
import { fail, removeFlow, updateFlow } from "../../../../lib/member-accounts";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ flow: await updateFlow(m, (await params).id, await req.json().catch(() => ({}))) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await currentMember();
  if (!m) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await removeFlow(m, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
