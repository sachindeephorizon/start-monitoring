/**
 * Application Configuration
 * 
 * Centralized configuration management for the DeepHorizon app.
 * All environment variables and app settings are accessed through
 * this module.
 */

import Constants from 'expo-constants';
import { AppConfig } from '@/types';

/**
 * Get application configuration from environment variables
 */
export function getAppConfig(): AppConfig {
  const config: AppConfig = {
    supabaseUrl: Constants.expoConfig?.extra?.supabaseUrl || 
      process.env.EXPO_PUBLIC_SUPABASE_URL || 
      '',
    supabaseAnonKey: Constants.expoConfig?.extra?.supabaseAnonKey || 
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
      '',
    streamApiKey: Constants.expoConfig?.extra?.streamApiKey || 
      process.env.EXPO_PUBLIC_STREAM_API_KEY || 
      '',
    streamTokenUrl: Constants.expoConfig?.extra?.streamTokenUrl || 
      process.env.EXPO_PUBLIC_STREAM_TOKEN_URL || 
      '',
    streamAppId: Constants.expoConfig?.extra?.streamAppId || 
      process.env.EXPO_PUBLIC_STREAM_APP_ID || 
      'hp84m8c435v6',
    agentDashboardUrl: Constants.expoConfig?.extra?.agentDashboardUrl || 
      process.env.EXPO_PUBLIC_AGENT_DASHBOARD_URL || 
      '',
    env: (Constants.expoConfig?.extra?.env || 
      process.env.EXPO_PUBLIC_ENV || 
      'development') as 'development' | 'production',
  };

  return config;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return getAppConfig().env === 'development';
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return getAppConfig().env === 'production';
}

// Export the config instance
export const appConfig = getAppConfig();

