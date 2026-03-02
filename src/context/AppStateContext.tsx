/**
 * App State Context
 * 
 * Manages application state including:
 * - Foreground/background state
 * - Network connectivity
 * - App initialization status
 * 
 * iOS SAFETY: This context monitors app state changes but does NOT
 * perform any background operations. It only tracks state changes
 * and notifies other parts of the app.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

interface AppStateContextType {
  // State
  appState: AppStateStatus;
  isForeground: boolean;
  isBackground: boolean;
  isConnected: boolean;
  isInitialized: boolean;

  // Methods
  setInitialized: (value: boolean) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isConnected, setIsConnected] = useState(true);
  const [isInitialized, setInitialized] = useState(false);

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppState(nextAppState);
      
      /**
       * iOS SAFETY: When app goes to background, we should:
       * - Close real-time subscriptions (handled by Supabase)
       * - Stop any foreground-only operations
       * - Rely on push notifications for updates
       * 
       * We do NOT try to keep connections alive or run timers.
       */
      if (nextAppState === 'background') {
        console.log('App moved to background - connections will close automatically');
      } else if (nextAppState === 'active') {
        console.log('App moved to foreground - reconnecting...');
        // Reconnections happen automatically when components remount
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      /**
       * IMPORTANT:
       * NetInfo can report `isConnected: null` during early app boot on iOS.
       * Treat "unknown" as connected to avoid false-offline boot failures.
       * We only consider the device offline when NetInfo explicitly says `false`.
       */
      setIsConnected(state.isConnected !== false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const stableSetInitialized = useCallback((value: boolean) => setInitialized(value), []);

  const value = useMemo<AppStateContextType>(() => ({
    appState,
    isForeground: appState === 'active',
    isBackground: appState !== 'active',
    isConnected,
    isInitialized,
    setInitialized: stableSetInitialized,
  }), [appState, isConnected, isInitialized, stableSetInitialized]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/**
 * Hook to use app state context
 */
export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

