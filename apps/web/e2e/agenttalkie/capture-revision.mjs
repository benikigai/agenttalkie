import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const files = {};
async function capture(relative) {
  let info;
  try { info = await stat(path.join(root, relative)); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (info.isDirectory()) {
    for (const entry of (await readdir(path.join(root, relative))).sort()) {
      if (["node_modules", ".git", ".next"].includes(entry) || entry.startsWith(".env")) continue;
      await capture(path.join(relative, entry));
    }
  } else {
    files[relative] = createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
  }
}

for (const relative of [
  "apps/web/src", "apps/web/e2e/agenttalkie", "apps/web/public", "packages/agent-core/src",
  "package.json", "package-lock.json", "tsconfig.json", "packages/agent-core/package.json",
  "apps/web/package.json", "apps/web/tsconfig.json", "apps/web/next.config.ts",
]) await capture(relative);

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
console.log(JSON.stringify({
  capturedAt: new Date().toISOString(), productRoot: root,
  gitRoot: git("rev-parse", "--show-toplevel"), head: git("rev-parse", "HEAD"),
  gitStatus: git("status", "--short"),
  sourceDigest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
  files,
  limitation: "Source hashes identify this local checkout. They do not prove loaded runtime bytes, provider access, or deployment. Pair with Backend runtime ownership and observed responses; compare before/after files.",
}, null, 2));
