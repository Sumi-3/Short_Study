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

/** API が受け付ける effort。範囲外を投げると 400 になるが、それが分かるのは要求の後。 */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

const effort = (value: string | undefined, fallback: Effort): Effort =>
  EFFORTS.find((level) => level === value?.trim().toLowerCase()) ?? fallback;

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

  /*
   * どの待ちにも締め切りを持たせる。
   *
   * SDK の既定は 1 要求 10 分、しかも timeout も再試行するため、既定のままだと
   * 台本 1 本で 10 分 × (1 + maxRetries) かかり、そこへ generateScript 自身の
   * 書き直し 1 回が掛かる。応答が返らない相手を、生成 1 本で 1 時間近く待つことになる。
   * 止まったのか長いだけなのかを利用者が判断できないので、ここで上限を決める。
   */

  /** 台本 1 要求の上限。thinking と長い台本に対して余裕を持たせる。 */
  scriptTimeoutMs: num(env("SCRIPT_TIMEOUT_MS"), 6 * 60_000),
  /**
   * 台本を書く前にモデルがどれだけ考えるか。
   *
   * 思考も 1 token ずつ生成される以上、そのまま待ち時間になる。opus-5 は
   * `thinking.budget_tokens` を受け付けず（400 が返る）、この effort で制御する。
   * 下げれば速くなるが、思考はモデルが実際に問題を解いている部分でもある。答えを
   * 間違えれば動画ごと無駄で、規則違反なら書き直し 1 回ぶん増えるので、削りすぎは
   * かえって遅くなる。
   */
  scriptEffort: effort(env("SCRIPT_EFFORT"), "medium"),
  /** 問題文の整形 1 要求の上限。max_tokens が 2,000 なので台本より短くてよい。 */
  outlineTimeoutMs: num(env("OUTLINE_TIMEOUT_MS"), 60_000),
  /** 1 シーン分の音声合成の上限。EdgeTTS の WebSocket が黙って切れても止まらないため。 */
  ttsTimeoutMs: num(env("TTS_TIMEOUT_MS"), 90_000),
  /** whisper 1 本の上限。CAPTION_SOURCE=whisper のときだけ使う。 */
  whisperTimeoutMs: num(env("WHISPER_TIMEOUT_MS"), 5 * 60_000),
  /**
   * API 側の再試行回数。SDK の既定 2 回は、上の締め切りに毎回掛かる。
   * 一度の失敗は生成全体をやり直させるより、早く伝えたほうがよい。
   */
  anthropicMaxRetries: num(env("ANTHROPIC_MAX_RETRIES"), 1),

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
