import { DEFAULT_DESIGN, type DesignId } from "../designs.js";
import crypto from "node:crypto";
import type { CourseId } from "../courses.js";
import type { JobEvent, JobStatus } from "../progress.js";
import { publishProject } from "../storage.js";
import { buildManifest } from "./buildManifest.js";
import { generateAudio } from "./generateAudio.js";
import { generateCaptions } from "./generateCaptions.js";
import { generateScript } from "./generateScript.js";

/**
 * Weighted so the bar tracks wall-clock rather than step count: the Claude call
 * is most of the wait, TTS is a couple of seconds, the rest is disk I/O.
 */
const STEPS: { status: JobStatus; message: string; progress: number }[] = [
  { status: "script", message: "台本を書いています", progress: 0.05 },
  { status: "audio", message: "ナレーションを合成しています", progress: 0.75 },
  { status: "captions", message: "字幕のタイミングを取っています", progress: 0.9 },
  { status: "manifest", message: "動画を組み立てています", progress: 0.96 },
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
 * Runs one generation, reporting each stage as it starts.
 *
 * An async generator rather than a job record: the local server writes the
 * events into an in-process job, a deployed function writes them straight down
 * the response, and neither needs its own copy of the pipeline. Errors are
 * yielded rather than thrown so a caller that is already streaming can report
 * the failure on the same channel it has been reporting progress on.
 */
export async function* runPipeline({
  topic,
  course,
  voice,
  design,
}: {
  topic: string;
  course: CourseId;
  /** EdgeTTS ShortName chosen on the create screen. */
  voice?: string;
  design?: DesignId;
}): AsyncGenerator<JobEvent> {
  const base = { course, slug: null, manifestSrc: null, error: null } as const;
  const at = (index: number): JobEvent => ({ ...base, ...STEPS[index] });

  try {
    yield at(0);
    const script = await generateScript(topic, course);

    const slug = makeSlug(topic);

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
      script: { ...script, design: design ?? DEFAULT_DESIGN },
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
