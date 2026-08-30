import type { Subject } from "./types.js";

/**
 * A course is what the user picks before typing: it selects the system prompt
 * Claude is given, and it groups the finished shorts in the feed.
 *
 * It is deliberately not the same axis as `Subject`, which only picks the
 * palette and typeface. Several courses can share a look (世界史 and 日本史
 * would both be "history") while being taught completely differently.
 */
export const COURSE_IDS = ["math"] as const;
export type CourseId = (typeof COURSE_IDS)[number];

export type CourseMeta = {
  id: CourseId;
  /** Shown on the picker chip and the thumbnail. */
  label: string;
  /**
   * The theme the finished video wears. `null` means the course does not know
   * in advance — Claude decides, and its answer is used.
   */
  subject: Subject | null;
  /** Example input, shown in the composer while that course is selected. */
  placeholder: string;
};

export const COURSES: Record<CourseId, CourseMeta> = {
  math: {
    id: "math",
    label: "数学",
    subject: "math",
    placeholder:
      "例: y = x² + 4x + c が直線 y = 2x + 1 に接するように c を定め、接点の座標を求めよ",
  },
};

export const courseList = COURSE_IDS.map((id) => COURSES[id]);

export const isCourseId = (value: unknown): value is CourseId =>
  typeof value === "string" && (COURSE_IDS as readonly string[]).includes(value);

/**
 * Everything is maths now. Shorts generated while other courses existed still
 * carry their own `course`, so this exists to fold them in rather than leave
 * the feed with entries it cannot file.
 */
export const courseOf = (_value: { course?: string; subject?: string }): CourseId =>
  "math";
