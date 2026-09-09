import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { apiScriptSchema, normalizeVisual, type Script } from "../types.js";
import { coursePrompts } from "../prompts/index.js";
import { assertScriptBudget, budgetFor, scriptMaxTokens } from "../prompts/shared.js";
import { assertFormulaCarry } from "../formulaLines.js";
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

/** Half the 170s that prompts/shared.ts reserves for this step of the 300s cap. */
const SCRIPT_RETRY_BUDGET_MS = 85_000;

/** A script the model produced that broke a rule it is able to follow. */
class ScriptRejection extends Error {}

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
   * Reserve for the maximum allowed script, since the model chooses its actual
   * scene count in this same call. No unreachable 64k clamp: ten scenes need
   * 12,000 + 10 * 1,500 = 27,000 tokens including adaptive thinking.
   */
  const budget = budgetFor("math");
  const maxTokens = scriptMaxTokens(budget);

  /*
   * Streamed rather than a plain `.parse()`, because the SDK refuses any
   * non-streaming request whose `max_tokens` implies more than ten minutes of
   * work — `3600 * max_tokens / 128000 > 600`, i.e. anything over 21,333. Our
   * ten-scene safety ceiling is already past that. `finalMessage()` still carries
   * `parsed_output`, so structured outputs survive the switch; nothing here
   * consumes the intermediate events.
   */
  const attempt = async (correction?: string) => {
    const response = await client.messages
      .stream({
        model: config.anthropicModel,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        system: course.buildSystemPrompt(),
        messages: correction
          ? [{ role: "user", content: `${topic}\n\n前回の出力は次の理由で却下されました。同じ問題を、この点だけ直して書き直してください。\n${correction}` }]
          : [{ role: "user", content: topic }],
        output_config: { format: zodOutputFormat(apiScriptSchema) },
      })
      .finalMessage();

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Claude returned no parseable script (stop_reason: ${response.stop_reason}).`,
      );
    }

    try {
      assertScriptBudget(parsed.scenes, budget);
      assertFormulaCarry(parsed.scenes);
    } catch (error) {
      // Tagged so the retry can quote it back. An API or network failure is
      // worth another sample too, but there is nothing to tell the model.
      throw new ScriptRejection(error instanceof Error ? error.message : String(error));
    }
    return parsed;
  };

  /*
   * One retry, because the rejections above are the model's own output failing
   * a rule it can satisfy, and it samples differently each time. The whole run
   * stops here otherwise: this is before the narration and the render, so a
   * `[carry]` written the wrong way costs the entire generation.
   *
   * The second call quotes the rejection back rather than rerolling blindly —
   * `assertFormulaCarry` names every rule that failed, which is exactly what a
   * correction needs. One retry only: a rule the model cannot satisfy would
   * otherwise loop, and the second failure is the honest answer.
   */
  let parsed;
  const startedAt = Date.now();
  try {
    parsed = await attempt();
  } catch (error) {
    /*
     * Only if a second call still fits. `vercel.json` caps the function at
     * 300s and the budget in prompts/shared.ts reserves 170s of that for this
     * step, so two attempts have to share it: a first call that already took
     * longer than half would push the retry past the limit and lose the run to
     * a timeout instead of to an error message that says what went wrong.
     * Locally there is no such cap, but the same arithmetic is a fair guess at
     * how long a second sample would take.
     */
    if (Date.now() - startedAt > SCRIPT_RETRY_BUDGET_MS) {
      throw error;
    }
    parsed = await attempt(error instanceof ScriptRejection ? error.message : undefined);
  }

  return {
    // The same question, spelled consistently — see TOPIC_RULE. Falls back to
    // exactly what was typed if the model returned something else.
    topic: displayTopic(topic, parsed.topic),
    // Filled in by `runPipeline` from its own call — see generateOutline.ts.
    outline: [],
    ...classify(parsed.unit, course.units),
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
