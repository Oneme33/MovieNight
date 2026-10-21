import type React from 'react';
import * as Sentry from '@sentry/react-native';
import * as config from './config';
import { APP_VERSION, VERSION_CODE } from './version';

// Crash reporting: JS errors and native crashes arrive in Sentry with a stack trace.
// Only active when SENTRY_DSN is set in src/config.ts (and never in development).
const DSN: string = (config as any).SENTRY_DSN || '';
export const sentryEnabled = !!DSN && !__DEV__;

if (sentryEnabled) {
  Sentry.init({
    dsn: DSN,
    release: `filmavond@${APP_VERSION}+${VERSION_CODE}`,
    dist: String(VERSION_CODE),
    sendDefaultPii: false,
    tracesSampleRate: 0, // crashes and errors only, no performance tracing
  });
}

// Which list member a crash came from (only the member id, no names).
export const setCrashUser = (memberId: string | undefined) => {
  if (sentryEnabled) Sentry.setUser(memberId ? { id: memberId } : null);
};

export const wrapApp = (App: React.ComponentType<Record<string, unknown>>): React.ComponentType<any> =>
  (sentryEnabled ? Sentry.wrap(App) : App);

// Hidden check (long-press the version in Settings): sends a test error. False when reporting is off.
export const sendTestError = (): boolean => {
  if (!sentryEnabled) return false;
  Sentry.captureException(new Error(`MovieNight test error (${APP_VERSION})`));
  return true;
};
