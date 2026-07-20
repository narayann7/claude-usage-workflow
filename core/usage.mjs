// core/usage.mjs
//
// One dependency-free ES module that owns the Claude Code usage endpoint
// contract: token read, fetch, parse, cache. Node 18+, ESM, zero runtime deps
// (built-in fetch only). Alfred and Raycast import this; Swift mirrors it.
//
// Endpoint contract:
//   GET https://api.anthropic.com/api/oauth/usage
//   Authorization: Bearer <oauth_access_token>
//   anthropic-beta: oauth-2025-04-20
//   User-Agent: claude-code/<version>

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// -- constants ---------------------------------------------------------------

export const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
export const BETA_HEADER = "oauth-2025-04-20";
export const KEYCHAIN_SERVICE = "Claude Code-credentials";

// Pinned fallback version used when no override is supplied. Kept as a plain
// constant so a single bump covers every surface.
const PINNED_VERSION = "1.0.0";
const DEFAULT_CACHE_SECONDS = 180;

// -- typed errors ------------------------------------------------------------

export class NoTokenError extends Error {
  constructor(message = "No Claude Code login found") {
    super(message);
    this.name = "NoTokenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized (401): token expired or beta header changed") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class RateLimitedError extends Error {
  constructor(message = "Rate limited (429) and no cache available") {
    super(message);
    this.name = "RateLimitedError";
  }
}

// -- token resolution --------------------------------------------------------

// Default dependency bundle for readToken. Tests inject a fake set so no real
// keychain or filesystem is touched.
const defaultTokenDeps = {
  execFileSync,
  readFileSync,
  homedir,
};

function extractToken(jsonBlob) {
  const parsed = JSON.parse(jsonBlob);
  const token = parsed?.claudeAiOauth?.accessToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("token path .claudeAiOauth.accessToken missing");
  }
  return token;
}

/**
 * Resolve the OAuth access token.
 * Order: macOS Keychain, then ~/.claude/.credentials.json. Throws NoTokenError
 * if both fail.
 * @param {{ execFileSync?:Function, readFileSync?:Function, homedir?:Function }} [deps]
 * @returns {Promise<string>}
 */
export async function readToken(deps = {}) {
  const d = { ...defaultTokenDeps, ...deps };

  // 1. Keychain
  try {
    const blob = d.execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8" }
    );
    return extractToken(blob);
  } catch {
    // fall through to file
  }

  // 2. Credentials file
  try {
    const path = join(d.homedir(), ".claude", ".credentials.json");
    const blob = d.readFileSync(path, "utf8");
    return extractToken(blob);
  } catch {
    // fall through to throw
  }

  throw new NoTokenError();
}

// -- user agent --------------------------------------------------------------

/**
 * Resolve the User-Agent string. Honors an explicit override, then CC_UA env,
 * then falls back to claude-code/<pinned version>.
 * @param {string} [override]
 * @param {Record<string,string|undefined>} [env]
 * @returns {string}
 */
export function resolveUserAgent(override, env = process.env) {
  if (override) return override;
  if (env.CC_UA) return env.CC_UA;
  return `claude-code/${PINNED_VERSION}`;
}

// -- raw fetch ---------------------------------------------------------------

// Default dependency bundle for fetchRaw. Tests inject a fake fetch.
const defaultFetchDeps = {
  fetch: (...args) => fetch(...args),
};

/**
 * Raw endpoint call, no cache. Returns the parsed JSON body on 200.
 * Throws UnauthorizedError on 401, RateLimitedError on 429, generic Error
 * otherwise.
 * @param {string} token
 * @param {string} userAgent
 * @param {{ fetch?:Function }} [deps]
 * @returns {Promise<object>}
 */
export async function fetchRaw(token, userAgent, deps = {}) {
  const d = { ...defaultFetchDeps, ...deps };
  const res = await d.fetch(ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": BETA_HEADER,
      "User-Agent": userAgent,
    },
  });

  if (res.status === 200) {
    return await res.json();
  }
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (res.status === 429) {
    throw new RateLimitedError();
  }
  throw new Error(`usage endpoint returned HTTP ${res.status}`);
}

// -- formatting helpers ------------------------------------------------------

/**
 * Normalize a utilization value to an integer percent. Accepts a 0..1 fraction
 * (the endpoint shape) or a 0..100 value (defensive), returns 0..100 integer.
 * @param {number} u
 * @returns {number}
 */
export function toPct(u) {
  const n = Number(u);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const pct = n <= 1 ? n * 100 : n;
  return Math.round(pct);
}

/**
 * Render a unicode progress bar of the given width for a 0..100 percent.
 * @param {number} pct
 * @param {number} [width]
 * @returns {string}
 */
export function bar(pct, width = 14) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Render an ISO reset timestamp as a relative countdown, e.g. "resets in 2h 49m".
 * @param {string} iso
 * @param {Date} [now]
 * @returns {string}
 */
export function resetRelative(iso, now = new Date()) {
  const target = new Date(iso).getTime();
  let diffMs = target - now.getTime();
  if (!Number.isFinite(target) || diffMs <= 0) return "resets soon";
  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `resets in ${hours}h ${mins}m`;
  return `resets in ${mins}m`;
}

/**
 * Render an ISO reset timestamp as a local day and time, e.g. "resets Wed 10:29 PM".
 * @param {string} iso
 * @param {Date} [now] unused, kept for a symmetric signature
 * @returns {string}
 */
export function resetLocal(iso) {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "resets soon";
  const day = target.toLocaleDateString("en-US", { weekday: "short" });
  const time = target.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `resets ${day} ${time}`;
}

// -- parse -------------------------------------------------------------------

function windowFrom(raw) {
  const w = raw || {};
  return {
    pct: toPct(w.utilization),
    resetsAt: typeof w.resets_at === "string" ? w.resets_at : "",
  };
}

/**
 * Shape a raw endpoint JSON body into a UsageResult (without the cached flag).
 * @param {object} raw
 * @returns {{ fiveHour:object, sevenDay:object, sevenDaySonnet:object }}
 */
export function parseUsage(raw) {
  return {
    fiveHour: windowFrom(raw.five_hour),
    sevenDay: windowFrom(raw.seven_day),
    sevenDaySonnet: windowFrom(raw.seven_day_sonnet),
  };
}

/**
 * One-line copy string shared by Alfred and Raycast.
 * @param {{ fiveHour:{pct:number}, sevenDay:{pct:number} }} result
 * @returns {string}
 */
export function summaryLine(result) {
  const c = result?.fiveHour?.pct ?? 0;
  const w = result?.sevenDay?.pct ?? 0;
  return `Claude Code usage: session ${c}%, weekly ${w}%`;
}

// -- cache -------------------------------------------------------------------

function cachePath(opts) {
  return opts.cacheFile || join(tmpdir(), "ccu-usage.json");
}

function readFreshCache(path, cacheSeconds, deps) {
  try {
    const info = deps.statSync(path);
    const ageSeconds = (Date.now() - info.mtimeMs) / 1000;
    if (ageSeconds < cacheSeconds) {
      const raw = JSON.parse(deps.readFileSync(path, "utf8"));
      return raw;
    }
  } catch {
    // no cache or unreadable
  }
  return null;
}

// -- getUsage ----------------------------------------------------------------

const defaultUsageDeps = {
  readFileSync,
  writeFileSync,
  statSync,
  fetch: (...args) => fetch(...args),
  execFileSync,
  homedir,
};

/**
 * Full flow: cache, then token, fetch, parse, cache.
 * @param {{ userAgent?:string, cacheSeconds?:number, cacheFile?:string, env?:object, deps?:object }} [opts]
 * @returns {Promise<{fiveHour:object, sevenDay:object, sevenDaySonnet:object, cached:boolean}>}
 */
export async function getUsage(opts = {}) {
  const env = opts.env || process.env;
  const d = { ...defaultUsageDeps, ...(opts.deps || {}) };

  const cacheSeconds =
    opts.cacheSeconds ||
    Number(env.CC_CACHE_SECONDS) ||
    DEFAULT_CACHE_SECONDS;

  const path = cachePath(opts);
  const userAgent = resolveUserAgent(opts.userAgent, env);

  // 1. Fresh cache wins.
  const cached = readFreshCache(path, cacheSeconds, d);
  if (cached) {
    return { ...parseUsage(cached), cached: true };
  }

  // 2. Token, then fetch.
  const token = await readToken({
    execFileSync: d.execFileSync,
    readFileSync: d.readFileSync,
    homedir: d.homedir,
  });

  let raw;
  try {
    raw = await fetchRaw(token, userAgent, { fetch: d.fetch });
  } catch (err) {
    // On 429, serve any cache we can find regardless of freshness.
    if (err instanceof RateLimitedError) {
      try {
        const stale = JSON.parse(d.readFileSync(path, "utf8"));
        return { ...parseUsage(stale), cached: true };
      } catch {
        throw err;
      }
    }
    throw err;
  }

  // 3. Cache raw JSON, return fresh.
  try {
    d.writeFileSync(path, JSON.stringify(raw), "utf8");
  } catch {
    // caching is best-effort
  }
  return { ...parseUsage(raw), cached: false };
}
