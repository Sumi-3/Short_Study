import { COURSES, type CourseId, type CourseMeta } from "../courses";
import { MATH_UNIT_NAMES } from "../curriculum";
import { generalPrompt } from "./general";
import { japaneseHistoryPrompt } from "./japaneseHistory";
import { mathPrompt } from "./math";

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
