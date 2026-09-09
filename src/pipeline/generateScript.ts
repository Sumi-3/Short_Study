import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { apiScriptSchema, normalizeVisual, type Script } from "../types.js";
import { COURSES } from "../courses.js";
import { mathPrompt } from "../prompts/math.js";
import { assertScriptBudget, budgetFor, scriptMaxTokens } from "../scriptBudget.js";
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
 * モデルが返す 1 本の `unit` 文字列を 2 階層へ戻す。
 *
 * バナーに出すのは中分類で、小分類はホーム画面で short を分類するためだけにある。したがって
 * 認識できない小分類は表示せず捨てる。
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

/** 300s 上限内で scriptBudget.ts がこの工程に確保する 170s の半分。 */
const SCRIPT_RETRY_BUDGET_MS = 85_000;

/** モデルが守れる規則を破った台本であることを表す。 */
class ScriptRejection extends Error {}

export const generateScript = async (
  topic: string,
  courseId: CourseId = "math",
): Promise<Script> => {
  const course = COURSES[courseId];

  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const client = anthropic();

  /*
   * adaptive thinking もここから消費するため、上限はシーン数に連動させる必要がある。
   *
   * 完成シーンの JSON は 275–560 文字なので、1 シーン 1,500 tokens は余裕があり、
   * 固定の 12,000 は thinking の余白になる。旧来の固定 16,000 では長い台本がシーン途中で
   * 止まり、解析不能な `stop_reason: max_tokens` として返っていた。
   *
   * 実際のシーン数も同じ呼び出しでモデルが決めるため、許容する最大台本に合わせて確保する。
   * 到達しない 64k の clamp は不要で、10 シーンには adaptive thinking を含めても
   * 12,000 + 10 * 1,500 = 27,000 tokens で足りる。
   */
  const budget = budgetFor();
  const maxTokens = scriptMaxTokens(budget);

  /*
   * 通常の `.parse()` ではなく stream を使う。SDK は `max_tokens` から 10 分超の処理を
   * 見込む非ストリーミング要求を拒否するためで、`3600 * max_tokens / 128000 > 600`、すなわち
   * 21,333 超が該当する。10 シーンの安全上限は既にこれを超える。`finalMessage()` にも
   * `parsed_output` は残るため構造化出力は維持でき、ここで中間イベントは消費しない。
   */
  const attempt = async (correction?: string) => {
    const response = await client.messages
      .stream({
        model: config.anthropicModel,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        system: mathPrompt(),
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
    /*
     * 2 回目がまだ収まる場合だけ実行する。`vercel.json` は関数を 300s に制限し、
     * scriptBudget.ts はそのうち 170s をこの工程へ確保するので、2 回で共有しなければならない。
     * 1 回目が半分を超えていれば、再試行は上限を越えて原因を示すエラーではなく timeout で
     * 実行を失わせる。ローカルにはこの上限がないが、同じ計算は 2 回目の所要時間の妥当な推定になる。
     */
    if (Date.now() - startedAt > SCRIPT_RETRY_BUDGET_MS) {
      throw error;
    }
    parsed = await attempt(error instanceof ScriptRejection ? error.message : undefined);
  }

  return {
    // 同じ問題を一貫した表記にする（TOPIC_RULE 参照）。モデルが別のものを返せば、入力どおりへ戻す。
    topic: displayTopic(topic, parsed.topic),
    // `runPipeline` が独自の呼び出しから埋める（generateOutline.ts 参照）。
    outline: [],
    ...classify(parsed.unit, MATH_UNIT_NAMES),
    course: course.id,
    // 教科が固定されたコースでは選択を既にモデルへ伝えているので両者は一致する。回答が必要なのは
    // `general` の場合である。
    subject: course.subject ?? parsed.subject,
    scenes: parsed.scenes.map((scene, index) => ({
      scene_id: index + 1,
      // 画面用の $ が narration に紛れると TTS が読み上げ、字幕にも出る。規則で禁じたうえで、
      // 混じったものは黙って外す。$y$ → y と読めば意味は変わらない。
      narration: scene.narration.replace(/\$/g, ""),
      visual_type: scene.visual_type,
      visual_content: scene.visual_content,
      visual: normalizeVisual(scene),
    })),
  };
};
