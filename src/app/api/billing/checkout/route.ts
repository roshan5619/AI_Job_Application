import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * GET /api/billing/checkout — start a Stripe Checkout for the Pro plan, reusing
 * (or creating) the user's Stripe customer.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: sub } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await db
      .from("subscriptions")
      .upsert(
        { user_id: user.id, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.stripePricePro(), quantity: 1 }],
    success_url: `${env.appUrl()}/inbox?billing=success`,
    cancel_url: `${env.appUrl()}/inbox?billing=cancel`,
    metadata: { userId: user.id },
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}
