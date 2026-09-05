import { DEFAULT_DESIGN } from "../designs.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { apiScriptSchema, normalizeVisual, type Script } from "../types.js";
import { coursePrompts } from "../prompts/index.js";
import { budgetFor } from "../prompts/shared.js";
import { topicsOf } from "../curriculum.js";
import type { CourseId } from "../courses.js";

/**
 * Keeps the unit label on the curriculum. An exact name passes; a near miss
 * ("数I 図形と計量（余弦定理）") is pulled back to the canonical one; anything
 * unrecognisable is dropped rather than shown, because a made-up unit is worse
 * than none.
 */
/**
 * The question as the model wrote it back out.
 *
 * `topic` is the string the whole video is built around — the opening frame,
 * the card on the home screen, the library — and TOPIC_RULE is what turns a
 * paste out of a web page into something typeset. So the model's version is
 * the one that ships; what was typed is only the fallback for an empty answer.
 *
 * This used to keep the model's spelling only when every digit survived in
 * order, and hand back the raw input otherwise. The guard fired on ordinary,
 * correct edits — dropping a 「設問」 heading, renumbering `1.` as `(1)` — and
 * every time it did, the screen went back to showing exactly the mess the rule
 * exists to clean up.
 */
const displayTopic = (typed: string, written: string) =>
  written.trim() || typed;

const resolveUnit = (written: string, allowed: readonly string[] | null) => {
  const unit = written.trim();
  if (!allowed || !unit) {
    return unit;
  }
  if (allowed.includes(unit)) {
    return unit;
  }
  return allowed.find((name) => unit.startsWith(name) || unit.includes(name)) ?? "";
};

/**
 * Splits the one `unit` string the model returns back into the two levels.
 *
 * The banner shows the unit; the small category only files the short on the
 * home screen, so an unrecognised one is dropped rather than shown.
 */
const classify = (written: string, allowed: readonly string[] | null) => {
  const [rawUnit = "", rawSubunit = ""] = written.split("｜");
  const unit = resolveUnit(rawUnit, allowed);
  const topics = topicsOf(unit);
  const subunit = rawSubunit.trim();

  if (!topics || !subunit) {
    return { unit, subunit: "" };
  }

  return {
    unit,
    subunit:
      topics.find((topic) => topic === subunit) ??
      topics.find(
        (topic) => topic.startsWith(subunit) || subunit.startsWith(topic),
      ) ??
      "",
  };
};

export const generateScript = async (
  topic: string,
  courseId: CourseId = "math",
): Promise<Script> => {
  const course = coursePrompts[courseId] ?? coursePrompts.math;

  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const client = anthropic();

  /*
   * The ceiling has to follow the scene count, because adaptive thinking spends
   * from it too.
   *
   * A finished scene measures 275-560 characters of JSON, so 1,500 tokens per
   * scene is generous and the flat 12,000 is headroom for the thinking. At the
   * old fixed 16,000 a long script just stopped mid-scene and came back as
   * `stop_reason: max_tokens` with nothing parseable.
   *
   * `points` does not depend on the pace, so the course's own pace is not
   * needed in order to count the scenes.
   */
  const scenes = budgetFor(config.targetSeconds).points + 2;
  const maxTokens = Math.min(64_000, 12_000 + scenes * 1_500);

  /*
   * Streamed rather than a plain `.parse()`, because the SDK refuses any
   * non-streaming request whose `max_tokens` implies more than ten minutes of
   * work — `3600 * max_tokens / 128000 > 600`, i.e. anything over 21,333. A
   * 12-scene script is already past that. `finalMessage()` still carries
   * `parsed_output`, so structured outputs survive the switch; nothing here
   * consumes the intermediate events.
   */
  const response = await client.messages
    .stream({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      system: course.buildSystemPrompt(config.targetSeconds),
      messages: [{ role: "user", content: topic }],
      output_config: { format: zodOutputFormat(apiScriptSchema) },
    })
    .finalMessage();

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Claude returned no parseable script (stop_reason: ${response.stop_reason}).`,
    );
  }

  return {
    // The same question, spelled consistently — see TOPIC_RULE. Falls back to
    // exactly what was typed if the model returned something else.
    topic: displayTopic(topic, parsed.topic),
    // Filled in by `runPipeline` from its own call — see generateOutline.ts.
    outline: [],
    ...classify(parsed.unit, course.units),
    // Chosen by the user, not the model; runPipeline overwrites it.
    design: DEFAULT_DESIGN,
    course: course.id,
    // A course with a fixed subject has already told the model which one to
    // pick, so the two agree; `general` is the case where the answer matters.
    subject: course.subject ?? parsed.subject,
    scenes: parsed.scenes.map((scene, index) => ({
      scene_id: index + 1,
      narration: scene.narration,
      visual_type: scene.visual_type,
      visual_content: scene.visual_content,
      visual: normalizeVisual(scene),
    })),
  };
};
