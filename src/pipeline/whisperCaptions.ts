import fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { Caption } from "@remotion/captions";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { config, paths } from "../config";

/**
 * The whole `CAPTION_SOURCE=whisper` path, kept in its own module so nothing
 * imports it unless it is actually used.
 *
 * `ffmpeg-static` ships a ~78MB binary and whisper.cpp builds a native tree
 * under `paths.whisper`, neither of which a serverless bundle can carry — and a
 * deployment runs `tts` captions anyway. A top-level import here would drag
 * both into every build regardless, so generateCaptions.ts reaches this file
 * through `await import()` only when the whisper source is selected.
 */

/** Whisper.cpp only accepts 16kHz mono WAV. */
const toWhisperWav = async (mp3Path: string) => {
  const { default: ffmpegPath } = await import("ffmpeg-static");
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not resolve a binary for this platform.");
  }
  const wavPath = mp3Path.replace(/\.mp3$/, ".wav");
  execFileSync(
    ffmpegPath,
    ["-i", mp3Path, "-ar", "16000", "-ac", "1", "-y", wavPath],
    { stdio: "ignore" },
  );
  return wavPath;
};

/**
 * whisper.cpp emits one BPE token per item under `--max-len 1`, and for
 * Japanese a single character spans several tokens — so its JSON contains
 * split multi-byte sequences that decode to U+FFFD. The bytes are gone by the
 * time `transcribe()` hands them back, so the best available repair is to fold
 * each broken run into the next readable token and keep its timing.
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

  // A run at the very end has nothing to fold into; extend the last token.
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
