import { DEFAULT_DESIGN } from "../designs.js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { apiScriptSchema, normalizeVisual, type Script } from "../types.js";
import { coursePrompts } from "../prompts/index.js";
import { topicsOf } from "../curriculum.js";
import type { CourseId } from "../courses.js";

/**
 * Keeps the unit label on the curriculum. An exact name passes; a near miss
 * ("数I 図形と計量（余弦定理）") is pulled back to the canonical one; anything
 * unrecognisable is dropped rather than shown, because a made-up unit is worse
 * than none.
 */
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

  const response = await client.messages.parse({
    model: config.anthropicModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: course.buildSystemPrompt(config.targetSeconds),
    messages: [{ role: "user", content: topic }],
    output_config: { format: zodOutputFormat(apiScriptSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Claude returned no parseable script (stop_reason: ${response.stop_reason}).`,
    );
  }

  return {
    // The user's own words, not the model's title for them: this is what the
    // opening card shows, and a question paraphrased into a heading stops
    // being the question.
    topic: topic || parsed.topic,
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
