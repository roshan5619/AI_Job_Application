import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest's HTTP endpoint. The dev server (npm run inngest) and Inngest Cloud
// discover and invoke registered functions through this route.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
