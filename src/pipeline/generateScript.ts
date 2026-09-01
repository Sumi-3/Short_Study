import { DEFAULT_DESIGN } from "../designs.js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
 * Digits in the order they appear, however they were written.
 *
 * Full-width and superscript forms are folded first, because turning `４` into
 * `4` and `x²` into `x^2` is exactly what the model was asked to do — the check
 * has to see through its own instructions to be worth anything.
 */
const digitsOf = (text: string) =>
  text
    .replace(/[０-９]/g, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
    )
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[^0-9]/g, "");

/**
 * The model's tidied spelling of the question — unless it edited it.
 *
 * The prompt is what does the work; this only catches the gross failures, where
 * a model hands back a title, an answer, or a paraphrase instead of the
 * question. Every number surviving in order is a cheap signal for that, and
 * numbers are the part of a maths question that must not quietly change. A
 * question with no digits in it has nothing to check and nothing to corrupt.
 */
const displayTopic = (typed: string, written: string) => {
  const tidied = written.trim();
  if (!typed) {
    return tidied;
  }
  if (!tidied) {
    return typed;
  }
  return digitsOf(tidied) === digitsOf(typed) ? tidied : typed;
};

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

  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
    // The SDK has no dedicated option for this, so it goes in as a header —
    // and only when set, since an empty value is rejected.
    ...(config.anthropicWorkspaceId
      ? {
          defaultHeaders: {
            "anthropic-workspace-id": config.anthropicWorkspaceId,
          },
        }
      : {}),
  });

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
