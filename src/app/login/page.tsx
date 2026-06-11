"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      {sent ? (
        <p className="text-neutral-600">
          Check <span className="font-medium">{email}</span> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-neutral-300 px-4 py-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Email me a sign-in link"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </main>
  );
}
