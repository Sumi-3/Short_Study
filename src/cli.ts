import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config, paths } from "./config.js";
import { generateScript } from "./pipeline/generateScript.js";
import { generateAudio } from "./pipeline/generateAudio.js";
import { generateCaptions } from "./pipeline/generateCaptions.js";
import { buildManifest, manifestSrc } from "./pipeline/buildManifest.js";
import { checkFigures } from "./pipeline/checkFigures.js";
import { scriptSchema, type Script } from "./types.js";
import { COURSE_IDS, COURSES, isCourseId, type CourseId } from "./courses.js";

const usage = `Usage: npm run generate -- "<トピック>" [options]

Options:
  --course <id>   科目を指定して専用のプロンプトを使う
                  ${COURSE_IDS.join(" | ")}（既定は math）
  --script <path> 手書きの台本JSONを読み込む（台本生成だけ飛ばす）
  --slug <name>   出力先フォルダ名を固定する（既定は日付＋ハッシュ）

Environment: see .env.example`;

const parseArgs = (argv: string[]) => {
  const positional: string[] = [];
  let slug: string | null = null;
  let scriptPath: string | null = null;
  let course: CourseId = "math";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") {
      slug = argv[++i] ?? null;
    } else if (arg === "--script") {
      scriptPath = argv[++i] ?? null;
    } else if (arg === "--course") {
      const value = argv[++i];
      if (!isCourseId(value)) {
        console.error(`--course は ${COURSE_IDS.join(" / ")} のいずれか`);
        process.exit(1);
      }
      course = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }

  return {
    topic: positional.join(" ").trim(),
    course,
    slug,
    scriptPath,
  };
};

/** topic は日本語なので、slugify せず filesystem-safe な名前を導く。 */
const makeSlug = (topic: string) => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const hash = crypto.createHash("sha1").update(topic).digest("hex").slice(0, 6);
  return `${stamp}-${hash}`;
};

const step = (n: number, total: number, label: string) => {
  console.log(`\n[${n}/${total}] ${label}`);
};

const main = async () => {
  const { topic, course, slug: slugArg, scriptPath } =
    parseArgs(process.argv.slice(2));

  if (!topic && !scriptPath) {
    console.error(usage);
    process.exit(1);
  }

  const slug = slugArg ?? makeSlug(topic || scriptPath!);
  const totalSteps = 4;
  console.log(`🎬 "${topic || "(script file)"}"  →  public/projects/${slug}/`);

  const stepOneLabel = scriptPath
    ? `台本読み込み (${scriptPath})`
    : `台本生成 (${COURSES[course].label} / ${config.anthropicModel})`;
  step(1, totalSteps, stepOneLabel);

  const script: Script = scriptPath
    ? scriptSchema.parse(JSON.parse(fs.readFileSync(scriptPath, "utf-8")))
    : await generateScript(topic, course);
  for (const scene of script.scenes) {
    console.log(`   ${scene.scene_id}. [${scene.visual_type}] ${scene.narration.slice(0, 32)}…`);
  }
  for (const warning of checkFigures(script)) {
    console.warn(`   ⚠︎ ${warning}`);
  }

  step(2, totalSteps, `ナレーション生成 (TTS: ${config.ttsProvider})`);
  const sceneAudios = await generateAudio({ scenes: script.scenes, slug });
  const totalSeconds = sceneAudios.reduce((sum, a) => sum + a.durationInSeconds, 0);
  console.log(`   ${sceneAudios.length} clips / ${totalSeconds.toFixed(1)}s`);

  step(3, totalSteps, `字幕タイミング取得 (${config.captionSource})`);
  const captionsPerScene = await generateCaptions({ sceneAudios, slug, scenes: script.scenes });
  console.log(`   ${captionsPerScene.reduce((sum, c) => sum + c.length, 0)} tokens`);

  step(4, totalSteps, "manifest 書き出し");
  const manifest = buildManifest({ script, slug, sceneAudios, captionsPerScene });
  const frames = manifest.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  console.log(`   ${frames} frames (${(frames / manifest.fps).toFixed(1)}s)`);

  const propsPath = path.join(paths.projectDir(slug), "props.json");
  fs.writeFileSync(propsPath, JSON.stringify({ manifestSrc: manifestSrc(slug) }));
  console.log(
    `\n✅ manifest: public/${manifestSrc(slug)}` +
      `\n   Web アプリで再生できます` +
      `\n   Studio で確認: npm run studio -- --props=${propsPath}`,
  );
};

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
