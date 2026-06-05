/**
 * src/lib/telemetry.ts
 *
 * Lightweight, dependency-free telemetry seam for crash/error reporting.
 *
 * The app ships with NO crash reporter wired by default (so there's no hard
 * dependency and nothing phones home unless you opt in). This module provides:
 *
 *   - A small `TelemetryClient` interface (a subset of the Sentry API surface).
 *   - `setTelemetryClient()` to plug a real reporter in production — e.g. wrap
 *     `@sentry/react-native` in one adapter object and call it once at startup.
 *   - `initTelemetry()` which installs a global JS error handler (via RN's
 *     `ErrorUtils`) and a best-effort unhandled-promise-rejection tracker, so
 *     uncaught errors are captured even before a real client is attached.
 *   - `captureException` / `captureMessage` / `addBreadcrumb` used throughout
 *     the app.
 *
 * To enable Sentry later (no app code changes beyond this one call):
 *   import * as Sentry from '@sentry/react-native';
 *   Sentry.init({ dsn: '…' });
 *   setTelemetryClient({
 *     captureException: (e, ctx) => Sentry.captureException(e, { extra: ctx }),
 *     captureMessage:   (m, lvl) => Sentry.captureMessage(m, lvl),
 *     addBreadcrumb:    (b) => Sentry.addBreadcrumb(b),
 *   });
 */

export type TelemetrySeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export type Breadcrumb = {
  category?: string;
  message: string;
  level?: TelemetrySeverity;
  data?: Record<string, unknown>;
};

export interface TelemetryClient {
  captureException(error: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, level?: TelemetrySeverity): void;
  addBreadcrumb?(crumb: Breadcrumb): void;
}

// ---------------------------------------------------------------------------
// Default client — console only (dev) + a small in-memory breadcrumb ring so a
// real client attached later can be primed, and so support can ask for logs.
// ---------------------------------------------------------------------------

const BREADCRUMB_LIMIT = 30;
const breadcrumbs: Breadcrumb[] = [];

const consoleClient: TelemetryClient = {
  captureException(error, context) {
    console.error('[telemetry] exception', error, context ?? '');
  },
  captureMessage(message, level = 'info') {
    console.log(`[telemetry:${level}] ${message}`);
  },
  addBreadcrumb(crumb) {
    if (__DEV__) {
      console.log(`[telemetry:breadcrumb] ${crumb.category ?? '-'}: ${crumb.message}`);
    }
  },
};

let client: TelemetryClient = consoleClient;
let initialized = false;

/** Attach a real telemetry client (e.g. a Sentry adapter). Replays breadcrumbs. */
export function setTelemetryClient(next: TelemetryClient): void {
  client = next;
  if (next.addBreadcrumb) {
    for (const crumb of breadcrumbs) next.addBreadcrumb(crumb);
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  client.captureException(error, context);
}

export function captureMessage(message: string, level: TelemetrySeverity = 'info'): void {
  client.captureMessage(message, level);
}

export function addBreadcrumb(crumb: Breadcrumb): void {
  breadcrumbs.push(crumb);
  if (breadcrumbs.length > BREADCRUMB_LIMIT) breadcrumbs.shift();
  client.addBreadcrumb?.(crumb);
}

// ---------------------------------------------------------------------------
// Global handlers
// ---------------------------------------------------------------------------

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

/**
 * Install global error capture. Safe to call once at startup. Wraps (not
 * replaces) RN's existing global handler so the red-box/dev overlay still works.
 */
export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  // 1. Uncaught JS errors via RN ErrorUtils.
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      captureException(error, { isFatal: Boolean(isFatal), source: 'globalHandler' });
      previous?.(error, isFatal);
    });
  }

  // 2. Best-effort unhandled promise rejection tracking. RN bundles the
  //    `promise` polyfill; enabling its tracker is version-dependent, so we
  //    guard it and never throw if it's unavailable.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: number, error: unknown) => {
        captureException(error, { source: 'unhandledRejection', id });
      },
      onHandled: () => {},
    });
  } catch {
    // Rejection tracker unavailable on this RN/Hermes build — non-fatal.
  }

  addBreadcrumb({ category: 'app', message: 'telemetry initialised', level: 'info' });
}
