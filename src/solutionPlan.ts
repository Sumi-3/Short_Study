import { splitMathText } from "./mathText.js";

const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";

export const stepNumber = (number: number) => CIRCLED_NUMBERS[number - 1] ?? `${number}.`;

export const parsePlanStep = (value: string) => {
  const trimmed = value.trim();
  const circled = CIRCLED_NUMBERS.indexOf(trimmed[0]);
  const numeric = /^(\d+)\.\s+/.exec(trimmed);
  const number = circled >= 0 ? circled + 1 : numeric ? Number(numeric[1]) : 0;
  const text = trimmed.slice(circled >= 0 ? 1 : numeric?.[0].length ?? 0).trim();
  return number > 0 && text ? { number, text } : null;
};

/**
 * 方針シーンのタイトルを、その設問の番号へ戻す。方針シーンでなければ null。
 *
 * 単問には設問番号が無く、タイトルも「方針」だけになる。番号のある設問と区別できるよう
 * 空文字を返す。null と紛れないよう、呼び出し側は `!== null` で判定する。
 */
export const solutionPlanNumber = (title: string) => {
  const trimmed = title.trim();
  if (trimmed === "方針") return "";
  return /^\(([0-9]+)\)の方針$/.exec(trimmed)?.[1] ?? null;
};

/** 却下理由の文面。単問の方針には設問番号が無い。 */
const planLabel = (number: string) => (number ? `(${number})の方針` : "方針");

type PlanScene = {
  visual_type: string;
  visual_kind: string;
  visual_content: string;
  visual_items: string[];
};

/** 数式内の f(1) や座標を設問に数えず、入力と整形済み topic の両方で問いの脱落を調べる。 */
const questionNumbers = (topic: string) => {
  // 裸の「(1) x^2=1」は組版の推測では1つの数式になる。明示された数式だけを除外して番号を保つ。
  const prose = splitMathText(topic).map((part) =>
    part.math && /^(\$|\\[([])/.test(topic.slice(part.start)) ? " " : part.text,
  ).join("");
  return [...new Set(Array.from(
    prose.matchAll(/(?:^|[\s。．.：:、])[(（]([0-9０-９]+)[)）]/g),
    (match) => match[1].normalize("NFKC"),
  ))];
};

/**
 * 新規生成だけを検証する。既存の文字列チャネルで対応を表せば API の19フィールドを保て、
 * 方針を持たない旧 manifest は再生成も移行もせず再生できる。
 *
 * 単問にも方針シーンを求めるのはプロンプトの役目で、ここではしない。シーンは「問題」と
 * 「概念の説明」を区別する印を持たず、概念の動画に方針は無い。取り違えれば正しい台本を
 * 却下して数分かけて引き直させるので、方針が無い単問はここを素通りさせ、
 * 置かれていれば下の構成をすべて検証する。
 */
export const assertSolutionPlans = (scenes: readonly PlanScene[], topic: string, input = topic) => {
  const written = questionNumbers(topic);
  const original = questionNumbers(input);
  const expected = original.length >= 2 ? original : written;
  const planned = scenes.filter((scene) => solutionPlanNumber(scene.visual_content) !== null);
  if (expected.length < 2 && !planned.length) return;
  /** 設問が2つ以上あるときだけ、方針の順番を設問番号と突き合わせられる。 */
  const numbered = expected.length >= 2;

  const reject = (index: number, reason: string): never => {
    throw new Error(`シーン${index + 1}の構成: ${reason}`);
  };
  if (scenes[0]?.visual_type !== "hook") reject(0, "最初に問題文のhookを置いてください。");

  const completed: string[] = [];
  let active: { number: string; items: string[]; step: number } | undefined;
  let summarizing = false;
  const finish = (index: number) => {
    if (active && active.step !== active.items.length - 1) {
      reject(index, `「${planLabel(active.number)}」をすべて順に解説してから次の設問やまとめへ進んでください。`);
    }
  };

  for (const [index, scene] of scenes.entries()) {
    if (index === 0) continue;
    const number = solutionPlanNumber(scene.visual_content);
    if (number !== null) {
      finish(index);
      if (summarizing || scene.visual_type !== "point" || scene.visual_kind !== "bullets") {
        reject(index, "各設問の解説前に独立したpoint / bulletsの方針シーンを置いてください。");
      }
      if (!numbered && completed.length) {
        reject(index, "設問が1つの動画に方針シーンは1つだけです。");
      }
      if (completed.includes(number) || (numbered && number !== expected[completed.length])) {
        reject(index, `方針は設問の順番どおりに1回ずつ置いてください（次は(${expected[completed.length] ?? "未解説の設問"})）。`);
      }
      if (!scene.visual_items.length || scene.visual_items.some((item, step) => parsePlanStep(item)?.number !== step + 1)) {
        reject(index, "方針のvisual_itemsには①から順に番号と具体的な操作を書いてください。項目数は可変です。");
      }
      active = { number, items: scene.visual_items, step: -1 };
      completed.push(number);
    } else if (scene.visual_type === "summary") {
      if (!active) reject(index, "まとめの前に各設問の方針と解説が必要です。");
      finish(index);
      summarizing = true;
    } else {
      if (!active || summarizing || scene.visual_type !== "point") {
        reject(index, "問題文の直後に「方針」（2問以上なら「(番号)の方針」）のbulletsシーンが必要です。");
      }
      const plan = active!;
      const step = plan.items.indexOf(scene.visual_content);
      if (step < 0 || (step !== plan.step && step !== plan.step + 1)) {
        reject(index, `解説タイトルは「${planLabel(plan.number)}」の項目を番号・文言ごと完全に写し、①から順に使ってください。同じ項目の続きでも空にしないでください。`);
      }
      plan.step = step;
    }
  }
  finish(scenes.length - 1);
  if (numbered && expected.some((number, index) => completed[index] !== number)) {
    reject(scenes.length - 1, `全設問 ${expected.map((number) => `(${number})`).join("、")} に方針と解説を用意してください。`);
  }
  if (!summarizing) reject(scenes.length - 1, "全設問の解説後に答えを振り返るsummaryを置いてください。");
};
