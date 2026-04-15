import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLatestAppVersion, AppVersionInfo, DeviceType } from '@/api/appVersion';
import { isVersionGreater } from '@/utils/semver';

const THROTTLE_MS = 5 * 60 * 1000;
const SNOOZE_STORAGE_KEY = '@app_update_snooze';
const DEFAULT_SNOOZE_MS = 24 * 60 * 60 * 1000;

const SNOOZE_MS = (() => {
  const raw = process.env.EXPO_PUBLIC_APP_UPDATE_SNOOZE_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNOOZE_MS;
})();

interface SnoozeRecord {
  version: string;
  until: number;
}

export interface AppUpdateState {
  visible: boolean;
  remoteVersion: string;
  isEssential: boolean;
}

const initialState: AppUpdateState = {
  visible: false,
  remoteVersion: '',
  isEssential: false,
};

const readSnooze = async (): Promise<SnoozeRecord | null> => {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnoozeRecord;
    if (typeof parsed?.version !== 'string' || typeof parsed?.until !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeSnooze = async (record: SnoozeRecord) => {
  try {
    await AsyncStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore — snooze is best-effort.
  }
};

export function useAppVersionCheck() {
  const [state, setState] = useState<AppUpdateState>(initialState);
  const lastCheckRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const check = useCallback(async () => {
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastCheckRef.current < THROTTLE_MS) return;

    inFlightRef.current = true;
    lastCheckRef.current = now;

    try {
      const deviceType: DeviceType = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
      const remote: AppVersionInfo | null = await getLatestAppVersion(deviceType);
      if (!remote) return;

      const local = Application.nativeApplicationVersion ?? '0.0.0';
      if (!isVersionGreater(remote.currentVersion, local)) return;

      if (!remote.isEssential) {
        const snooze = await readSnooze();
        if (
          snooze &&
          snooze.version === remote.currentVersion &&
          snooze.until > Date.now()
        ) {
          return;
        }
      }

      setState({
        visible: true,
        remoteVersion: remote.currentVersion,
        isEssential: remote.isEssential,
      });
    } catch {
      // Silent fail — update check is best-effort UX.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setState((s) => {
      if (s.isEssential) return s;
      if (s.remoteVersion) {
        void writeSnooze({
          version: s.remoteVersion,
          until: Date.now() + SNOOZE_MS,
        });
      }
      return { ...s, visible: false };
    });
  }, []);

  useEffect(() => {
    check();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') check();
    });

    return () => sub.remove();
  }, [check]);

  return { ...state, dismiss };
}
