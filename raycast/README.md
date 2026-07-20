# Claude Code Usage (Raycast)

A Raycast extension that shows live Claude Code usage limits: the 5-hour session
window (C) and the 7-day weekly window (W), plus the Sonnet-only weekly row.

Two commands:

- **Claude Usage** (`view`): a list with three rows (session, weekly, Sonnet),
  each with a severity dot, a unicode bar with percent, and a reset string.
  Enter copies a one-line summary that matches the Alfred workflow.
- **Claude Usage Menu Bar** (`menu-bar`): a compact title such as
  `W 35% · C 18%` in the Raycast menu bar, refreshing every 3 minutes. The
  dropdown lists full rows with reset times, plus Refresh and Open Preferences.

## How it reuses the shared core

The fetch, token resolution, parsing, and caching all live in one place:
`../core/usage.mjs`. This extension does not reimplement any of it.

Raycast bundles with esbuild and keeps the build inside the extension root, so
a small prebuild step vendors the core into the extension:

- `scripts/copy-core.mjs` copies `../core/usage.mjs` to `src/lib/usage.mjs`.
- It runs automatically via the `prebuild` and `predev` npm scripts.
- `src/lib/client.ts` is a thin wrapper: it reads Raycast preferences
  (userAgent, cacheSeconds) and passes them into the core `getUsage`, then
  re-exports the shaped `UsageResult` and the shared `summaryLine`.

`src/lib/usage.d.ts` provides ambient types for the vendored JS module so the
TypeScript build resolves its exports.

## Preferences

- **User-Agent Override**: optional User-Agent for the usage endpoint. Empty
  uses the pinned default.
- **Cache Seconds**: how long a successful response is cached (default 180).
- **Menu Bar Title Shows**: `W + C`, Weekly only, or Session only.

## Build and develop

```
cd raycast
npm install
npm run dev     # ray develop, live-loads into Raycast
```

To produce a distributable build:

```
npm run build   # runs copy-core, then ray build
npm run lint     # ray lint
```

`npm run dev` and `npm run build` both run the copy-core step first, so the
vendored `src/lib/usage.mjs` is always in sync with the source in `../core`.

## Install locally

In Raycast, run **Import Extension** and point it at this `raycast/` folder,
or use `npm run dev` to live-load it during development.

## Error handling

- No token found: shows "No Claude Code login".
- 401: shows "Token expired, open Claude Code".
- 429: serves cache when available, otherwise "Rate limited, retry soon".

The menu bar title never blanks: on error it shows a marker and the reason in
the dropdown.
