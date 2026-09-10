import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { config, paths } from "../config.js";
import type { SceneAudio, WordBoundary } from "./generateAudio.js";
import { splitNarration } from "../narration.js";

const captionsFromWordBoundaries = (boundaries: WordBoundary[]): Caption[] =>
  boundaries.map((boundary) => ({
    text: boundary.text,
    startMs: boundary.fromMs,
    endMs: boundary.toMs,
    timestampMs: boundary.fromMs + (boundary.toMs - boundary.fromMs) / 2,
    confidence: 1,
  }));

/**
 * 各 scene の caption 配列を返す。timestamp はその scene の audio clip 開始からの相対値。
 */
export const generateCaptions = async ({
  sceneAudios,
  slug,
  scenes,
}: {
  sceneAudios: SceneAudio[];
  slug: string;
  scenes: readonly { narration: string }[];
}): Promise<Caption[][]> => {
  const captionsPerScene: Caption[][] = [];

  for (const [index, sceneAudio] of sceneAudios.entries()) {
    // 新形式の対応付けでは、音声認識による言い換えを含まないEdgeの境界だけを使う。
    if (config.captionSource === "tts" || splitNarration(scenes[index].narration).display !== null) {
      if (!sceneAudio.wordBoundaries) {
        throw new Error(
          `TTS字幕と2ブロックのnarrationには TTS_PROVIDER=edge が必要です（シーン${sceneAudio.sceneId}にword boundaryがありません）。`,
        );
      }
      captionsPerScene.push(
        captionsFromWordBoundaries(sceneAudio.wordBoundaries),
      );
    } else {
      // 必要時だけ読み込む。whisper.cpp と ffmpeg binary は serverless bundle には大きすぎ、
      // `tts` ではこの経路を何も実行しないためである。
      const { captionsFromWhisper } = await import("./whisperCaptions.js");
      captionsPerScene.push(await captionsFromWhisper(sceneAudio.filePath));
    }
  }

  // 中間出力を確認できるよう audio の隣に保管する。
  fs.writeFileSync(
    path.join(paths.projectDir(slug), "captions.json"),
    JSON.stringify(captionsPerScene, null, 2),
  );

  return captionsPerScene;
};
