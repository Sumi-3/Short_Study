import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { OUTLINE_RULE } from "../prompts/outline.js";
import { anthropic } from "./anthropic.js";
import { normalizeMathText } from "../mathText.js";

/**
 * 台本のスキーマに余地がないため、別の呼び出しにする。
 *
 * 本来なら台本にフィールドを 1 つ足すのが自然で、そこではモデルも既に問題を見ている。だが文字列
 * 配列でも改行区切りの単一文字列でも `400 The compiled grammar is too large` が返った。この
 * スキーマは既に上限であり、`unit` を enum から外しカリキュラムの 2 階層を 1 field に入れたのも
 * 同じ理由である。
 *
 * そのため outline は単独で要求する。スキーマは 1 文字列で問題も短く、`runPipeline` は narration
 * synthesis 前に始め captions 後に回収するため、実時間の負担はない。
 */
const outlineSchema = z.object({ outline: z.string() });

export const generateOutline = async (
  topic: string,
  /** 台本と同じモデルで揃える。比較のとき片方だけ別モデルでは条件が揃わない。 */
  model: string = config.anthropicModel,
): Promise<string[]> => {
  if (!config.anthropicApiKey || !topic.trim()) {
    return [];
  }

  const response = await anthropic().messages.parse({
    model,
    // 完全な条件と複数の問いには、一覧の要約より広い余地が必要である。
    max_tokens: 2_000,
    // 台本と同じく prompt cache に載せる。1,321 tokens で最小サイズを満たすことを
    // 実測で確認済み（下回ると黙ってキャッシュされない）。問題文以外は毎回同じである。
    system: [{
      type: "text",
      text: `あなたは数学の問題を、条件とすべての問いを保って画面用に整えます。\n\n${OUTLINE_RULE}`,
      cache_control: { type: "ephemeral" },
    }],
    messages: [{ role: "user", content: topic }],
    output_config: { format: zodOutputFormat(outlineSchema) },
  }, { timeout: config.outlineTimeoutMs });

  return (response.parsed_output?.outline ?? "")
    .split("\n")
    .map((point) => normalizeMathText(point.trim()))
    .filter(Boolean);
};
