/**
 * Emits each source file with its comments removed, so a comment-only change
 * can be proved to be comment-only: the digest below must not move.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";

const roots = ["src", "web/src", "scripts"];
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !e.name.startsWith("_snap") && !e.name.startsWith("_strip")) files.push(p);
  }
};
for (const r of roots) if (fs.existsSync(r)) walk(r);
files.sort();

const out: string[] = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve },
    fileName: f,
  }).outputText;
  out.push(f + "\t" + crypto.createHash("sha256").update(js).digest("hex"));
}
fs.writeFileSync(process.argv[2], out.join("\n") + "\n");
console.log(`${files.length} files`);
console.log("digest:", crypto.createHash("sha256").update(out.join("\n")).digest("hex"));
