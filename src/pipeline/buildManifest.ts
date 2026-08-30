import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { VIDEO, config, paths } from "../config.js";
import type { Manifest, Script } from "../types.js";
import type { SceneAudio } from "./generateAudio.js";
import { applyDisplaySpelling } from "./captionSpelling.js";
import { markPhraseBreaks } from "./captionBreaks.js";

const prepareCaptions = (
  narration: string,
  captions: Caption[],
  subject: Script["subject"],
) => {
  const paged = markPhraseBreaks(narration, captions);
  // Maths is the only subject whose narration is deliberately spelled for the
  // synthesiser rather than for the reader.
  return subject === "math" ? applyDisplaySpelling(paged) : paged;
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
    unit: script.unit,
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
