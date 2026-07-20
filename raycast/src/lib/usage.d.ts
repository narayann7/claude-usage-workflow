// Ambient types for the vendored core module (usage.mjs). The core is authored
// in plain JS with JSDoc; this declaration pins the exports the client uses so
// TypeScript resolves them without checkJs on the .mjs body.

export type CoreWindow = {
  pct: number;
  resetsAt: string;
};

export type CoreUsageResult = {
  fiveHour: CoreWindow;
  sevenDay: CoreWindow;
  sevenDaySonnet: CoreWindow;
  cached: boolean;
};

export type GetUsageOptions = {
  userAgent?: string;
  cacheSeconds?: number;
  cacheFile?: string;
  env?: Record<string, string | undefined>;
  deps?: Record<string, unknown>;
};

export function getUsage(opts?: GetUsageOptions): Promise<CoreUsageResult>;
export function summaryLine(result: {
  fiveHour: { pct: number };
  sevenDay: { pct: number };
}): string;

export class NoTokenError extends Error {}
export class UnauthorizedError extends Error {}
export class RateLimitedError extends Error {}
