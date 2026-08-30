import { courseOf, type CourseId } from "./courses";
import type { Manifest, Subject } from "./types";

/** One card in the feed. */
export type ShortSummary = {
  slug: string;
  topic: string;
  /** The hook scene's on-screen line — what the thumbnail leads with. */
  headline: string;
  course: CourseId;
  subject: Subject;
  createdAt: string;
  manifestSrc: string;
  durationInFrames: number;
  fps: number;
};

export const summarize = (
  manifest: Manifest,
  slug: string,
  manifestSrc: string,
): ShortSummary => {
  const hook =
    manifest.scenes.find((scene) => scene.visual_type === "hook") ??
    manifest.scenes[0];

  return {
    slug,
    topic: manifest.topic,
    // The hook's on-screen line is written to be readable at a glance, which is
    // exactly what a thumbnail needs — the raw topic is the user's whole prompt
    // sentence.
    headline: hook?.visual_content ?? manifest.topic,
    course: courseOf(manifest),
    subject: manifest.subject ?? "general",
    createdAt: manifest.createdAt,
    manifestSrc,
    durationInFrames: manifest.scenes.reduce(
      (sum, scene) => sum + scene.durationInFrames,
      0,
    ),
    fps: manifest.fps,
  };
};

export const newestFirst = (shorts: ShortSummary[]) =>
  [...shorts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
