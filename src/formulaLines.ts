/**
 * 6 行あれば縦型ステージで理由付きの式を 3 本置け、補助行は図の余地を残すため 2 行にする。
 * これは高さの推定ではなく執筆上限であり、renderer は実際に組版したブロックを収める。
 * 型と強調を接頭辞に収めれば 20 個目の API シーンフィールドを避けられる。このプロジェクトでは
 * それが構造化出力の grammar 上限を超えていた。
 */
import { normalizeMathText, splitMathText } from "./mathText.js";

export const FORMULA_MAX_LINES = 6;
export const COMPANION_MAX_LINES = 2;

export type FormulaAnnotation =
  | "carry" | "box" | "underline" | "circle" | "highlight" | "strike" | "bracket" | "plain";

/**
 * 型マーカー、装飾、代入を各 1 つ、任意の順で受け付ける。代入ラベルは ] で終わるため、
 * 数式本文の角括弧を食べない。ラベルは通常の文章とし、入れ子の角括弧は数式側に属する。
 * 未知または重複の接頭辞は本文として残すので、普通の角括弧付き LaTeX を失わない。
 * マーカーだけの空行には、従来のエラー耐性のあるフォールバックを保つ。
 */
export const parseFormulaLine = (line: string): {
  latex: string;
  annotation: FormulaAnnotation | null;
  text: boolean;
  substitution?: string;
} => {
  let body = line;
  let text = false;
  let annotation: FormulaAnnotation | null = null;
  let substitution: string | undefined;
  for (let i = 0; i < 3; i++) {
    const step = /^\s*\[substitute:\s*([^\[\]\r\n]+)\]\s*([\s\S]*)$/.exec(body);
    if (step) {
      if (substitution !== undefined || !step[1].trim()) break;
      substitution = step[1].trim();
      body = step[2];
      continue;
    }
    const match = /^\s*\[(text|carry|box|underline|circle|highlight|strike|bracket|plain)\]\s*([\s\S]*)$/.exec(body);
    if (!match) break;
    if (match[1] === "text") {
      if (text) break;
      text = true;
    } else {
      if (annotation !== null) break;
      annotation = match[1] as FormulaAnnotation;
    }
    body = match[2];
  }
  // 代入矢印は新しい式に属し、文章行や持ち越した前提には使えない。無効な入力を黙って失わず保つ。
  if (substitution && (text || annotation === "carry")) {
    return { latex: line, annotation: null, text: false };
  }
  return body.trim()
    ? { latex: text || annotation || substitution ? body.trim() : line, annotation, text,
      ...(substitution ? { substitution } : {}) }
    : { latex: line, annotation: null, text: false };
};

/** 式専用行は裸の TeX が保存形式。本文と代入理由だけを $…$ にし、マーカーは解析前に壊さない。 */
export const normalizeFormulaLine = (line: string): string => {
  const parsed = parseFormulaLine(line);
  const start = line.lastIndexOf(parsed.latex);
  const prefix = line.slice(0, start).replace(/(\[substitute:\s*)([^\[\]\r\n]+)(\])/g,
    (_, open, reason: string, close) => open + normalizeMathText(reason.trim()) + close);
  const body = parsed.text ? normalizeMathText(parsed.latex)
    : splitMathText(parsed.latex, true).map((part) => part.math
      ? part.text : parsed.latex.slice(part.start, part.end)).join("");
  return prefix + body;
};

/**
 * `[carry]` の行を落とす。
 *
 * 「前の式」の淡い再掲はもう作らない。`FormulaRun` が連続する formula シーンをひとつの舞台へ
 * まとめるようになってからは舞台が切れず、再掲は同じ式が二度並ぶだけになっていた。印は台本の
 * 規則からも外したが、既存 manifest には書かれた行が残っている。マーカーが本文へ漏れないよう
 * 構文としては読み続け、行ごと落とす。
 */
export const withoutCarry = (lines: readonly string[]): string[] =>
  lines.filter((line) => parseFormulaLine(line).annotation !== "carry");
