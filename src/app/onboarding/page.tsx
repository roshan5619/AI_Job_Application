import { requireUser } from "@/lib/auth";
import OnboardingFlow from "./OnboardingFlow";

// Server component: gate on auth, then render the client-side flow.
export default async function OnboardingPage() {
  await requireUser();
  return <OnboardingFlow />;
}
