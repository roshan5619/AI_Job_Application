export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">
        The AI becomes your operator.
      </h1>
      <p className="text-lg text-neutral-600">
        Tell it your goal — &ldquo;Get me a remote ML job.&rdquo; It finds roles,
        tailors your resume, prepares applications, follows up, and schedules
        interviews. You just approve.
      </p>
      <a
        href="/onboarding"
        className="w-fit rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-neutral-800"
      >
        Start a mission
      </a>
    </main>
  );
}
