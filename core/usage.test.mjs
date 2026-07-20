// core/usage.test.mjs
// Run: node --test core/
// All deps are mocked. No real network, keychain, or filesystem is touched.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toPct,
  bar,
  resetRelative,
  resetLocal,
  summaryLine,
  readToken,
  fetchRaw,
  getUsage,
  parseUsage,
  NoTokenError,
  UnauthorizedError,
  RateLimitedError,
} from "./usage.mjs";

// -- toPct -------------------------------------------------------------------

test("toPct: 0..1 fraction becomes integer percent", () => {
  assert.equal(toPct(0.18), 18);
});

test("toPct: 0..100 value passes through (defensive)", () => {
  assert.equal(toPct(18), 18);
});

test("toPct: zero is zero", () => {
  assert.equal(toPct(0), 0);
});

test("toPct: negatives and junk clamp to zero", () => {
  assert.equal(toPct(-1), 0);
  assert.equal(toPct(NaN), 0);
});

// -- bar ---------------------------------------------------------------------

test("bar: half fill at width 10", () => {
  const b = bar(50, 10);
  assert.equal(b.length, 10);
  assert.equal(b, "█████░░░░░");
});

test("bar: empty and full", () => {
  assert.equal(bar(0, 14), "░".repeat(14));
  assert.equal(bar(100, 14), "█".repeat(14));
});

// -- reset formatting with a fixed injected clock ---------------------------

test("resetRelative: hours and minutes from a fixed clock", () => {
  const now = new Date("2026-07-20T04:30:00Z");
  const iso = "2026-07-20T07:19:00Z"; // 2h 49m ahead
  assert.equal(resetRelative(iso, now), "resets in 2h 49m");
});

test("resetRelative: minutes only", () => {
  const now = new Date("2026-07-20T04:30:00Z");
  const iso = "2026-07-20T04:45:00Z"; // 15m ahead
  assert.equal(resetRelative(iso, now), "resets in 15m");
});

test("resetRelative: past time reads 'resets soon'", () => {
  const now = new Date("2026-07-20T10:00:00Z");
  const iso = "2026-07-20T09:00:00Z";
  assert.equal(resetRelative(iso, now), "resets soon");
});

test("resetLocal: renders a weekday and time", () => {
  // Assert on shape not exact tz-dependent value.
  const out = resetLocal("2026-07-22T22:29:00Z");
  assert.match(out, /^resets [A-Z][a-z]{2} \d{1,2}:\d{2} (AM|PM)$/);
});

// -- summaryLine -------------------------------------------------------------

test("summaryLine: one-line copy string", () => {
  const r = { fiveHour: { pct: 18 }, sevenDay: { pct: 35 } };
  assert.equal(summaryLine(r), "Claude Code usage: session 18%, weekly 35%");
});

// -- parseUsage --------------------------------------------------------------

test("parseUsage: maps endpoint shape to windows", () => {
  const raw = {
    five_hour: { utilization: 0.18, resets_at: "2026-07-20T07:19:00Z" },
    seven_day: { utilization: 0.35, resets_at: "2026-07-22T22:29:00Z" },
    seven_day_sonnet: { utilization: 0.0, resets_at: "2026-07-22T22:29:00Z" },
  };
  const p = parseUsage(raw);
  assert.equal(p.fiveHour.pct, 18);
  assert.equal(p.sevenDay.pct, 35);
  assert.equal(p.sevenDaySonnet.pct, 0);
  assert.equal(p.fiveHour.resetsAt, "2026-07-20T07:19:00Z");
});

// -- readToken with mocked deps ---------------------------------------------

const TOKEN_BLOB = JSON.stringify({
  claudeAiOauth: { accessToken: "tok-abc-123" },
});

test("readToken: reads from keychain first", async () => {
  const deps = {
    execFileSync: () => TOKEN_BLOB,
    readFileSync: () => {
      throw new Error("file should not be read when keychain works");
    },
    homedir: () => "/home/test",
  };
  const token = await readToken(deps);
  assert.equal(token, "tok-abc-123");
});

test("readToken: falls back to credentials file", async () => {
  const deps = {
    execFileSync: () => {
      throw new Error("no keychain");
    },
    readFileSync: (path) => {
      assert.match(path, /\.claude\/\.credentials\.json$/);
      return TOKEN_BLOB;
    },
    homedir: () => "/home/test",
  };
  const token = await readToken(deps);
  assert.equal(token, "tok-abc-123");
});

test("readToken: throws NoTokenError when both fail", async () => {
  const deps = {
    execFileSync: () => {
      throw new Error("no keychain");
    },
    readFileSync: () => {
      throw new Error("no file");
    },
    homedir: () => "/home/test",
  };
  await assert.rejects(() => readToken(deps), NoTokenError);
});

// -- fetchRaw with mocked fetch ---------------------------------------------

function fakeResponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

test("fetchRaw: 200 returns parsed body and sends required headers", async () => {
  let seenUrl;
  let seenHeaders;
  const deps = {
    fetch: async (url, init) => {
      seenUrl = url;
      seenHeaders = init.headers;
      return fakeResponse(200, { five_hour: { utilization: 0.5 } });
    },
  };
  const body = await fetchRaw("tok-xyz", "claude-code/1.2.3", deps);
  assert.equal(body.five_hour.utilization, 0.5);
  assert.match(seenUrl, /\/api\/oauth\/usage$/);
  assert.equal(seenHeaders.Authorization, "Bearer tok-xyz");
  assert.equal(seenHeaders["anthropic-beta"], "oauth-2025-04-20");
  assert.equal(seenHeaders["User-Agent"], "claude-code/1.2.3");
});

test("fetchRaw: 401 throws UnauthorizedError", async () => {
  const deps = { fetch: async () => fakeResponse(401, {}) };
  await assert.rejects(() => fetchRaw("t", "ua", deps), UnauthorizedError);
});

test("fetchRaw: 429 throws RateLimitedError", async () => {
  const deps = { fetch: async () => fakeResponse(429, {}) };
  await assert.rejects(() => fetchRaw("t", "ua", deps), RateLimitedError);
});

// -- getUsage flow with mocked deps -----------------------------------------

const RAW = {
  five_hour: { utilization: 0.18, resets_at: "2026-07-20T07:19:00Z" },
  seven_day: { utilization: 0.35, resets_at: "2026-07-22T22:29:00Z" },
  seven_day_sonnet: { utilization: 0.0, resets_at: "2026-07-22T22:29:00Z" },
};

test("getUsage: fresh cache returns cached:true, never fetches", async () => {
  let fetched = false;
  const deps = {
    statSync: () => ({ mtimeMs: Date.now() }), // fresh
    readFileSync: () => JSON.stringify(RAW),
    writeFileSync: () => {},
    fetch: async () => {
      fetched = true;
      return fakeResponse(200, RAW);
    },
    execFileSync: () => TOKEN_BLOB,
    homedir: () => "/home/test",
  };
  const r = await getUsage({ deps, env: {}, cacheFile: "/x/ccu-usage.json" });
  assert.equal(r.cached, true);
  assert.equal(r.fiveHour.pct, 18);
  assert.equal(fetched, false);
});

test("getUsage: stale cache triggers fetch, returns cached:false and writes", async () => {
  let wrote = false;
  const deps = {
    statSync: () => ({ mtimeMs: Date.now() - 999 * 1000 }), // stale
    readFileSync: () => JSON.stringify(RAW),
    writeFileSync: () => {
      wrote = true;
    },
    fetch: async () => fakeResponse(200, RAW),
    execFileSync: () => TOKEN_BLOB,
    homedir: () => "/home/test",
  };
  const r = await getUsage({ deps, env: {}, cacheFile: "/x/ccu-usage.json" });
  assert.equal(r.cached, false);
  assert.equal(r.sevenDay.pct, 35);
  assert.equal(wrote, true);
});

test("getUsage: 429 serves stale cache when present", async () => {
  let firstStat = true;
  const deps = {
    // First call (freshness check) reports stale so we proceed to fetch.
    statSync: () => {
      if (firstStat) {
        firstStat = false;
        return { mtimeMs: Date.now() - 999 * 1000 };
      }
      return { mtimeMs: Date.now() - 999 * 1000 };
    },
    readFileSync: () => JSON.stringify(RAW),
    writeFileSync: () => {},
    fetch: async () => fakeResponse(429, {}),
    execFileSync: () => TOKEN_BLOB,
    homedir: () => "/home/test",
  };
  const r = await getUsage({ deps, env: {}, cacheFile: "/x/ccu-usage.json" });
  assert.equal(r.cached, true);
  assert.equal(r.fiveHour.pct, 18);
});

test("getUsage: 429 with no cache rethrows RateLimitedError", async () => {
  const deps = {
    statSync: () => {
      throw new Error("no cache file");
    },
    readFileSync: () => {
      throw new Error("no cache file");
    },
    writeFileSync: () => {},
    fetch: async () => fakeResponse(429, {}),
    execFileSync: () => TOKEN_BLOB,
    homedir: () => "/home/test",
  };
  await assert.rejects(
    () => getUsage({ deps, env: {}, cacheFile: "/x/ccu-usage.json" }),
    RateLimitedError
  );
});
