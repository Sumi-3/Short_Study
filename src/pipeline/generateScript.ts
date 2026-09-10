import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { apiScriptSchema, normalizeVisual, normalizeVisualText, type Script } from "../types.js";
import { normalizeMathText } from "../mathText.js";
import { normalizeNarration } from "../mathSpeech.js";
import { NARRATION_SEPARATOR, splitNarration } from "../narration.js";
import { COURSES } from "../courses.js";
import { mathPrompt } from "../prompts/math.js";
import { SCRIPT_MAX_TOKENS } from "../scriptBudget.js";
import { assertSolutionPlans } from "../solutionPlan.js";
import { assertFormulaCarry } from "../formulaLines.js";
import { MATH_UNIT_NAMES, topicsOf } from "../curriculum.js";
import type { CourseId } from "../courses.js";

/**
 * 単元ラベルをカリキュラム内に保つ。完全一致は通し、近い表記
 * ("数I 図形と計量（余弦定理）") は正規名へ戻す。でたらめな単元を表示するより
 * ない方がよいため、認識できないものは捨てる。
 */
/**
 * モデルが書き戻した問題文。
 *
 * `topic` は冒頭フレーム、ホーム画面のカード、ライブラリという動画全体の基準であり、
 * TOPIC_RULE は Web ページから貼った文字列を組版済みの形へ変える規則である。よって
 * 配信するのはモデル版で、入力文字列は空の返答に対するフォールバックに限る。
 *
 * 以前は全数字が順に残った場合だけモデル表記を使い、それ以外では生入力を返していた。
 * しかし「設問」の見出しを落とす、`1.` を `(1)` に振り直すといった普通で正しい編集でも
 * このガードが発火し、そのたび規則が整えるためにある元の乱れを画面に戻してしまっていた。
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
 * 5 段階の難易度。範囲外・非数値は未判定として 0 に落とす。
 *
 * 判定できなかったことを 1 と偽らない。0 は星を出さないという意味であり、
 * 記録導入前に作った short と同じ扱いになる。
 */
const rank = (written: string) => {
  const value = Number.parseInt(written.trim(), 10);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
};

/**
 * モデルが返す 1 本の `unit` 文字列を、2 階層と難易度へ戻す。
 *
 * バナーに出すのは中分類と難易度で、小分類はホーム画面で short を分類するためだけに
 * ある。したがって認識できない小分類は表示せず捨てる。
 */
const classify = (written: string, allowed: readonly string[] | null) => {
  const [rawUnit = "", rawSubunit = "", rawRank = ""] = written.split("｜");
  const unit = resolveUnit(rawUnit, allowed);
  const topics = topicsOf(unit);
  const subunit = rawSubunit.trim();
  const difficulty = rank(rawRank);

  if (!topics || !subunit) {
    return { unit, subunit: "", difficulty };
  }

  return {
    unit,
    difficulty,
    subunit:
      topics.find((topic) => topic === subunit) ??
      topics.find(
        (topic) => topic.startsWith(subunit) || subunit.startsWith(topic),
      ) ??
      "",
  };
};

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
  const course = COURSES[courseId];

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
      parsed.scenes = parsed.scenes.map((scene, index) => {
        try {
          const { display } = splitNarration(scene.narration);
          const reading = normalizeNarration(scene.narration);
          const narration = display === null ? reading : `${display}\n${NARRATION_SEPARATOR}\n${reading}`;
          return { ...normalizeVisualText(scene), narration };
        } catch (error) {
          throw new Error(`シーン${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
      assertSolutionPlans(parsed.scenes, parsed.topic, topic);
      assertFormulaCarry(parsed.scenes);
    } catch (error) {
      // 再試行でこの理由を引用できるよう印を付ける。API やネットワークの失敗も再試行には
      // 値するが、モデルへ伝える内容はない。
      throw new ScriptRejection(error instanceof Error ? error.message : String(error));
    }
    return parsed;
  };

  /*
   * 再試行は 1 回だけにする。上の却下はモデル自身の出力が守れる規則に失敗したもので、
   * 毎回サンプルが異なるからである。ここで止めないと、ナレーションとレンダリングの前なので、
   * 誤った `[carry]` が生成全体を無駄にしてしまう。
   *
   * 2 回目は闇雲に引き直さず却下理由を引用する。`assertFormulaCarry` は失敗した規則をすべて
   * 示すため、修正に必要な情報そのものである。再試行を 1 回に限るのは、守れない規則なら
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

  return {
    // 同じ問題を一貫した表記にする（TOPIC_RULE 参照）。モデルが別のものを返せば、入力どおりへ戻す。
    topic: normalizeMathText(displayTopic(topic, parsed.topic)),
    model,
    // `runPipeline` が独自の呼び出しから埋める（generateOutline.ts 参照）。
    outline: [],
    ...classify(parsed.unit, MATH_UNIT_NAMES),
    course: course.id,
    // 教科が固定されたコースでは選択を既にモデルへ伝えているので両者は一致する。回答が必要なのは
    // `general` の場合である。
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
