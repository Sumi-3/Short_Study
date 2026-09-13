import crypto from "node:crypto";
import type { CourseId } from "../courses.js";
import type { JobEvent, JobStatus } from "../progress.js";
import { publishProject } from "../storage.js";
import { buildManifest } from "./buildManifest.js";
import { generateAudio } from "./generateAudio.js";
import { generateCaptions } from "./generateCaptions.js";
import { generateOutline } from "./generateOutline.js";
import { generateScript } from "./generateScript.js";
import { config } from "../config.js";

/**
 * bar が工程数ではなく実時間を追うよう重み付けする。待ち時間の大半は Claude 呼び出しで、
 * TTS は数秒、残りは disk I/O である。
 */
const STEPS: { status: JobStatus; message: string; progress: number }[] = [
  { status: "script", message: "台本を書いています", progress: 0.90 },
  { status: "audio", message: "ナレーションを合成しています", progress: 0.93 },
  { status: "captions", message: "字幕のタイミングを取っています", progress: 0.95 },
  { status: "manifest", message: "動画を組み立てています", progress: 0.99 },
];

const makeSlug = (topic: string) => {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const hash = crypto
    .createHash("sha1")
    .update(topic + crypto.randomUUID())
    .digest("hex")
    .slice(0, 6);
  return `${stamp}-${hash}`;
};

/**
 * 1 回の生成を実行し、各工程の開始時に通知する。
 *
 * job record ではなく async generator にする。local server は event をプロセス内 job へ書き、
 * deployed function は response へ直接書くため、どちらにも pipeline の複製が要らない。
 * 既に stream 中の呼び出し元が進捗と同じ channel で失敗を伝えられるよう、エラーは throw せず
 * yield する。
 */
export async function* runPipeline({
  topic,
  course,
  voice,
  model = config.anthropicModel,
}: {
  topic: string;
  course: CourseId;
  /** 作成画面で選ぶ EdgeTTS ShortName。 */
  voice?: string;
  /** 作成画面で選ぶ台本モデル。比較用で、省略時は ANTHROPIC_MODEL。 */
  model?: string;
}): AsyncGenerator<JobEvent> {
  const base = { course, slug: null, manifestSrc: null, error: null } as const;
  const at = (index: number): JobEvent => ({ ...base, ...STEPS[index] });

  try {
    yield at(0);
    const script = await generateScript(topic, course, model);

    const slug = makeSlug(topic);

    /*
     * ここで開始し下で回収するため、ナレーションの合成・計時中に走る。2 回目の model call なので、
     * 重ねなければその全遅延を生成に足してしまうが、重ねれば実時間の負担はない。ない card は問題文を
     * 表示してフォールバックできるため、この失敗で動画を失ってはならず、rejection を握りつぶす。
     */
    const outline = generateOutline(script.topic, model).catch(() => [] as string[]);

    yield at(1);
    const sceneAudios = await generateAudio({
      scenes: script.scenes,
      slug,
      voice,
    });

    yield at(2);
    const captionsPerScene = await generateCaptions({ sceneAudios, slug });

    yield at(3);
    const manifest = buildManifest({
      script: {
        ...script,
        outline: await outline,
      },
      slug,
      sceneAudios,
      captionsPerScene,
    });
    const manifestSrc = await publishProject(slug, manifest);

    yield {
      ...base,
      status: "done",
      message: "完成しました",
      progress: 1,
      slug,
      manifestSrc,
    };
  } catch (error) {
    yield {
      ...base,
      status: "error",
      message: "生成に失敗しました",
      progress: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
