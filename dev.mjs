import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * Starts the API server and the Vite dev server together, and — unlike
 * `a & b` in a shell script — takes both down when either one exits or when
 * you hit Ctrl-C, so a stale server never holds port 3001.
 */
/**
 * npx を介さず、node に CLI の実体を渡して起動する。
 *
 * Windows の npx は `npx.cmd` で、Node は 18.20 以降これを `shell` なしで spawn すると
 * EINVAL で落ちる（`.cmd` をシェル経由で走らせる引数の扱いが安全でないため塞がれた）。
 * `shell: true` を足せば起動はするが、間に cmd.exe が挟まって kill が孫プロセスまで
 * 届かず、このファイルの目的である「どちらかが落ちたら両方止める」が成立しない。
 * node 自身なら拡張子もシェルも要らないので、package.json の bin から実体を引く。
 */
const require = createRequire(import.meta.url);
const cliOf = (name, binName = name) => {
  const manifest = require.resolve(`${name}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
  return resolve(dirname(manifest), typeof bin === "string" ? bin : bin[binName]);
};

const processes = [
  // API only: Vite owns the single URL you open, so a stale web/dist cannot
  // become a second playable copy of the app on :3001.
  spawn(process.execPath, [cliOf("tsx"), "src/server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, SHORT_STUDY_API_ONLY: "1" },
  }),
  spawn(process.execPath, [cliOf("vite"), "--config", "web/vite.config.ts"], {
    stdio: "inherit",
  }),
];

setTimeout(() => {
  console.log("\n  開く → http://localhost:5173/   (:3001 は API 専用)\n");
}, 1500);

let stopping = false;
const stopAll = (code = 0) => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of processes) {
    child.kill("SIGINT");
  }
  process.exit(code);
};

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
for (const child of processes) {
  child.on("exit", (code) => stopAll(code ?? 0));
}
