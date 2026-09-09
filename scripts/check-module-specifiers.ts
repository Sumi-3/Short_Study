import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * サーバ側の相対 import は拡張子 `.js` を必ず書く。
 *
 * `tsx`（CLI・`npm run server`）と bundler（rspack・vite）は拡張子なしの `./mathText` を解決
 * できるが、デプロイ先の serverless function は各 `.ts` を個別に transpile して素の Node ESM で
 * 実行する。Node ESM は拡張子を補わないため、拡張子なしの import は読み込み時に
 * ERR_MODULE_NOT_FOUND となり、function は応答前に落ちて 500 になる。ローカルでは再現しない。
 *
 * `src/remotion/` は bundler しか読まないので対象外。この tsconfig は moduleResolution が
 * "Bundler" で、`tsc` はこの誤りを検出しない。
 */
const BUNDLER_ONLY = path.join("src", "remotion");

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full.startsWith(BUNDLER_ONLY) ? [] : sources(full);
    return entry.isFile() && full.endsWith(".ts") ? [full] : [];
  });

const offenders: string[] = [];
for (const file of [...sources("src"), ...sources("api")]) {
  const text = fs.readFileSync(file, "utf-8");
  for (const match of text.matchAll(/(?:from|import)\s*"(\.[^"]*)"/g)) {
    const specifier = match[1];
    if (specifier.endsWith(".js") || specifier.endsWith(".json")) continue;
    // CSS などの asset は bundler だけが読む。
    if (path.extname(specifier)) continue;
    const line = text.slice(0, match.index).split("\n").length;
    offenders.push(`${file}:${line} → "${specifier}" は "${specifier}.js" と書く`);
  }
}

assert.deepEqual(
  offenders,
  [],
  `serverless で ERR_MODULE_NOT_FOUND になる拡張子なし import:\n${offenders.join("\n")}`,
);

console.log(
  `PASS: server-side relative imports all carry .js (${sources("src").length + sources("api").length} files scanned)`,
);
