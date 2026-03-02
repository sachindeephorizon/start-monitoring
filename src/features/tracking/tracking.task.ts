/**
 * Background Location Tracking Task
 * 
 * THIS IS THE MOST CRITICAL FILE FOR iOS BACKGROUND LOCATION.
 * 
 * This file defines the background task that runs when iOS delivers
 * location updates. It runs WITHOUT React, WITHOUT UI, WITHOUT
 * JavaScript timers, and WITHOUT app context.
 * 
 * iOS SAFETY RULES (CRITICAL):
 * - ❌ NO React imports
 * - ❌ NO UI components
 * - ❌ NO JavaScript timers
 * - ❌ NO context providers
 * - ❌ NO state management
 * - ✅ Direct Supabase calls only
 * - ✅ Immediate data transmission
 * - ✅ Minimal processing
 * 
 * When iOS has a location update:
 * 1. iOS wakes the app (if needed)
 * 2. TaskManager calls this function
 * 3. Location is sent immediately to server
 * 4. App may be suspended again
 * 
 * The app NEVER "waits" for the next update.
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from './tracking.constants';
import { supabase, ensureValidSession } from '@/lib/supabase';

/**
 * Background location tracking task
 * 
 * This function is called by iOS/Android when location updates are available.
 * It runs in a separate process/context and does NOT have access to React state.
 * 
 * IMPORTANT: This function must be:
 * - Fast (iOS limits background execution time)
 * - Reliable (failures are silent)
 * - Stateless (no access to app state)
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Location Task] Error:', error);
    return;
  }

  type LocationTaskData = { locations: Location.LocationObject[] };
  const { locations } = (data as LocationTaskData) || { locations: [] };

  if (!locations || locations.length === 0) {
    return;
  }

  // Get the most recent location
  const location = locations[locations.length - 1];
  if (!location) {
    return;
  }

  const {
    latitude,
    longitude,
    accuracy,
    altitude,
    heading,
    speed,
  } = location.coords;

  const timestamp = new Date().toISOString();

  try {
    // Get the current user's active tracking session
    // We need to do this because we don't have React context in background task
    const session = await ensureValidSession();
    const user = session?.user;
    
    if (!user) {
      // No authenticated user - can't track location
      console.warn('[Location Task] No authenticated user');
      return;
    }

    // Get the active tracking session for this user
    // Note: tracking_sessions table uses mobile_user_id, not user_id
    const { data: activeSession, error: sessionError } = await supabase
      .from('tracking_sessions')
      .select('id')
      .eq('mobile_user_id', user.id)
      .eq('status', 'active')
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !activeSession) {
      // Distinguish between "no rows found" (genuinely no active session) and network/auth errors.
      // PGRST116 = no rows matched .single() — that's the only case where we should stop tracking.
      // Any other error (network timeout, JWT expired, etc.) is transient — keep tracking alive.
      const isNoRows = sessionError && (sessionError as any).code === 'PGRST116';
      if (isNoRows || (!sessionError && !activeSession)) {
        console.warn('[Location Task] No active tracking session, stopping updates');
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } else {
        console.warn('[Location Task] Transient error querying session, skipping this update:', sessionError?.message);
      }
      return;
    }

    // Determine network type if available
    let networkType: 'wifi' | 'cellular' | 'none' | undefined;
    // Note: Network type detection may require additional permissions/APIs
    // For now, we'll leave it undefined and let the server infer it

    // Write both:
    // 1) historical tracking_locations
    // 2) mobile_user_live_locations (dashboard live map source)
    const [trackingInsert, liveUpsert] = await Promise.all([
      supabase
        .from('tracking_locations')
        .insert({
          tracking_session_id: activeSession.id,
          latitude,
          longitude,
          accuracy: accuracy || null,
          altitude: altitude || null,
          heading: heading || null,
          speed: speed || null,
          network_type: networkType || null,
          timestamp,
          recorded_during: 'tracking',
        }),
      supabase
        .from('mobile_user_live_locations')
        .upsert(
          {
            mobile_user_id: user.id,
            source: 'tracking_session',
            source_entity_id: activeSession.id,
            latitude,
            longitude,
            accuracy_meters: accuracy || null,
            altitude: altitude || null,
            heading: heading || null,
            speed: speed || null,
            is_mocked: (location as any)?.mocked ?? null,
            location: {
              latitude,
              longitude,
              accuracy: accuracy || null,
              altitude: altitude || null,
              heading: heading || null,
              speed: speed || null,
              captured_at: timestamp,
            },
          },
          { onConflict: 'mobile_user_id,source,source_entity_id' }
        ),
    ]);

    if (trackingInsert.error) {
      console.error('[Location Task] Failed to insert tracking_locations:', trackingInsert.error);
    }
    if (liveUpsert.error) {
      console.error('[Location Task] Failed to upsert mobile_user_live_locations:', liveUpsert.error);
    }

    if (!trackingInsert.error || !liveUpsert.error) {
      console.log('[Location Task] Location update sent:', {
        latitude,
        longitude,
        accuracy,
        sessionId: activeSession.id,
      });
    }
  } catch (error) {
    // Catch all errors to prevent task failure
    // iOS will kill tasks that throw unhandled errors
    console.error('[Location Task] Unexpected error:', error);
  }
});
