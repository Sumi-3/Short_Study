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

/**
 * Reads an environment variable, treating an empty one as absent.
 *
 * A dashboard stores "I added the key but left the box blank" as an empty
 * string, and `??` only falls back on `undefined` — so the blank sails through
 * as a real value. That is how an empty `ANTHROPIC_MODEL` reached the API as
 * `model: ""` and came back as a 400 that named the model, not the setting.
 */
const env = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  // Number("") is 0, which is finite — so a blank has to be ruled out first.
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback;
};

export { VIDEO } from "./config-video.js";

export const config = {
  anthropicApiKey: env("ANTHROPIC_API_KEY") ?? "",
  anthropicModel: env("ANTHROPIC_MODEL") ?? "claude-opus-5",
  /**
   * Required only for identity-linked API keys, which do not themselves say
   * which workspace a request bills to. Workspace-scoped keys leave this empty.
   */
  anthropicWorkspaceId: env("ANTHROPIC_WORKSPACE_ID") ?? "",

  /** "edge" (free, default) | "elevenlabs" */
  ttsProvider: (env("TTS_PROVIDER") ?? "edge") as "edge" | "elevenlabs",
  /** EdgeTTS only ships two Japanese voices: NanamiNeural (F), KeitaNeural (M). */
  edgeVoice: env("EDGE_VOICE") ?? "ja-JP-NanamiNeural",
  /** e.g. "+10%" to speed the narration up. */
  edgeRate: env("EDGE_RATE") ?? "+8%",
  /** Relative: "+10%", "-2st", "+20Hz". With only two voices, this is the main knob. */
  edgePitch: env("EDGE_PITCH") ?? "+0%",
  /** Relative: "+0%" is the synthesiser's own level. */
  edgeVolume: env("EDGE_VOLUME") ?? "+0%",
  elevenLabsApiKey: env("ELEVENLABS_API_KEY") ?? "",
  elevenLabsVoiceId: env("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModel: env("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2",

  /**
   * "tts" reuses EdgeTTS word boundaries: exact script text, exact timings, no
   * download. "whisper" runs @remotion/install-whisper-cpp instead — required
   * when TTS_PROVIDER=elevenlabs, but note that whisper.cpp's token-level JSON
   * splits Japanese characters across tokens (see generateCaptions.ts).
   */
  captionSource: (env("CAPTION_SOURCE") ?? "tts") as "whisper" | "tts",
  whisperModel: env("WHISPER_MODEL") ?? "medium",
  whisperVersion: env("WHISPER_VERSION") ?? "1.5.5",
  language: "ja" as const,

  // TARGET_SECONDS was removed: explanation complexity sets length; the shared
  // script budget is a deployment safety ceiling, not a user-selected duration.
  /** Silence appended after each scene's narration, in seconds. */
  scenePaddingSeconds: num(env("SCENE_PADDING_SECONDS"), 0.35),
} as const;

/**
 * Where generated projects are written. Normally that is the repo itself, but a
 * deployed build sits on a read-only filesystem with only `/tmp` writable, so
 * the data root has to come apart from the source root there.
 *
 * `/tmp` is picked automatically on Vercel rather than left to a setting: it is
 * the only writable path, so there is nothing for anyone to decide, and
 * forgetting it would mean an `EROFS` failure on the first narration file.
 * Whatever is written is uploaded from there (see src/storage.ts) and the
 * directory is free to vanish afterwards.
 */
const dataRoot =
  env("SHORT_STUDY_DATA_DIR") ??
  (process.env.VERCEL ? "/tmp" : process.cwd());

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
