import type { Subject } from "./types.js";

/**
 * 現在のコースは数学だけでも、course metadata は API と manifest の境界に残す。名前付きの
 * 1 値 union により新データが任意文字列を受け入れるのを防ぎ、`courseOf` は既存 manifest の
 * 廃止済み値を math に畳み込む。
 */
export const COURSE_IDS = ["math"] as const;
export type CourseId = (typeof COURSE_IDS)[number];

export type CourseMeta = {
  id: CourseId;
  /** picker chip と thumbnail に表示する。 */
  label: string;
  /**
   * narration と字幕表記に使う。コースが教科を事前に決められない場合は `null` とし、
   * Claude に委ねる。
   */
  subject: Subject | null;
  /** そのコース選択中に composer へ表示する入力例。 */
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
 * 現在はすべて数学である。他コースが存在した時期に生成した short には独自の `course` が残るため、
 * feed に分類できない entry を残さず畳み込むためにこれを置く。
 */
export const courseOf = (_value: { course?: string; subject?: string }): CourseId =>
  "math";
