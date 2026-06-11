/**
 * Centralized env access. Throws early (server-side) when a required var is
 * missing, so misconfiguration fails loudly at startup rather than mid-workflow.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // Anthropic
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),

  // Supabase
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  // Encryption
  integrationEncryptionKey: () => required("INTEGRATION_ENCRYPTION_KEY"),

  // Job sources
  adzunaAppId: () => optional("ADZUNA_APP_ID"),
  adzunaAppKey: () => optional("ADZUNA_APP_KEY"),
  usaJobsApiKey: () => optional("USAJOBS_API_KEY"),
  usaJobsUserAgent: () => optional("USAJOBS_USER_AGENT"),

  // Google OAuth
  googleClientId: () => required("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET"),
  googleOAuthRedirectUri: () => required("GOOGLE_OAUTH_REDIRECT_URI"),

  // Stripe
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  stripePricePro: () => required("STRIPE_PRICE_PRO"),

  // App
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
