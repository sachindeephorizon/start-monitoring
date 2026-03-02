/**
 * Simple logger utility
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const logLevel: LogLevel = (() => {
  if (__DEV__) return 'debug';
  const raw = String(process.env.EXPO_PUBLIC_LOG_LEVEL || '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'error';
})();

export const logger = {
  log: (...args: any[]) => {
    if (logLevel === 'debug' || logLevel === 'info') {
      console.log(...args);
    }
  },
  debug: (...args: any[]) => {
    if (logLevel === 'debug') {
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (logLevel === 'debug' || logLevel === 'info') {
      console.info(...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
};

