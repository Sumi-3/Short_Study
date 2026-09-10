import { COMMAND_READINGS, TERM_INDICES, TERM_LETTERS } from "./mathVocabulary.js";
import { splitNarration } from "./narration.js";
import { splitMathText } from "./mathText.js";

/** 変換不能な式を読み飛ばすと音声が誤った説明になるため、再生成できる段階で止める。 */
export class NarrationMathError extends Error {}

const reverse = (map: Record<string, string>, value: string) =>
  Object.entries(map).find(([, written]) => written === value)?.[0];
const OPERATORS: Record<string, string> = {
  "+": "たす", "-": "マイナス", "−": "マイナス", "=": "イコール",
  "*": "かける", "×": "かける", "/": "わる", "÷": "わる",
  "<": "小なり", ">": "大なり", "≤": "以下", "≥": "以上", "≠": "ノットイコール",
  "→": "矢印", "∞": "無限大", "θ": "シータ", "π": "パイ",
};

type Reading = { speech: string; source: string; simple: boolean };
const grouped = (value: Reading) => value.simple
  ? value.speech : `かっこ${value.speech}かっことじ`;

/** 括弧の深さを読んでから語順を変える。正規表現の置換だけでは入れ子の分数を逆転できない。 */
export const mathToSpeech = (tex: string): string => {
  let at = 0;
  const fail = (): never => { throw new NarrationMathError(`読みへ変換できない数式「${tex}」。narration は数式を使わず日本語の読みで書いてください。`); };
  const space = () => { while (/\s/.test(tex[at] ?? "")) at++; };
  const continuesProduct = () => /^[a-zA-Z0-9.\\]/.test(tex.slice(at).trimStart());
  const expression = (close?: string): Reading => {
    const start = at;
    const values: Reading[] = [];
    while (at < tex.length) {
      space();
      if (close && tex[at] === close) break;
      if (at === tex.length) break;
      values.push(atom());
    }
    const source = tex.slice(start, at).replace(/\s/g, "");
    return { speech: values.map((v) => v.speech).join(""), source,
      simple: values.length === 1 && /^(?:\d+|[a-zA-Z]|\\[a-zA-Z]+)$/.test(source) };
  };
  const argument = (): Reading => {
    space();
    if (tex[at] !== "{") return atom(false);
    at++;
    const result = expression("}");
    if (tex[at++] !== "}" || !result.speech) return fail();
    return result;
  };
  const atom = (scripts = true): Reading => {
    space();
    const start = at;
    const char = tex[at++];
    let speech: string;
    let simple = true;
    if (char === "\\") {
      const command = /^[a-zA-Z]+/.exec(tex.slice(at))?.[0];
      if (!command) return fail();
      at += command.length;
      if (["left", "right", "displaystyle", "textstyle", "quad", "qquad"].includes(command)) {
        return { speech: "", source: tex.slice(start, at), simple: true };
      }
      if (command === "sqrt") {
        space();
        if (tex[at] === "[") return fail();
        const value = argument();
        // 根号の直後の積や小数を字幕が根号の中へ飲み込まないよう、境界の曖昧な読みは括弧で示す。
        speech = `ルート${grouped({ ...value, simple: value.simple && !continuesProduct() })}`;
      } else if (["frac", "dfrac", "tfrac"].includes(command)) {
        const numerator = argument();
        const denominator = argument();
        // 積を含む分子も括弧で範囲を明示する。3√19 のような既存の読みは保つ。
        const num = /^\d*\\sqrt\{(?:\d+|[a-zA-Z])\}$/.test(numerator.source)
          ? numerator.speech : grouped(numerator);
        speech = `${grouped(denominator)}分の${num}`;
        if (continuesProduct()) speech = `かっこ${speech}かっことじ`;
        simple = false;
      } else if (["mathrm", "mathit", "mathbf", "text", "operatorname"].includes(command)) {
        const value = argument();
        speech = value.speech;
        simple = value.simple;
      } else {
        speech = COMMAND_READINGS[command] ?? fail();
      }
    } else if (char === "{") {
      const value = expression("}");
      if (tex[at++] !== "}") return fail();
      speech = value.speech;
      simple = value.simple;
    } else if (char === "(" || char === "[") {
      const value = expression(char === "(" ? ")" : "]");
      if (tex[at++] !== (char === "(" ? ")" : "]")) return fail();
      speech = `かっこ${value.speech}かっことじ`;
    } else if (char && /[a-zA-Z0-9.]/.test(char)) {
      speech = char;
      if (scripts && /[0-9]/.test(char)) {
        const rest = /^[0-9]*(?:\.[0-9]+)?/.exec(tex.slice(at))![0];
        speech += rest;
        at += rest.length;
      }
    } else if (OPERATORS[char]) speech = OPERATORS[char];
    else return fail();

    if (scripts) {
      space();
      // 添字はカナのリテラル表と対応させ、a_n を「案」と読ませない。
      if (tex[at] === "_") {
        const base = tex.slice(start, at).trim();
        at++;
        const index = argument();
        const letter = reverse(TERM_LETTERS, base);
        const kana = reverse(TERM_INDICES, index.source);
        if (!letter || !kana) return fail();
        speech = letter + kana;
      }
      space();
      if (tex[at] === "^") {
        at++;
        const power = argument();
        speech = `${simple ? speech : `かっこ${speech}かっことじ`}の${grouped(power)}乗`;
      }
    }
    return { speech, simple, source: tex.slice(start, at).trim() };
  };
  const result = expression();
  if (!result.speech || /[\\$^_{}]/.test(result.speech)) return fail();
  return result.speech;
};

export const normalizeNarration = (narration: string): string => {
  const { display, reading } = splitNarration(narration);
  // 旧台本の数式読み下しは保ち、新形式はモデルが書いた読みだけを検査する。
  const result = display !== null ? reading : splitMathText(reading).map((part) => part.math ? mathToSpeech(part.text) : part.text).join("");
  if (/[\\$^_{}]/.test(result)) {
    throw new NarrationMathError(`narration の読み用文章に未変換の数式が残っています「${result}」。日本語の読みで書き直してください。`);
  }
  return result;
};
