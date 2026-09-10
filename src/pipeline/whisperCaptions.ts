import fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { Caption } from "@remotion/captions";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { config, paths } from "../config.js";

/**
 * `CAPTION_SOURCE=whisper` の経路全体。実際に使うまで何も import しないよう別 module に置く。
 *
 * `ffmpeg-static` は約 78MB の binary を同梱し、whisper.cpp は `paths.whisper` 配下に native tree
 * をビルドする。どちらも serverless bundle には載せられず、deployment はそもそも `tts` 字幕を使う。
 * ここで top-level import すると全 build に両方を引き込むため、whisper source 選択時だけ
 * generateCaptions.ts が `await import()` でこのファイルへ到達する。
 */

/** Whisper.cpp は 16kHz モノラル WAV しか受け付けない。 */
const toWhisperWav = async (mp3Path: string) => {
  const { default: ffmpegPath } = await import("ffmpeg-static");
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not resolve a binary for this platform.");
  }
  const wavPath = mp3Path.replace(/\.mp3$/, ".wav");
  execFileSync(
    ffmpegPath,
    ["-i", mp3Path, "-ar", "16000", "-ac", "1", "-y", wavPath],
    // timeout を過ぎれば子プロセスごと落とす。await を race で見捨てるのと違い、
    // ffmpeg を残さない。
    { stdio: "ignore", timeout: config.whisperTimeoutMs },
  );
  return wavPath;
};

/**
 * whisper.cpp は `--max-len 1` で item ごとに BPE token を 1 つ出す。日本語では 1 文字が複数
 * token にまたがるため、JSON に U+FFFD へ decode される分割済み multi-byte sequence が入る。
 * `transcribe()` が返す時点で bytes は失われているため、壊れた連続部分を次の読める token に畳み、
 * そのタイミングを保つのが可能な最善の修復になる。
 */
const repairBrokenTokens = (captions: Caption[]): Caption[] => {
  const repaired: Caption[] = [];
  let pendingStartMs: number | null = null;

  for (const caption of captions) {
    if (caption.text.includes("\uFFFD")) {
      pendingStartMs ??= caption.startMs;
      continue;
    }
    repaired.push(
      pendingStartMs === null
        ? caption
        : { ...caption, startMs: pendingStartMs },
    );
    pendingStartMs = null;
  }

  // 末尾の連続部分には畳み込む先がないため、最後の token を延長する。
  const last = repaired[repaired.length - 1];
  if (pendingStartMs !== null && last) {
    last.endMs = Math.max(last.endMs, pendingStartMs);
  }

  return repaired;
};

let whisperReady: Promise<void> | null = null;

const ensureWhisper = async () => {
  const { installWhisperCpp, downloadWhisperModel } = await import(
    "@remotion/install-whisper-cpp"
  );
  whisperReady ??= (async () => {
    await installWhisperCpp({ to: paths.whisper, version: config.whisperVersion });
    await downloadWhisperModel({
      model: config.whisperModel as WhisperModel,
      folder: paths.whisper,
    });
  })();
  return whisperReady;
};

export const captionsFromWhisper = async (
  mp3Path: string,
): Promise<Caption[]> => {
  const { transcribe, toCaptions } = await import(
    "@remotion/install-whisper-cpp"
  );
  await ensureWhisper();
  const wavPath = await toWhisperWav(mp3Path);

  try {
    const output = await transcribe({
      model: config.whisperModel as WhisperModel,
      whisperPath: paths.whisper,
      whisperCppVersion: config.whisperVersion,
      inputPath: wavPath,
      language: config.language,
      tokenLevelTimestamps: true,
      printOutput: false,
    });

    return repairBrokenTokens(toCaptions({ whisperCppOutput: output }).captions);
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
};
