import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { EXTRACT_PROBLEM_RULE } from "../prompts/extractProblem.js";
import { anthropic } from "./anthropic.js";

/** JPEG 本文は 2.4 MB までにし、base64 を含む JSON でも Vercel の 4.5 MB 制限を下回らせる。 */
export const MAX_EXTRACT_IMAGE_BYTES = 2_400_000;
export const MAX_EXTRACT_IMAGE_BASE64_LENGTH = Math.ceil(MAX_EXTRACT_IMAGE_BYTES / 3) * 4;

const extractionSchema = z.object({ text: z.string() });

export const isExtractImage = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_EXTRACT_IMAGE_BASE64_LENGTH &&
  value.length % 4 === 0 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(value);

export const extractProblem = async (
  image: string,
  model: string = config.anthropicModel,
): Promise<string> => {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!isExtractImage(image)) {
    throw new Error("invalid JPEG image");
  }

  const response = await anthropic().messages.parse({
    model,
    max_tokens: 2_000,
    // 単独呼び出しも既存の outline と同じく、固定規則を system 側に置く形式にそろえる。
    system: [{ type: "text", text: EXTRACT_PROBLEM_RULE, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: "この画像から問題文を転記してください。" },
      ],
    }],
    output_config: { format: zodOutputFormat(extractionSchema) },
  }, { timeout: config.extractTimeoutMs });

  return (response.parsed_output?.text ?? "").trim();
};
