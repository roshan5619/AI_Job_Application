import { NextRequest, NextResponse } from "next/server";
import { parseResume } from "@/lib/anthropic";
import { extractResumeText } from "@/lib/resume/extract";
import { getCurrentUser, supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/profile/resume — multipart upload of the user's resume. Stores the
 * original in the 'resumes' bucket, extracts text, parses it into a structured
 * CandidateProfile via Claude, and saves the profile.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("resume");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "resume file is required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractResumeText(bytes, file.type);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read resume" },
      { status: 400 },
    );
  }
  if (text.length < 50) {
    return NextResponse.json(
      { error: "resume text too short — is the file readable?" },
      { status: 400 },
    );
  }

  const supabase = await supabaseServer();

  // Store the original upload (RLS-scoped path: <userId>/...).
  const storagePath = `${user.id}/original-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: fileRow, error: fileError } = await supabase
    .from("resume_files")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      kind: "original",
      filename: file.name,
    })
    .select("id")
    .single();
  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 500 });
  }

  // Parse into a structured profile (Claude).
  const profile = await parseResume(text);

  const { error: profileError } = await supabase.from("candidate_profiles").upsert(
    {
      user_id: user.id,
      profile,
      base_resume_file_id: fileRow.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
