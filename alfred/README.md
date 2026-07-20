# Alfred renderer

A thin Alfred Script Filter renderer that prints the Claude Code usage rows (session, weekly, Sonnet) as `{"items":[...]}` JSON.

It imports `../core/usage.mjs` for all endpoint, token, and cache logic, so that file must sit alongside `usage.js` at runtime.

The shipped `.alfredworkflow` bundle solves this by zipping both `usage.js` and `usage.mjs` together (plus `info.plist`), keeping the workflow self-contained.
