import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isRunnable, sceneRuns } from "../src/remotion/sceneRuns.js";

/**
 * run の切り方。まとめるのは formula の point が隣り合う場合だけで、hook・summary・図の併記・
 * 箇条書きは境界になる。from と durationInFrames は音声の尺の累積と一致しなければならない。
 * ここがずれると FormulaRun の舞台が音声とずれて、行が声より先か後に出る。
 */
const scene = (
  visual_type: "hook" | "point" | "summary",
  kind: string | null,
  durationInFrames: number,
) => ({
  visual_type,
  visual: kind ? ({ kind } as never) : undefined,
  durationInFrames,
});

const runs = sceneRuns([
  scene("hook", null, 100),
  scene("point", "formula", 200),
  scene("point", "formula", 210),
  scene("point", "formula", 220),
  scene("point", "plot", 50),
  scene("point", "formula", 60),
  scene("point", "formula", 70),
  scene("summary", "formula", 80),
]);
assert.deepEqual(runs, [
  { first: 0, count: 1, from: 0, durationInFrames: 100 },
  { first: 1, count: 3, from: 100, durationInFrames: 630 },
  { first: 4, count: 1, from: 730, durationInFrames: 50 },
  { first: 5, count: 2, from: 780, durationInFrames: 130 },
  { first: 7, count: 1, from: 910, durationInFrames: 80 },
]);
// run に入る・入らないの判定は visual_type と kind の両方で決まる。
assert.equal(isRunnable(scene("point", "formula", 1)), true);
assert.equal(isRunnable(scene("summary", "formula", 1)), false);
assert.equal(isRunnable(scene("point", "figure", 1)), false);
assert.equal(isRunnable(scene("point", null, 1)), false);
// 空の列と 1 シーンだけの列でも壊れない。
assert.deepEqual(sceneRuns([]), []);
assert.deepEqual(sceneRuns([scene("point", "formula", 5)]), [
  { first: 0, count: 1, from: 0, durationInFrames: 5 },
]);

// 既存の manifest では、run の合計が動画の長さと一致し、run に入ったシーンが 1 つも落ちない。
const root = path.join(process.cwd(), "public", "projects");
let merged = 0;
let manifests = 0;
if (fs.existsSync(root)) {
  for (const slug of fs.readdirSync(root)) {
    const file = path.join(root, slug, "manifest.json");
    if (!fs.existsSync(file)) continue;
    manifests += 1;
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const found = sceneRuns(manifest.scenes);
    assert.equal(found.reduce((sum, run) => sum + run.count, 0), manifest.scenes.length, slug);
    assert.equal(
      found.reduce((sum, run) => sum + run.durationInFrames, 0),
      manifest.scenes.reduce((sum: number, s: { durationInFrames: number }) => sum + s.durationInFrames, 0),
      slug,
    );
    merged += found.filter((run) => run.count > 1).length;
  }
}

console.log(`PASS: run boundaries, cumulative frames, ${manifests} existing manifests (${merged} multi-scene runs)`);
