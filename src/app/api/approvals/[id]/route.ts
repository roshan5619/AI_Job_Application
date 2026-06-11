import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { checkApplicationQuota } from "@/lib/billing/quota";
import { getCurrentUser, supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/approvals/:id — record the user's decision on an approval card and
 * emit application/approval.resolved, which un-pauses the await-approval
 * workflow. RLS ensures the user can only resolve their own approvals.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { decision, selectedSlot } = await request
    .json()
    .catch(() => ({ decision: "", selectedSlot: undefined }));
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "invalid decision" }, { status: 400 });
  }

  const supabase = await supabaseServer();

  // Load the approval (RLS-scoped) and guard against double-resolution.
  const { data: approval, error } = await supabase
    .from("approvals")
    .select("id, application_id, decision, type")
    .eq("id", id)
    .single();
  if (error || !approval) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (approval.decision) {
    return NextResponse.json({ ok: true, already: approval.decision });
  }

  // Enforce the monthly application quota only when approving an apply card.
  if (decision === "approved" && approval.type === "apply") {
    const quota = await checkApplicationQuota(user.id);
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: `Monthly application limit reached (${quota.used}/${quota.limit} on the ${quota.plan} plan). Upgrade to apply to more.`,
          code: "quota_exceeded",
        },
        { status: 402 },
      );
    }
  }

  const { error: updErr } = await supabase
    .from("approvals")
    .update({ decision, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (decision === "approved") {
    await supabase
      .from("applications")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", approval.application_id);
  }

  await inngest.send({
    name: "application/approval.resolved",
    data: {
      approvalId: id,
      applicationId: approval.application_id as string,
      decision,
      selectedSlot: typeof selectedSlot === "string" ? selectedSlot : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
