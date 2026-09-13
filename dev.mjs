import { spawn } from "node:child_process";

/**
 * Starts the API server and the Vite dev server together, and — unlike
 * `a & b` in a shell script — takes both down when either one exits or when
 * you hit Ctrl-C, so a stale server never holds port 3001.
 */
/**
 * Windows の npx は `npx.cmd` で、`.cmd` は実行ファイルではなくシェルが解釈する。
 * `spawn("npx")` のままだと ENOENT で即座に落ちるため、拡張子を明示する。
 */
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const processes = [
  // API only: Vite owns the single URL you open, so a stale web/dist cannot
  // become a second playable copy of the app on :3001.
  spawn(npx, ["tsx", "src/server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, SHORT_STUDY_API_ONLY: "1" },
  }),
  spawn(npx, ["vite", "--config", "web/vite.config.ts"], { stdio: "inherit" }),
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
