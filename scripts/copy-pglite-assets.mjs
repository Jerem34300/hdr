#!/usr/bin/env node
/**
 * Copy PGLite's runtime assets (wasm + data bundle) next to the bundled server
 * function. PGLite loads them relative to its own module, and the Nitro
 * Netlify output does not copy them, so without this an app with no
 * DATABASE_URL crashes on its first query. No-op when the output is absent.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@electric-sql/pglite/dist");
const targets = [join(root, ".netlify/functions-internal/server/_libs")];
const files = ["pglite.wasm", "pglite.data", "initdb.wasm"];

for (const dir of targets) {
  if (!existsSync(dir)) continue;
  for (const file of files) copyFileSync(join(src, file), join(dir, file));
  console.log(`[pglite-assets] copied ${files.join(", ")} -> ${dir}`);
}
