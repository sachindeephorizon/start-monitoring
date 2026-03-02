/**
 * Environment configuration for DeepHorizon Security app
 * This provides a robust way to handle environment variables
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

interface EnvironmentConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  api: {
    baseUrl: string;
  };
  stream: {
    apiKey: string;
    videoApiKey: string;
    videoToken: string;
  };
  features: {
    inAppCallsEnabled: boolean;
    dynamicRoomsEnabled: boolean;
  };
}

// Get environment variables with fallbacks
const getEnvVar = (key: string, fallback: string): string => {
  return process.env[key] || fallback;
};

const resolveDevHostFallback = (): string => {
  // Always use Vercel URL as fallback
  return 'https://deep-horizon-dashboard.vercel.app';
};

const getApiBaseUrl = (): string => {
  // PRIMARY: Vercel URL is ALWAYS the default (even in development)
  // FALLBACK: Localhost/IP only if explicitly enabled with EXPO_PUBLIC_USE_LOCAL_API=true
  // Priority order:
  // 1. Check if local API is explicitly enabled
  // 2. Environment variables (Vercel URLs only, localhost ignored unless explicitly enabled)
  // 3. Constants.expoConfig.extra (Vercel URLs only, localhost ignored unless explicitly enabled)
  // 4. DEFAULT: Vercel production URL
  
  const vercelUrl = 'https://deep-horizon-dashboard.vercel.app';
  const allowLocalApi = getEnvVar('EXPO_PUBLIC_USE_LOCAL_API', '').toLowerCase() === 'true';
  
  // If local API is explicitly enabled, check for localhost/IP URLs
  if (allowLocalApi && __DEV__) {
    // Check environment variables for localhost/IP
    const explicitApiBaseRaw = 
      getEnvVar('EXPO_PUBLIC_API_BASE', '') ||
      getEnvVar('EXPO_PUBLIC_AGENT_DASHBOARD_URL', '') ||
      getEnvVar('EXPO_PUBLIC_API_BASE_URL', '') ||
      getEnvVar('EXPO_PUBLIC_DEV_API_BASE', '');
    
    if (explicitApiBaseRaw) {
      const isLocalNetwork = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(explicitApiBaseRaw);
      if (isLocalNetwork) {
        console.log('✅ Using local development URL (EXPO_PUBLIC_USE_LOCAL_API=true):', explicitApiBaseRaw);
        return explicitApiBaseRaw;
      }
    }
    
    // Check Constants.expoConfig.extra for localhost/IP
    try {
      const extra = (Constants?.expoConfig?.extra as any) || {};
      const agentDashboardUrl = extra.agentDashboardUrl;
      if (agentDashboardUrl && typeof agentDashboardUrl === 'string' && agentDashboardUrl.trim()) {
        const isLocalNetwork = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(agentDashboardUrl);
        if (isLocalNetwork) {
          console.log('✅ Using local development URL from app.config.ts (EXPO_PUBLIC_USE_LOCAL_API=true):', agentDashboardUrl);
          return agentDashboardUrl;
        }
      }
    } catch (error) {
      // Ignore errors accessing Constants
    }
  }
  
  // PRIMARY: Check for Vercel URLs in environment variables (ignore localhost/IP)
  const explicitApiBaseRaw = 
    getEnvVar('EXPO_PUBLIC_API_BASE', '') ||
    getEnvVar('EXPO_PUBLIC_AGENT_DASHBOARD_URL', '') ||
    getEnvVar('EXPO_PUBLIC_API_BASE_URL', '');
  
  if (explicitApiBaseRaw) {
    const isLocalNetwork = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(explicitApiBaseRaw);
    
    if (isLocalNetwork) {
      // Localhost/IP detected but not explicitly enabled - use Vercel URL instead
      console.warn('⚠️ Local network IP detected but EXPO_PUBLIC_USE_LOCAL_API is not set to "true". Using Vercel URL instead:', explicitApiBaseRaw, '→', vercelUrl);
      console.warn('💡 To use local API, set EXPO_PUBLIC_USE_LOCAL_API=true in your environment');
      return vercelUrl;
    }
    
    // Valid Vercel URL or other non-local URL
    console.log('✅ Using API Base URL from environment variable:', explicitApiBaseRaw);
    return explicitApiBaseRaw;
  }
  
  // Check Constants.expoConfig.extra (where app.config.ts stores agentDashboardUrl)
  try {
    const extra = (Constants?.expoConfig?.extra as any) || {};
    const agentDashboardUrl = extra.agentDashboardUrl;
    if (agentDashboardUrl && typeof agentDashboardUrl === 'string' && agentDashboardUrl.trim()) {
      const isLocalNetwork = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(agentDashboardUrl);
      
      if (isLocalNetwork) {
        // Localhost/IP detected but not explicitly enabled - use Vercel URL instead
        console.warn('⚠️ Local network IP detected in app.config.ts but EXPO_PUBLIC_USE_LOCAL_API is not set to "true". Using Vercel URL instead:', agentDashboardUrl, '→', vercelUrl);
        console.warn('💡 To use local API, set EXPO_PUBLIC_USE_LOCAL_API=true in your environment');
        return vercelUrl;
      }
      
      // Valid Vercel URL or other non-local URL
      console.log('✅ Using API Base URL from app.config.ts (agentDashboardUrl):', agentDashboardUrl);
      return agentDashboardUrl;
    }
  } catch (error) {
    // Ignore errors accessing Constants
  }
  
  // DEFAULT: Always use Vercel URL as primary
  console.log('✅ Using default Vercel production URL:', vercelUrl);
  return vercelUrl;
};

// Get Stream token URL - uses EXPO_PUBLIC_STREAM_TOKEN_URL if set, otherwise falls back to apiBaseUrl + /api/stream/video-token
const getStreamTokenUrl = (): string => {
  // Priority order:
  // 1. EXPO_PUBLIC_STREAM_TOKEN_URL (explicit configuration)
  // 2. NEXT_PUBLIC_STREAM_TOKEN_URL (for compatibility)
  // 3. Constants.expoConfig.extra.streamTokenUrl (from app.config.ts)
  // 4. Fallback: apiBaseUrl + /api/stream/video-token
  
  const explicitTokenUrl = 
    getEnvVar('EXPO_PUBLIC_STREAM_TOKEN_URL', '') ||
    getEnvVar('NEXT_PUBLIC_STREAM_TOKEN_URL', '');
  
  if (explicitTokenUrl) {
    console.log('✅ Using Stream token URL from environment variable:', explicitTokenUrl);
    return explicitTokenUrl;
  }
  
  // Check Constants.expoConfig.extra (where app.config.ts stores streamTokenUrl)
  try {
    const extra = (Constants?.expoConfig?.extra as any) || {};
    const streamTokenUrl = extra.streamTokenUrl;
    if (streamTokenUrl && typeof streamTokenUrl === 'string' && streamTokenUrl.trim()) {
      console.log('✅ Using Stream token URL from app.config.ts:', streamTokenUrl);
      return streamTokenUrl;
    }
  } catch (error) {
    // Ignore errors accessing Constants
  }
  
  // Fallback: Use apiBaseUrl + /api/stream/video-token
  const fallbackUrl = `${getApiBaseUrl()}/api/stream/video-token`;
  console.log('✅ Using default Stream token URL (apiBaseUrl + /api/stream/video-token):', fallbackUrl);
  return fallbackUrl;
};

// Check if dashboard is available
const isDashboardAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'development';

// Development environment configuration
const developmentConfig: EnvironmentConfig = {
  supabase: {
    url: getEnvVar('EXPO_PUBLIC_SUPABASE_URL', ''),
    anonKey: getEnvVar('EXPO_PUBLIC_SUPABASE_ANON_KEY', ''),
  },
  api: {
    baseUrl: getApiBaseUrl(),
  },
  stream: {
    apiKey: getEnvVar('EXPO_PUBLIC_STREAM_API_KEY', ''),
    videoApiKey: getEnvVar('EXPO_PUBLIC_STREAM_VIDEO_API_KEY', ''),
    videoToken: getEnvVar('EXPO_PUBLIC_STREAM_VIDEO_TOKEN', ''),
  },
  features: {
    inAppCallsEnabled: getEnvVar('EXPO_PUBLIC_IN_APP_CALLS_ENABLED', 'true') === 'true',
    dynamicRoomsEnabled: getEnvVar('EXPO_PUBLIC_DYNAMIC_ROOMS_ENABLED', 'true') === 'true',
  },
};

// Production environment configuration
const productionConfig: EnvironmentConfig = {
  supabase: {
    url: getEnvVar('EXPO_PUBLIC_SUPABASE_URL', ''),
    anonKey: getEnvVar('EXPO_PUBLIC_SUPABASE_ANON_KEY', ''),
  },
  api: {
    baseUrl: getApiBaseUrl(),
  },
  stream: {
    apiKey: getEnvVar('EXPO_PUBLIC_STREAM_API_KEY', ''),
    videoApiKey: getEnvVar('EXPO_PUBLIC_STREAM_VIDEO_API_KEY', ''),
    videoToken: getEnvVar('EXPO_PUBLIC_STREAM_VIDEO_TOKEN', ''),
  },
  features: {
    inAppCallsEnabled: getEnvVar('EXPO_PUBLIC_IN_APP_CALLS_ENABLED', 'true') === 'true',
    dynamicRoomsEnabled: getEnvVar('EXPO_PUBLIC_DYNAMIC_ROOMS_ENABLED', 'true') === 'true',
  },
};

// Export the appropriate configuration
export const config: EnvironmentConfig = isDevelopment ? developmentConfig : productionConfig;

// Export individual values for convenience
export const {
  supabase: { url: supabaseUrl, anonKey: supabaseAnonKey },
  api: { baseUrl: apiBaseUrl },
  stream: {
    apiKey: streamApiKey,
    videoApiKey: streamVideoApiKey,
    videoToken: streamVideoToken,
  },
  features: { 
    inAppCallsEnabled: isInAppCallsEnabled, 
    dynamicRoomsEnabled: isDynamicRoomsEnabled 
  },
} = config;

export const videoCallRequestUrl = `${apiBaseUrl}/api/video-call-request`;

// Export Stream token URL (computed value)
export const streamTokenUrl = getStreamTokenUrl();

// Export helper functions for external use
export { getApiBaseUrl, getStreamTokenUrl, isDashboardAvailable };

// Debug logging - only show essential info
if (isDevelopment) {
  console.log('🔧 Environment Configuration:', {
    environment: isDevelopment ? 'development' : 'production',
    apiBaseUrl,
    inAppCallsEnabled: isInAppCallsEnabled,
    dynamicRoomsEnabled: isDynamicRoomsEnabled,
  });
}

