/**
 * Emergency Service
 * 
 * Core emergency triggering logic. This is the MOST CRITICAL service
 * in the entire app - it must be simple, reliable, and never fail silently.
 * 
 * iOS SAFETY RULES (CRITICAL):
 * - Emergency must be created with ONE network call
 * - No retries, no waiting, no escalation locally
 * - Location is optional - emergency proceeds even if location fails
 * - Emergency must exist on server even if app crashes immediately after
 * - Server handles all escalation and agent notification
 * 
 * DESIGN PRINCIPLE:
 * > An emergency must be fully created on the server in ≤1 network call.
 * > Uses dashboard API to bypass RLS policies.
 */

import * as Location from 'expo-location';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { EmergencyPayload, EmergencyCreationResult, Emergency } from './emergency.types';
import { LOCATION_CAPTURE_TIMEOUT_MS } from './emergency.constants';
import { dashboardApiClient } from '@/services/dashboardApiClient';

// Re-export types for convenience
export type { Emergency, EmergencyPayload, EmergencyCreationResult };

/**
 * Emergency Service
 * 
 * Provides methods for emergency operations.
 * All escalation and agent notification logic runs server-side.
 */
export const EmergencyService = {
  /**
   * Trigger an emergency
   * 
   * This is the ONLY emergency method the app needs.
   * It creates an emergency record on the server with ONE network call.
   * 
   * FLOW:
   * 1. Capture location (optional, non-blocking)
   * 2. Create emergency record in database (ONE network call)
   * 3. Server handles agent assignment, notifications, escalation
   * 4. Return success/failure
   * 
   * CRITICAL: This method must NEVER:
   * - Wait for location accuracy
   * - Retry on failure
   * - Implement escalation logic
   * - Block on network requests beyond the insert
   * 
   * @param payload Optional emergency payload (description, location)
   * @returns Emergency creation result
   */
  async trigger(payload?: EmergencyPayload): Promise<EmergencyCreationResult> {
    try {
      // Get current user — prefer pre-validated userId/accessToken from caller
      // to avoid redundant getSession() calls that contend on the SDK auth lock.
      let userId = payload?.userId;
      let accessToken = payload?.accessToken;

      if (!userId) {
        const session = await ensureValidSession();
        userId = session?.user?.id;
        accessToken = accessToken || session?.access_token;
      }

      if (!userId) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Capture location (optional, non-blocking)
      // If location capture fails or times out, emergency still proceeds
      let locationData: {
        latitude?: number;
        longitude?: number;
        accuracy?: number;
      } | null = null;

      try {
        // Try to get current location with timeout
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Location timeout')), LOCATION_CAPTURE_TIMEOUT_MS);
        });

        const location = await Promise.race([locationPromise, timeoutPromise]);
        
        locationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy || undefined,
        };
      } catch (locationError) {
        // Location capture failed - this is OK, emergency still proceeds
        console.warn('[Emergency Service] Location capture failed, proceeding without location:', locationError);
        locationData = null;
      }

      // Use provided location if available, otherwise use captured location
      const finalLocation = payload?.latitude !== undefined && payload?.longitude !== undefined
        ? {
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
          }
        : locationData;

      // Create emergency via dashboard API (bypasses RLS and handles agent assignment)
      // This is the ONLY network call required
      // Server will handle:
      // - Database insert (bypasses RLS)
      // - Agent assignment
      // - Push notifications to agents
      // - Escalation timers
      // - Resolution tracking
      const locationObj = finalLocation?.latitude !== undefined && finalLocation?.longitude !== undefined
        ? { lat: finalLocation.latitude, lng: finalLocation.longitude }
        : undefined;

      console.log('[Emergency Service] 🚨 CREATING EMERGENCY via dashboard API...');
      if (__DEV__) {
        console.log('[Emergency Service] Request:', {
          mobileUserId: userId,
          description: payload?.description || 'Emergency button pressed - User requested immediate assistance',
          location: locationObj,
          priority: 'emergency',
        });
      }

      const result = await dashboardApiClient.createEmergency({
        mobileUserId: userId,
        description: payload?.description || 'Emergency button pressed - User requested immediate assistance',
        location: locationObj,
        priority: 'emergency',
      }, accessToken);

      if (__DEV__) console.log('[Emergency Service] Dashboard API response:', result);

      if (!result.success) {
        console.error('[Emergency Service] ❌ Dashboard API failed:', result.error);

        /**
         * ✅ PRODUCTION FIX: Fallback to direct Supabase insert
         * If dashboard API fails (network issue, server down, etc.),
         * try direct database insert as backup. This ensures emergency
         * is ALWAYS created even if dashboard is unavailable.
         */
        console.warn('[Emergency Service] 🔄 Attempting fallback: direct Supabase insert...');
        try {
          const { data: emergency, error: insertError } = await supabase
            .from('emergencies')
            .insert({
              mobile_user_id: userId,
              description: payload?.description || 'Emergency button pressed - User requested immediate assistance',
              location: locationObj ? `(${locationObj.lng},${locationObj.lat})` : undefined,
              priority: 'emergency',
              status: 'active',
              triggered_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertError) {
            console.error('[Emergency Service] ❌ Fallback Supabase insert failed:', insertError);
            return {
              success: false,
              error: `Both dashboard API and direct insert failed. API: ${result.error}, DB: ${insertError.message}`,
            };
          }

          if (!emergency?.id) {
            return {
              success: false,
              error: 'Emergency created via fallback but no ID returned',
            };
          }

          console.log('[Emergency Service] ✅ FALLBACK SUCCESS - Emergency created via direct Supabase insert:', emergency.id);
          console.warn('[Emergency Service] ⚠️ Note: Agent assignment may not have occurred (dashboard API was down)');

          return {
            success: true,
            emergencyId: emergency.id,
          };
        } catch (fallbackError: any) {
          console.error('[Emergency Service] ❌ Fallback failed with exception:', fallbackError);
          return {
            success: false,
            error: fallbackError.message || 'Failed to create emergency',
          };
        }
      }

      if (!result.emergencyId) {
        console.error('[Emergency Service] ❌ Emergency created but no ID returned:', result);
        return {
          success: false,
          error: 'Emergency created but no ID returned',
        };
      }

      console.log('[Emergency Service] ✅ SUCCESS - Emergency created via dashboard API:', result.emergencyId);

      return {
        success: true,
        emergencyId: result.emergencyId,
      };
    } catch (error: any) {
      console.error('[Emergency Service] Unexpected error triggering emergency:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Get current emergency for user
   * 
   * Retrieves the most recent active emergency for the current user.
   * 
   * @returns Current emergency, or null if none exists
   */
  async getCurrentEmergency(): Promise<Emergency | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('emergencies')
        .select('*')
        .eq('mobile_user_id', user.id)
        .in('status', ['active', 'triggered', 'acknowledged', 'in_progress'])
        .order('triggered_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data as Emergency;
    } catch (error) {
      console.error('[Emergency Service] Error getting current emergency:', error);
      return null;
    }
  },

  /**
   * Get emergency by ID
   * 
   * Retrieves a specific emergency by its ID.
   * 
   * @param emergencyId Emergency ID
   * @returns Emergency record, or null if not found
   */
  async getEmergencyById(emergencyId: string): Promise<Emergency | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('emergencies')
        .select('*')
        .eq('id', emergencyId)
        .eq('mobile_user_id', user.id)
        .single();

      if (error || !data) {
        return null;
      }

      return data as Emergency;
    } catch (error) {
      console.error('[Emergency Service] Error getting emergency by ID:', error);
      return null;
    }
  },

  /**
   * Cancel an emergency
   * 
   * Cancels the current active emergency for the user.
   * 
   * @param emergencyId Emergency ID to cancel
   * @returns Success status
   */
  async cancel(emergencyId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('emergencies')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', emergencyId);

      if (error) {
        console.error('[Emergency Service] Failed to cancel emergency:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Emergency Service] Error cancelling emergency:', error);
      return false;
    }
  },
};

