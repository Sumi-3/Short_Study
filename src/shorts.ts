import { courseOf, type CourseId } from "./courses.js";
import type { Manifest, Subject } from "./types.js";

/** One card in the feed. */
export type ShortSummary = {
  slug: string;
  topic: string;
  /**
   * The question as bullet points — what the library card shows. Empty on
   * shorts made before it was recorded, and the card falls back to `topic`.
   */
  outline: string[];
  /** The hook scene's on-screen line — what the thumbnail leads with. */
  headline: string;
  course: CourseId;
  subject: Subject;
  /** Curriculum unit, e.g. "数II 微分・積分の考え". Empty if it could not be filed. */
  unit: string;
  /** Small category under that unit. Empty on shorts made before it was recorded. */
  subunit: string;
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
    outline: manifest.outline ?? [],
    // The hook's on-screen line is written to be readable at a glance, which is
    // exactly what a thumbnail needs — the raw topic is the user's whole prompt
    // sentence.
    headline: hook?.visual_content ?? manifest.topic,
    course: courseOf(manifest),
    subject: manifest.subject ?? "general",
    unit: manifest.unit ?? "",
    subunit: manifest.subunit ?? "",
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
