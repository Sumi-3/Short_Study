import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { apiScriptSchema, type Script } from "../types.js";
import { mathPrompt } from "../prompts/math.js";
import { SCRIPT_MAX_TOKENS } from "../scriptBudget.js";
import type { CourseId } from "../courses.js";
import { normalizeApiScript } from "./normalizeScript.js";

/** Vercel の実行期限内にTTSの時間も残すため、再試行だけを制限する。動画の尺とは独立。 */
const SCRIPT_RETRY_BUDGET_MS = 85_000;

/**
 * system プロンプトを prompt cache に載せる。
 *
 * このプロンプトは 19,700 tokens あり、問題文以外は毎回まったく同じである。書き込みは
 * 通常入力の 1.25 倍、読み出しは 0.1 倍なので、同じプロンプトで 2 回呼べば元が取れる。
 *
 * とくに効くのが却下後の書き直しである。`attempt()` は最大 2 回走り、2 回目は必ず
 * 数十秒後に始まるので確実に読み出しになる。失敗が最も高くつく経路がそのまま
 * 最も確実に得をする経路になる。
 *
 * TTL は既定の 5 分にする。寿命はリクエストの*開始*時点から数えるため、長い生成の
 * 後では次の開始までに切れることもあるが、1 時間 TTL は書き込みが 2 倍になり、
 * 元を取るのに 3 回必要になる。1 本だけ作って終わる使い方では損になる。
 *
 * 速度はほぼ変わらない（実測 1,450ms → 1,436ms）。入れる目的は入力課金の削減である。
 */
const cachedSystem = () => [{
  type: "text" as const,
  text: mathPrompt(),
  cache_control: { type: "ephemeral" as const },
}];

/**
 * キャッシュが効いているかは usage しか教えてくれない。繰り返し呼んでも読み出しが
 * 0 のままなら、プロンプトに毎回変わるものが混ざっている。
 */
const reportUsage = (usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}) => {
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  console.log(
    `   tokens: 入力 ${usage.input_tokens} / 出力 ${usage.output_tokens}` +
    ` / cache 書込 ${write} 読出 ${read}`,
  );
};

/** モデルが守れる規則を破った台本であることを表す。 */
class ScriptRejection extends Error {}

export const generateScript = async (
  topic: string,
  courseId: CourseId = "math",
  /** 作成画面での選択。省略時は ANTHROPIC_MODEL。 */
  model: string = config.anthropicModel,
): Promise<Script> => {
  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const client = anthropic();

  // 大きい応答はSDKが非ストリーミング要求を拒否するため、構造化出力もstreamで受け取る。
  const attempt = async (correction?: string) => {
    const response = await client.messages
      .stream({
        model,
        max_tokens: SCRIPT_MAX_TOKENS,
        // opus-5 で思考量を決めるのは thinking ではなく output_config.effort。
        // `thinking: { type: "enabled", budget_tokens }` はこのモデルでは 400 になる。
        thinking: { type: "adaptive" },
        system: cachedSystem(),
        messages: correction
          ? [{ role: "user", content: `${topic}\n\n前回の出力は次の理由で却下されました。同じ問題を、この点だけ直して書き直してください。\n${correction}` }]
          : [{ role: "user", content: topic }],
        output_config: {
          effort: config.scriptEffort,
          format: zodOutputFormat(apiScriptSchema),
        },
      }, { timeout: config.scriptTimeoutMs })
      .finalMessage();

    reportUsage(response.usage);

    const parsed = response.parsed_output;
    if (!parsed || response.stop_reason === "max_tokens") {
      throw new Error(
        `Claude returned no parseable script (stop_reason: ${response.stop_reason}).`,
      );
    }

    try {
      return normalizeApiScript(parsed, topic, courseId, model);
    } catch (error) {
      // 再試行でこの理由を引用できるよう印を付ける。API やネットワークの失敗も再試行には
      // 値するが、モデルへ伝える内容はない。
      throw new ScriptRejection(error instanceof Error ? error.message : String(error));
    }
  };

  /*
   * 再試行は 1 回だけにする。上の却下はモデル自身の出力が守れる規則に失敗したもので、
   * 毎回サンプルが異なるからである。ここで止めないと、ナレーションとレンダリングの前なので、
   * 却下された台本が生成全体を無駄にしてしまう。
   *
   * 2 回目は闇雲に引き直さず却下理由を引用する。却下は失敗した規則をすべて示すため、修正に
   * 必要な情報そのものである。再試行を 1 回に限るのは、守れない規則なら
   * ループしてしまい、2 回目の失敗こそ正直な結果だからである。
   */
  let parsed;
  const startedAt = Date.now();
  try {
    parsed = await attempt();
  } catch (error) {
    // ローカルでは長い台本にも修正の機会を残す。デプロイ時だけ関数の実行期限を考慮する。
    if (process.env.VERCEL && Date.now() - startedAt > SCRIPT_RETRY_BUDGET_MS) {
      throw error;
    }
    parsed = await attempt(error instanceof ScriptRejection ? error.message : undefined);
  }

  return parsed;
};
