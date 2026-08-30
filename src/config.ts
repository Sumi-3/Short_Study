import path from "node:path";
import fs from "node:fs";

/** Minimal .env loader so the CLI works without adding a dotenv dependency. */
const loadDotEnv = () => {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) {
    return;
  }
  for (const rawLine of fs.readFileSync(file, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadDotEnv();

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export { VIDEO } from "./config-video.js";

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  /**
   * Required only for identity-linked API keys, which do not themselves say
   * which workspace a request bills to. Workspace-scoped keys leave this empty.
   */
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",

  /** "edge" (free, default) | "elevenlabs" */
  ttsProvider: (process.env.TTS_PROVIDER ?? "edge") as "edge" | "elevenlabs",
  /** EdgeTTS only ships two Japanese voices: NanamiNeural (F), KeitaNeural (M). */
  edgeVoice: process.env.EDGE_VOICE ?? "ja-JP-NanamiNeural",
  /** e.g. "+10%" to speed the narration up. */
  edgeRate: process.env.EDGE_RATE ?? "+8%",
  /** Relative: "+10%", "-2st", "+20Hz". With only two voices, this is the main knob. */
  edgePitch: process.env.EDGE_PITCH ?? "+0%",
  /** Relative: "+0%" is the synthesiser's own level. */
  edgeVolume: process.env.EDGE_VOLUME ?? "+0%",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",

  /**
   * "tts" reuses EdgeTTS word boundaries: exact script text, exact timings, no
   * download. "whisper" runs @remotion/install-whisper-cpp instead — required
   * when TTS_PROVIDER=elevenlabs, but note that whisper.cpp's token-level JSON
   * splits Japanese characters across tokens (see generateCaptions.ts).
   */
  captionSource: (process.env.CAPTION_SOURCE ?? "tts") as "whisper" | "tts",
  whisperModel: process.env.WHISPER_MODEL ?? "medium",
  whisperVersion: process.env.WHISPER_VERSION ?? "1.5.5",
  language: "ja" as const,

  /** Target length, fed to the script prompt as a scene-count hint. */
  targetSeconds: num(process.env.TARGET_SECONDS, 50),
  /** Silence appended after each scene's narration, in seconds. */
  scenePaddingSeconds: num(process.env.SCENE_PADDING_SECONDS, 0.35),
} as const;

/**
 * Where generated projects are written. Normally that is the repo itself, but a
 * deployed build sits on a read-only filesystem with only `/tmp` writable, so
 * the data root has to come apart from the source root. Set
 * `SHORT_STUDY_DATA_DIR=/tmp` there; the finished files are uploaded from it
 * (see src/storage.ts) and the directory is free to vanish afterwards.
 */
const dataRoot = process.env.SHORT_STUDY_DATA_DIR ?? process.cwd();

export const paths = {
  root: process.cwd(),
  dataRoot,
  projects: path.join(dataRoot, "public", "projects"),
  whisper: path.join(dataRoot, "whisper.cpp"),
  out: path.join(dataRoot, "out"),
  projectDir: (slug: string) => path.join(dataRoot, "public", "projects", slug),
  /** Same location, but expressed relative to `public/` for `staticFile()`. */
  staticProject: (slug: string) => `projects/${slug}`,
};
