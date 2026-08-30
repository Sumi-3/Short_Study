import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { config, paths } from "../config";
import type { SceneAudio, WordBoundary } from "./generateAudio";

const captionsFromWordBoundaries = (boundaries: WordBoundary[]): Caption[] =>
  boundaries.map((boundary) => ({
    text: boundary.text,
    startMs: boundary.fromMs,
    endMs: boundary.toMs,
    timestampMs: boundary.fromMs + (boundary.toMs - boundary.fromMs) / 2,
    confidence: 1,
  }));

/**
 * Returns one caption array per scene, with timestamps relative to the start of
 * that scene's audio clip.
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
    if (config.captionSource === "tts") {
      if (!sceneAudio.wordBoundaries) {
        throw new Error(
          `CAPTION_SOURCE=tts requires TTS_PROVIDER=edge (scene ${sceneAudio.sceneId} has no word boundaries).`,
        );
      }
      captionsPerScene.push(
        captionsFromWordBoundaries(sceneAudio.wordBoundaries),
      );
    } else {
      // Loaded on demand: whisper.cpp and its ffmpeg binary are far too large
      // for a serverless bundle, and nothing on that path runs under `tts`.
      const { captionsFromWhisper } = await import("./whisperCaptions");
      captionsPerScene.push(await captionsFromWhisper(sceneAudio.filePath));
    }
  }

  // Kept next to the audio so the intermediate output is inspectable.
  fs.writeFileSync(
    path.join(paths.projectDir(slug), "captions.json"),
    JSON.stringify(captionsPerScene, null, 2),
  );

  return captionsPerScene;
};
