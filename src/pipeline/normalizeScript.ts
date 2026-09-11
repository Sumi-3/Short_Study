import { z } from "zod/v4";
import { COURSES, type CourseId } from "../courses.js";
import { assertFormulaCarry } from "../formulaLines.js";
import { normalizeMathText } from "../mathText.js";
import { normalizeNarration } from "../mathSpeech.js";
import { NARRATION_SEPARATOR, splitNarration } from "../narration.js";
import { MATH_UNIT_NAMES, topicsOf } from "../curriculum.js";
import {
  apiScriptSchema,
  normalizeVisual,
  normalizeVisualText,
  scriptSchema,
  type ApiScript,
  type Script,
} from "../types.js";
import { assertSolutionPlans } from "../solutionPlan.js";

/**
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

/**
 * 単元ラベルをカリキュラム内に保つ。完全一致は通し、近い表記
 * ("数I 図形と計量（余弦定理）") は正規名へ戻す。でたらめな単元を表示するより
 * ない方がよいため、認識できないものは捨てる。
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

/**
 * API の grammar は 19 フィールドを超えられないため outline を含めない。手書きの
 * draft だけは別 API 呼び出しなしでカードを作れるよう、このローカル入口で任意に受ける。
 */
const apiScriptDraftSchema = apiScriptSchema.extend({
  outline: z.array(z.string()).optional(),
});

/** API が返した平坦なシーンを、描画用の台本へそろえる唯一の入口。 */
export const normalizeApiScript = (
  parsed: ApiScript,
  topic: string,
  courseId: CourseId,
  model: string,
  outline: string[] = [],
): Script => {
  const course = COURSES[courseId];
  const scenes = parsed.scenes.map((scene, index) => {
    try {
      const { display } = splitNarration(scene.narration);
      const reading = normalizeNarration(scene.narration);
      const narration = display === null
        ? reading
        : `${display}\n${NARRATION_SEPARATOR}\n${reading}`;
      return { ...normalizeVisualText(scene), narration };
    } catch (error) {
      throw new Error(`シーン${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  assertSolutionPlans(scenes, parsed.topic, topic);
  assertFormulaCarry(scenes);

  return {
    // 同じ問題を一貫した表記にする（TOPIC_RULE 参照）。モデルが別のものを返せば、入力どおりへ戻す。
    topic: normalizeMathText(displayTopic(topic, parsed.topic)),
    model,
    outline,
    ...classify(parsed.unit, MATH_UNIT_NAMES),
    course: course.id,
    // 教科が固定されたコースでは選択を既にモデルへ伝えているので両者は一致する。回答が必要なのは
    // `general` の場合である。
    subject: course.subject ?? parsed.subject,
    scenes: scenes.map((scene, index) => ({
      scene_id: index + 1,
      narration: scene.narration,
      visual_type: scene.visual_type,
      visual_content: scene.visual_content,
      visual: normalizeVisual(scene),
    })),
  };
};

const apiSceneFields = [
  "visual_kind",
  "visual_items",
  "visual_bars",
  "visual_unit",
  "visual_caption",
  "visual_curves",
  "visual_range",
  "visual_shade",
  "visual_points",
  "visual_segments",
  "visual_angles",
  "visual_circles",
  "visual_highlight",
  "visual_values",
  "visual_table",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 平坦な `visual_*` は API 形だけの印にする。これがある壊れた draft を旧形式として
 * 読むと、Zod が未知キーを落として誤った動画を作れてしまうため、API 側の理由を返す。
 */
const looksLikeApiScript = (value: unknown) =>
  isRecord(value) && Array.isArray(value.scenes) && value.scenes.some(
    (scene) => isRecord(scene) && apiSceneFields.some((field) => field in scene),
  );

const formatIssues = (error: z.ZodError) =>
  error.issues.map((issue) =>
    `${issue.path.length ? issue.path.join(".") : "トップレベル"}: ${issue.message}`,
  ).join("／");

/**
 * `--script` の入力を読む。明確な API 形は失敗時にも旧形式へ黙って落とさず、作者が
 * プロンプトの 19 フィールドを直せるようにする。印のない壊れた JSON は両方の失敗を示す。
 */
export const parseScriptDraft = (
  value: unknown,
  topic: string,
  courseId: CourseId,
): Script => {
  const api = apiScriptDraftSchema.safeParse(value);
  if (api.success) {
    // `--script` の API 形は人が執筆したものなので、API モデル名を記録するとライブラリで
    // 作成元を取り違える。保存済みの正規化台本は下の旧経路で model をそのまま保つ。
    return normalizeApiScript(api.data, topic, courseId, "handwritten", api.data.outline ?? []);
  }

  const script = scriptSchema.safeParse(value);
  if (script.success) {
    if (!looksLikeApiScript(value)) {
      return script.data;
    }
    throw new Error(`台本JSONを apiScriptSchema 形式として読めません: ${formatIssues(api.error)}`);
  }

  if (looksLikeApiScript(value)) {
    throw new Error(`台本JSONを apiScriptSchema 形式として読めません: ${formatIssues(api.error)}`);
  }

  throw new Error(
    "台本JSONは apiScriptSchema 形式でも scriptSchema 形式でもありません。\n" +
    `apiScriptSchema: ${formatIssues(api.error)}\n` +
    `scriptSchema: ${formatIssues(script.error)}`,
  );
};
