import { writeFileSync } from "node:fs";
const v = process.env.COMMIT_REF || process.env.GITHUB_SHA || String(Date.now());
writeFileSync("public/version.json", JSON.stringify({ v, at: new Date().toISOString() }));
