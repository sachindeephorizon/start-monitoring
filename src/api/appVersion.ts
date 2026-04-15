import { get } from './config';

export type DeviceType = 'IOS' | 'ANDROID';

export interface AppVersionInfo {
  id: string;
  currentVersion: string;
  deviceType: DeviceType;
  isEssential: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getLatestAppVersion = async (
  deviceType: DeviceType,
): Promise<AppVersionInfo | null> => {
  const res = await get('/app-version/latest', { params: { deviceType } });
  return (res ?? null) as AppVersionInfo | null;
};
