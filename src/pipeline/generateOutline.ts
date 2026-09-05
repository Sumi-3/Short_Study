import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { OUTLINE_RULE } from "../prompts/shared.js";
import { anthropic } from "./anthropic.js";

/**
 * A separate call, because the script's schema has no room left.
 *
 * The obvious place for this was one more field on the script — the model has
 * the question in front of it there anyway. Both an array of strings and a
 * single newline-separated string came back as `400 The compiled grammar is
 * too large`: that schema is already at the ceiling, which is what forced
 * `unit` off an enum and put both curriculum levels into one field.
 *
 * So the outline is asked for on its own. Its schema is one string, the
 * question is short, and `runPipeline` starts it before the narration is
 * synthesised and collects it after the captions, so it costs no wall time.
 */
const outlineSchema = z.object({ outline: z.string() });

export const generateOutline = async (topic: string): Promise<string[]> => {
  if (!config.anthropicApiKey || !topic.trim()) {
    return [];
  }

  const response = await anthropic().messages.parse({
    model: config.anthropicModel,
    max_tokens: 1_000,
    system: `あなたは数学の問題を一覧用に要約します。\n\n${OUTLINE_RULE}`,
    messages: [{ role: "user", content: topic }],
    output_config: { format: zodOutputFormat(outlineSchema) },
  });

  return (response.parsed_output?.outline ?? "")
    .split("\n")
    .map((point) => point.trim())
    .filter(Boolean);
};
