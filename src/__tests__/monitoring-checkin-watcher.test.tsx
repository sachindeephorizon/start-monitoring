import React from 'react';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: {
    OS: 'android',
  },
}));

jest.mock('@/features/monitoring/MonitoringSession', () => ({
  useMonitoringSession: jest.fn(),
}));

jest.mock('@/navigation/navigationRef', () => ({
  navigationRef: {
    isReady: jest.fn(),
    navigate: jest.fn(),
    getCurrentRoute: jest.fn(),
  },
}));

import { CheckInWatcher } from '@/features/monitoring/CheckInWatcher';
import { useMonitoringSession } from '@/features/monitoring/MonitoringSession';
import { navigationRef } from '@/navigation/navigationRef';

const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockedUseMonitoringSession = useMonitoringSession as jest.MockedFunction<typeof useMonitoringSession>;
const mockedNavigationRef = navigationRef as unknown as {
  isReady: jest.Mock;
  navigate: jest.Mock;
  getCurrentRoute: jest.Mock;
};

function buildMonitoringState(overrides: Partial<ReturnType<typeof useMonitoringSession>> = {}) {
  return {
    isActive: true,
    nextCheckinAt: new Date(Date.now() - 1_000).toISOString(),
    intervalMinutes: 3,
    startedAt: Date.now() - 60_000,
    pushTierSignal: jest.fn(),
    getEngineDebug: jest.fn(() => ({
      samples: 0,
      spanMs: 0,
      stationaryMs: 0,
      distFromAnchorM: 0,
      activeSignals: [],
      tier: 1,
      reason: 'default',
    })),
    ...overrides,
  } as ReturnType<typeof useMonitoringSession>;
}

describe('CheckInWatcher foreground flow', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-22T12:00:00.000Z'));
    mockedNavigationRef.isReady.mockReturnValue(true);
    mockedNavigationRef.getCurrentRoute.mockReturnValue({ name: 'Home' });
    mockedNavigationRef.navigate.mockReset();
    mockedUseMonitoringSession.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (first.includes('react-test-renderer is deprecated')) return;
      console.warn(...args);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('opens the foreground check-in prompt through MainNavigator when due', async () => {
    const dueAt = new Date(Date.now() - 1_000).toISOString();
    mockedUseMonitoringSession.mockReturnValue(
      buildMonitoringState({ nextCheckinAt: dueAt }),
    );

    let tree: any;
    await act(async () => {
      tree = TestRenderer.create(<CheckInWatcher />);
    });

    expect(mockedNavigationRef.navigate).toHaveBeenCalledWith('Main', {
      screen: 'CheckInPrompt',
      params: {
        dueAt,
        intervalMinutes: 3,
        startedAt: expect.any(Number),
      },
    });

    await act(async () => {
      tree.unmount();
    });
  });

  it('escalates immediately in foreground when the missed window already expired', async () => {
    const pushTierSignal = jest.fn();
    const dueAt = new Date(Date.now() - 31_000).toISOString();
    mockedUseMonitoringSession.mockReturnValue(
      buildMonitoringState({
        nextCheckinAt: dueAt,
        pushTierSignal,
      }),
    );

    let tree: any;
    await act(async () => {
      tree = TestRenderer.create(<CheckInWatcher />);
    });

    expect(pushTierSignal).toHaveBeenCalledWith('missed_checkin');
    expect(mockedNavigationRef.navigate).toHaveBeenCalled();
    const calls = mockedNavigationRef.navigate.mock.calls;
    const usedDirect = calls.some((c) => c[0] === 'Escalation');
    const usedNested = calls.some(
      (c) => c[0] === 'Main' && c[1]?.screen === 'Escalation',
    );
    expect(usedDirect || usedNested).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });
});
