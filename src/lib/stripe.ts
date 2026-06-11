import Stripe from "stripe";
import { env } from "./env";

let _stripe: Stripe | null = null;

/** Lazy Stripe client (server-only). */
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey());
  return _stripe;
}
