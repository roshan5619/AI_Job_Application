import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { getCurrentUser, supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/missions — create a mission from a free-text goal and trigger the
 * parse → discover workflow. The mission starts in 'pending'; the workflow
 * flips it to 'active' once the goal is parsed.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { goal } = await request.json().catch(() => ({ goal: "" }));
  if (!goal || typeof goal !== "string" || goal.trim().length < 5) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("missions")
    .insert({ user_id: user.id, raw_goal: goal.trim(), status: "pending" })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await inngest.send({
    name: "mission/created",
    data: { missionId: data.id, userId: user.id },
  });

  return NextResponse.json({ missionId: data.id });
}
