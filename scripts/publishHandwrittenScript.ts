/**
 * 手書きの台本を、API の `generateScript` だけ飛ばして本番と同じ経路で1本に仕上げる。
 *
 * 台本を Claude がチャットで書く場合に使う。音声・字幕・manifest・公開は
 * すべて `src/pipeline/` の既存関数をそのまま呼ぶので、出来上がる manifest は
 * `npm run generate` で作ったものと同じ形になる。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { scriptSchema } from "../src/types.js";
import { generateAudio } from "../src/pipeline/generateAudio.js";
import { generateCaptions } from "../src/pipeline/generateCaptions.js";
import { buildManifest } from "../src/pipeline/buildManifest.js";
import { publishProject } from "../src/storage.js";
import { paths } from "../src/config.js";

const scriptPath = process.argv[2];
if (!scriptPath) {
  throw new Error("使い方: tsx scripts/publishHandwrittenScript.ts <script.json> [slug] [voice]");
}

const script = scriptSchema.parse(JSON.parse(fs.readFileSync(scriptPath, "utf8")));
const slug = process.argv[3] ?? `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
const voice = process.argv[4];

const run = async () => {
  console.log(`slug: ${slug}`);
  const sceneAudios = await generateAudio({ scenes: script.scenes, slug, voice });
  const captionsPerScene = await generateCaptions({ sceneAudios, slug, scenes: script.scenes });
  const manifest = buildManifest({ script, slug, sceneAudios, captionsPerScene });

  // 生成物の隣に台本も残す。`npm run generate` が置くものと揃える。
  fs.writeFileSync(
    path.join(paths.projectDir(slug), "script.json"),
    `${JSON.stringify(script, null, 2)}\n`,
  );
  const manifestSrc = await publishProject(slug, manifest);

  const seconds = manifest.scenes.reduce((total, scene) => total + scene.durationInFrames, 0) / manifest.fps;
  for (const scene of manifest.scenes) {
    console.log(`  scene ${scene.scene_id}: ${(scene.durationInFrames / manifest.fps).toFixed(2)}s`);
  }
  console.log(`合計 ${seconds.toFixed(1)}s / manifestSrc: ${manifestSrc}`);
};

void run();
