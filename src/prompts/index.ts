import { COURSES, type CourseId, type CourseMeta } from "../courses.js";
import { MATH_UNIT_NAMES } from "../curriculum.js";
import { generalPrompt } from "./general.js";
import { japaneseHistoryPrompt } from "./japaneseHistory.js";
import { mathPrompt } from "./math.js";

/**
 * Course metadata plus the prompt that teaches it. Kept apart from
 * `src/courses.ts` so the web bundle can import the labels without pulling in
 * every prompt string.
 */
export type Course = CourseMeta & {
  buildSystemPrompt: (targetSeconds: number) => string;
  /** Allowed `unit` values; `null` lets the model write its own. */
  units: readonly string[] | null;
};

export const coursePrompts: Record<CourseId, Course> = {
  "japanese-history": {
    ...COURSES["japanese-history"],
    buildSystemPrompt: japaneseHistoryPrompt,
    units: null,
  },
  math: {
    ...COURSES.math,
    buildSystemPrompt: mathPrompt,
    units: MATH_UNIT_NAMES,
  },
  general: { ...COURSES.general, buildSystemPrompt: generalPrompt, units: null },
};
