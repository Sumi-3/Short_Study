import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { VIDEO, config, paths } from "../config.js";
import type { Manifest, Script } from "../types.js";
import type { SceneAudio } from "./generateAudio.js";
import { applyDisplaySpelling, normalizeCaptionMath } from "./captionSpelling.js";
import { markPhraseBreaks } from "./captionBreaks.js";

/**
 * この scene が画面に出す文字列をひとまとめにする。
 *
 * 裸の文字読みを字幕へ戻すとき、「エー」が A か a かを決める根拠になる。visual は種類ごとに
 * 形が違うので、個別に取り出さず全文字列を集める。判定は includes だけなので、余分な語が
 * 混じっても害はない。問題文を含めるのは、点の名前がそこで定義されるからである。
 */
const notationOf = (topic: string, scene: Script["scenes"][number]) =>
  [topic, scene.visual_content, JSON.stringify(scene.visual ?? "")].join(" ");

const prepareCaptions = (
  narration: string,
  captions: Caption[],
  subject: Script["subject"],
  notation: string,
) => {
  const paged = markPhraseBreaks(narration, captions);
  // 数学だけは読む人でなく synthesiser 用の綴りで narration を意図的に書く教科である。
  return subject === "math" ? applyDisplaySpelling(paged, notation) : normalizeCaptionMath(paged);
};

export const buildManifest = ({
  script,
  slug,
  sceneAudios,
  captionsPerScene,
}: {
  script: Script;
  slug: string;
  sceneAudios: SceneAudio[];
  captionsPerScene: Caption[][];
}): Manifest => {
  const manifest: Manifest = {
    topic: script.topic,
    outline: script.outline,
    unit: script.unit,
    subunit: script.subunit,
    difficulty: script.difficulty,
    model: script.model,
    course: script.course,
    subject: script.subject,
    slug,
    fps: VIDEO.fps,
    width: VIDEO.width,
    height: VIDEO.height,
    createdAt: new Date().toISOString(),
    scenes: script.scenes.map((scene, index) => {
      const audio = sceneAudios[index];
      const seconds = audio.durationInSeconds + config.scenePaddingSeconds;
      return {
        ...scene,
        audioSrc: audio.audioSrc,
        audioDurationInSeconds: audio.durationInSeconds,
        durationInFrames: Math.max(1, Math.ceil(seconds * VIDEO.fps)),
        captions: prepareCaptions(
          scene.narration,
          captionsPerScene[index],
          script.subject,
          notationOf(script.topic, scene),
        ),
      };
    }),
  };

  const dir = paths.projectDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "script.json"),
    JSON.stringify(script, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return manifest;
};

export const manifestSrc = (slug: string) =>
  `${paths.staticProject(slug)}/manifest.json`;
