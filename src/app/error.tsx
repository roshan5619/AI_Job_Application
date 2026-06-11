"use client";

import { useEffect } from "react";

/** App-wide error boundary. Logs to the console (picked up by the platform's
 * log drain) and offers a recovery action. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "client error boundary",
        digest: error.digest,
        error: error.message,
        time: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-neutral-600">
        The agent hit a snag. You can retry — your mission keeps running in the
        background.
      </p>
      <button
        onClick={reset}
        className="mx-auto w-fit rounded-lg bg-black px-5 py-2 font-medium text-white hover:bg-neutral-800"
      >
        Try again
      </button>
    </main>
  );
}
