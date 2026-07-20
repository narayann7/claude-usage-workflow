// Copies the shared core module into src/lib so the Raycast esbuild bundle is
// self-contained and does not reach outside the extension root. Runs on
// prebuild and predev via npm scripts.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "core", "usage.mjs");
const destDir = join(here, "..", "src", "lib");
const dest = join(destDir, "usage.mjs");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

console.log(`copied core: ${src} -> ${dest}`);
