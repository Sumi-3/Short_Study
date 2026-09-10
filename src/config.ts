import path from "node:path";
import fs from "node:fs";

/** dotenv 依存を増やさず CLI が動くようにする最小限の .env ローダー。 */
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
 * 環境変数を読み、空文字は未設定として扱う。
 *
 * ダッシュボードでは「キーは追加したが欄は空」の状態が空文字で保存される。`??` は
 * `undefined` にしかフォールバックしないため、空文字が実値として通ってしまう。空の
 * `ANTHROPIC_MODEL` が API に `model: ""` として届き、設定ではなくモデル名を指す 400 が
 * 返ったのはこのためである。
 */
const env = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  // Number("") は有限な 0 になるため、先に空文字を除外する必要がある。
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback;
};

export { VIDEO } from "./config-video.js";

export const config = {
  anthropicApiKey: env("ANTHROPIC_API_KEY") ?? "",
  anthropicModel: env("ANTHROPIC_MODEL") ?? "claude-opus-5",
  /**
   * 要求の課金先 workspace をキー自身が示さない identity-linked API key にだけ必要。
   * workspace-scoped key では空のままにする。
   */
  anthropicWorkspaceId: env("ANTHROPIC_WORKSPACE_ID") ?? "",

  /** "edge"（無料・既定値）| "elevenlabs" */
  ttsProvider: (env("TTS_PROVIDER") ?? "edge") as "edge" | "elevenlabs",
  /** EdgeTTS が提供する日本語音声は NanamiNeural（女性）と KeitaNeural（男性）の 2 つだけ。 */
  edgeVoice: env("EDGE_VOICE") ?? "ja-JP-NanamiNeural",
  /** 例: ナレーションを速くする "+10%"。 */
  edgeRate: env("EDGE_RATE") ?? "+8%",
  /** 相対値: "+10%"、"-2st"、"+20Hz"。音声が 2 種だけなので主な調整手段になる。 */
  edgePitch: env("EDGE_PITCH") ?? "+0%",
  /** 相対値。"+0%" は synthesiser 本来の音量。 */
  edgeVolume: env("EDGE_VOLUME") ?? "+0%",
  elevenLabsApiKey: env("ELEVENLABS_API_KEY") ?? "",
  elevenLabsVoiceId: env("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModel: env("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2",

  /**
   * "tts" は EdgeTTS の word boundary を再利用するため、台本の文字もタイミングも正確で
   * ダウンロードが不要。"whisper" は代わりに @remotion/install-whisper-cpp を動かす。
   * TTS_PROVIDER=elevenlabs では必要だが、whisper.cpp の token-level JSON は日本語文字を
   * token をまたいで分割する点に注意（generateCaptions.ts 参照）。
   */
  captionSource: (env("CAPTION_SOURCE") ?? "tts") as "whisper" | "tts",
  whisperModel: env("WHISPER_MODEL") ?? "medium",
  whisperVersion: env("WHISPER_VERSION") ?? "1.5.5",
  language: "ja" as const,

  // TARGET_SECONDS は参照しない。再生時間は全シーンの音声実長と余白の合計で決める。
  /** 各シーンのナレーション後へ加える無音（秒）。 */
  scenePaddingSeconds: num(env("SCENE_PADDING_SECONDS"), 0.35),
} as const;

/**
 * 生成したプロジェクトの書き込み先。通常はリポジトリ本体だが、デプロイ済みビルドは
 * `/tmp` だけ書き込み可能な読み取り専用ファイルシステム上にあるため、そこで data root を
 * source root から分ける必要がある。
 *
 * Vercel では `/tmp` を設定に委ねず自動選択する。書き込み可能な唯一のパスで選ぶ余地がなく、
 * 忘れれば最初のナレーションファイルで `EROFS` になるためである。書いたものはそこから
 * upload され（src/storage.ts 参照）、その後ディレクトリが消えてもよい。
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
  /** 同じ場所を `staticFile()` 用に `public/` からの相対パスで表す。 */
  staticProject: (slug: string) => `projects/${slug}`,
};
