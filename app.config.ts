import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Dynamic Expo config.
 *
 * Purpose:
 * - Make sure runtime config (Constants.expoConfig.extra) contains values that are
 *   supplied via environment variables in CI / EAS builds.
 *
 * Note:
 * - Razorpay Key ID is public (safe to expose in client).
 * - Never expose Razorpay Key Secret here.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // Expo passes a "config" object that may be partially typed at compile time.
  // At runtime it always contains the required fields (name/slug/etc).
  const base = config as unknown as ExpoConfig;
  const extra = (base.extra ?? {}) as Record<string, any>;

  return {
    ...base,
    extra: {
      ...extra,
      /**
       * CRITICAL (preview/production builds):
       * Standalone builds do not have access to your local `.env` at runtime.
       * We must inject required EXPO_PUBLIC_* values into `extra` at build time
       * so `Constants.expoConfig.extra.*` is populated on device.
       */
      env: process.env.EXPO_PUBLIC_ENV || extra.env,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey,
      streamApiKey: process.env.EXPO_PUBLIC_STREAM_API_KEY || extra.streamApiKey,
      streamTokenUrl: process.env.EXPO_PUBLIC_STREAM_TOKEN_URL || extra.streamTokenUrl,
      agentDashboardUrl: process.env.EXPO_PUBLIC_AGENT_DASHBOARD_URL || extra.agentDashboardUrl,
      streamAppId: process.env.EXPO_PUBLIC_STREAM_APP_ID || extra.streamAppId,
      redirectUrl: process.env.EXPO_PUBLIC_REDIRECT_URL || extra.redirectUrl || 'deephorizon://auth',

      // Public key is safe to expose in client.
      razorpayKeyId: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || extra.razorpayKeyId,
    },
  };
};

