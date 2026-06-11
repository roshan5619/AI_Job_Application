import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Stripe needs the raw body + Node crypto for signature verification.
export const runtime = "nodejs";

/**
 * POST /api/stripe/webhook — keep the subscriptions table in sync with Stripe.
 * The signature is verified against STRIPE_WEBHOOK_SECRET; unverified payloads
 * are rejected.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      body,
      sig,
      env.stripeWebhookSecret(),
    );
  } catch (e) {
    log.warn("stripe webhook signature verification failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = supabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;
        if (userId && customerId) {
          const sub = subscriptionId
            ? await stripe().subscriptions.retrieve(subscriptionId)
            : null;
          await db.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan: "pro",
              status: sub?.status ?? "active",
              current_period_end: periodEnd(sub),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const isPro = sub.items.data.some(
          (i) => i.price.id === env.stripePricePro(),
        );
        await db
          .from("subscriptions")
          .update({
            stripe_subscription_id: sub.id,
            plan: isPro ? "pro" : "free",
            status: sub.status,
            current_period_end: periodEnd(sub),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", sub.customer as string);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .from("subscriptions")
          .update({
            plan: "free",
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", sub.customer as string);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    log.error("stripe webhook handler failed", {
      type: event.type,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function periodEnd(sub: Stripe.Subscription | null): string | null {
  const end = (sub as unknown as { current_period_end?: number } | null)
    ?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}
