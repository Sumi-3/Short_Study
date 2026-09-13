import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { paths } from "../config.js";
import type { SceneAudio, WordBoundary } from "./generateAudio.js";

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
}: {
  sceneAudios: SceneAudio[];
  slug: string;
}): Promise<Caption[][]> => {
  const captionsPerScene: Caption[][] = [];

  for (const sceneAudio of sceneAudios) {
    // 字幕は合成器が単語を置いた位置そのもので、音声認識の言い換えを挟まない。
    captionsPerScene.push(captionsFromWordBoundaries(sceneAudio.wordBoundaries));
  }

  // 中間出力を確認できるよう audio の隣に保管する。
  fs.writeFileSync(
    path.join(paths.projectDir(slug), "captions.json"),
    JSON.stringify(captionsPerScene, null, 2),
  );

  return captionsPerScene;
};
