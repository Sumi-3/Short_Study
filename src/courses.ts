import type { Subject } from "./types";

/**
 * A course is what the user picks before typing: it selects the system prompt
 * Claude is given, and it groups the finished shorts in the feed.
 *
 * It is deliberately not the same axis as `Subject`, which only picks the
 * palette and typeface. Several courses can share a look (世界史 and 日本史
 * would both be "history") while being taught completely differently.
 */
export const COURSE_IDS = ["japanese-history", "math", "general"] as const;
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
  "japanese-history": {
    id: "japanese-history",
    label: "日本史",
    subject: "history",
    placeholder: "例: 承久の乱で朝廷が幕府に負けたあと、何が変わったのか教えて",
  },
  math: {
    id: "math",
    label: "数学",
    subject: "math",
    placeholder:
      "例: y = x² + 4x + c が直線 y = 2x + 1 に接するように c を定め、接点の座標を求めよ",
  },
  general: {
    id: "general",
    label: "おまかせ",
    subject: null,
    placeholder: "例: 光合成のしくみを、何が何に変わるのかが分かるように教えて",
  },
};

export const courseList = COURSE_IDS.map((id) => COURSES[id]);

export const isCourseId = (value: unknown): value is CourseId =>
  typeof value === "string" && (COURSE_IDS as readonly string[]).includes(value);

/**
 * Shorts generated before courses existed only recorded a subject. Math is the
 * one course that can be recovered from it; "history" could be either 日本史 or
 * 世界史, so those stay under おまかせ rather than being filed wrongly.
 */
export const courseOf = (value: {
  course?: string;
  subject?: string;
}): CourseId => {
  if (isCourseId(value.course)) {
    return value.course;
  }
  return value.subject === "math" ? "math" : "general";
};
