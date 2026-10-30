// Copies DATABASE_URL and QR_ENCRYPTION_KEY from .env to the linked Vercel project
// (Production and Preview) as secrets, replacing any value already there.
// Values are piped in, so they never show on screen. Run: node scripts/vercel-env.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "dotenv";

const env = parse(readFileSync(new URL("../.env", import.meta.url)));
// npx next to this node, so it works even when Node isn't on PATH (portable installs).
const npx = join(dirname(process.execPath), process.platform === "win32" ? "npx.cmd" : "npx");

for (const name of ["DATABASE_URL", "QR_ENCRYPTION_KEY"]) {
  const value = env[name];
  if (!value) {
    console.error(`✗ ${name} is empty in .env`);
    process.exit(1);
  }
  const r = spawnSync(
    npx,
    ["--yes", "vercel@latest", "env", "add", name, "--environment", "production,preview", "--sensitive", "--force", "--yes"],
    { input: value, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32", env: { ...process.env, PATH: `${dirname(process.execPath)};${process.env.PATH}` } },
  );
  if (r.status !== 0) {
    console.error(`✗ ${name} failed`);
    process.exit(1);
  }
  console.log(`✓ ${name} set on Vercel (Production + Preview)`);
}
