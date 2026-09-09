import { COMMAND_READINGS, TERMS, TERM_INDICES, TERM_LETTERS } from "./mathVocabulary.js";
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
  const result = splitMathText(narration).map((part) => part.math ? mathToSpeech(part.text) : part.text).join("");
  if (/[\\$^_{}]/.test(result)) {
    throw new NarrationMathError(`narration に未変換の数式が残っています「${result}」。日本語の読みで書き直してください。`);
  }
  return result;
};

/**
 * 複合式の読みには閉じ括弧まで付けるので、既存の小問番号「かっこ1」と区別できる。
 * 実際に見つかった読みを結合キーとして返し、TTS がどこで分割しても括弧の範囲を保つ。
 */
export const structuredSpeechMatches = (source: string): { spoken: string; tex: string }[] => {
  const words = Object.entries({
    ...Object.fromEntries(Object.entries(COMMAND_READINGS).map(([command, speech]) => [speech, `\\${command} `])),
    ...Object.fromEntries(Object.entries(OPERATORS).map(([symbol, speech]) => [speech, symbol])),
    ...Object.fromEntries(Object.entries(TERMS).map(([speech, tex]) => [speech, tex.slice(1, -1)])),
  }).sort(([a], [b]) => b.length - a.length);
  const results: { spoken: string; tex: string }[] = [];
  let at = 0;
  type Atom = { tex: string; grouped?: boolean };
  const ungroup = (atom: Atom) => atom.grouped ? atom.tex.slice(1, -1) : atom.tex;
  const eat = (word: string) => {
    if (!source.startsWith(word, at)) return false;
    at += word.length;
    return true;
  };
  const atom = (): Atom | null => {
    const start = at;
    let value: Atom | null = null;
    if (eat("かっこ")) {
      const inner = expression();
      if (inner && eat("かっことじ")) value = { tex: `(${inner})`, grouped: true };
    } else if (eat("ルート")) {
      const inner = atom();
      if (inner) value = { tex: `\\sqrt{${ungroup(inner)}}` };
    } else {
      const term = Object.keys(TERMS).sort((a, b) => b.length - a.length).find((key) => source.startsWith(key, at));
      const word = words.find(([key, tex]) => source.startsWith(key, at) && !/[+\-−=<>×÷→≤≥≠]/.test(tex));
      const literal = /^(?:\d+(?:\.\d+)?|[a-zA-Z])/.exec(source.slice(at))?.[0];
      if (term) { at += term.length; value = { tex: TERMS[term].slice(1, -1) }; }
      else if (word) { at += word[0].length; value = { tex: word[1] }; }
      else if (literal) { at += literal.length; value = { tex: literal }; }
    }
    if (!value) { at = start; return null; }
    const beforePower = at;
    if (eat("の")) {
      const power = atom();
      if (power && eat("乗")) value = { tex: `${value.tex}^{${ungroup(power)}}` };
      else at = beforePower;
    }
    return value;
  };
  const product = (): Atom | null => {
    const first = atom();
    if (!first) return null;
    let tex = first.tex;
    let count = 1;
    for (let next = atom(); next; next = atom()) { tex += next.tex; count++; }
    return { tex, grouped: count === 1 && first.grouped };
  };
  const fraction = (): string | null => {
    const denominator = product();
    if (!denominator) return null;
    if (!eat("分の")) return denominator.tex;
    const numerator = product();
    return numerator ? `\\frac{${ungroup(numerator)}}{${ungroup(denominator)}}` : null;
  };
  const expression = (): string | null => {
    const sign = eat("マイナス") ? "-" : "";
    const first = fraction();
    if (!first) return null;
    let tex = sign + first;
    while (true) {
      const beforeOperator = at;
      const operator = words.find(([key, value]) => source.startsWith(key, at) && /^[+\-−=<>×÷→≤≥≠]$/.test(value));
      if (!operator) break;
      at += operator[0].length;
      const next = fraction();
      if (!next) { at = beforeOperator; break; }
      tex += operator[1] + next;
    }
    return tex;
  };
  while (at < source.length) {
    const start = at;
    const tex = expression();
    const spoken = source.slice(start, at);
    if (tex && spoken.includes("かっことじ")) results.push({ spoken, tex });
    else at = start + 1;
  }
  return results;
};
