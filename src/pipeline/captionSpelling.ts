import type { Caption } from "@remotion/captions";

/**
 * Rewrites caption tokens into the notation a reader expects.
 *
 * The narration has to be spelled the way the synthesiser reads it: measured
 * against ja-JP-NanamiNeural, `=` is silent and `cos` comes out spelled as
 * シーオーエス. So the script says イコール and コサイン, and the captions —
 * the same words read rather than heard — are put back into mathematical
 * notation here. Timings are untouched.
 */

/**
 * Powers, written the way a textbook writes them rather than as superscripts.
 *
 * These used to become ², and it was wrong in a way only real captions showed:
 * 「両辺を2乗するのが鍵です」 came out as 「両辺を²するのが鍵です」. 「2乗する」 is a
 * verb — the exponent is a thing you do to both sides, not a superscript on
 * anything — and a substitution that cannot tell the two apart has to give up
 * the superscript. 「2乗」 reads correctly in both positions.
 *
 * What is left to do here is normalise the spelling: the narration says
 * 「にじょう」 because that is what the synthesiser reads correctly, whisper
 * writes it either way, and the digit form is what the rest of the script uses.
 */
const POWERS: Record<string, string> = {
  にじょう: "2乗",
  さんじょう: "3乗",
  よんじょう: "4乗",
  二乗: "2乗",
  三乗: "3乗",
  四乗: "4乗",
};

/**
 * Sequence terms, spelled the way the narration has to say them.
 *
 * `a_n` comes back from the synthesiser as 「a アンダーライン n」 — it reads the
 * underscore out loud — and closing it up to `an` is heard as 「案」. Both
 * measured. So the narration spells the term in kana and the subscript is put
 * back here, in the Unicode subscripts, which is as close to typeset as a
 * caption gets.
 */
const TERM_LETTERS: Record<string, string> = {
  エー: "a",
  ビー: "b",
  シー: "c",
  ディー: "d",
  エス: "S",
  ティー: "T",
  ピー: "P",
};

const TERM_INDICES: Record<string, string> = {
  エヌ: "\u2099",
  ケー: "\u2096",
  エム: "\u2098",
  イチ: "\u2081",
  ニ: "\u2082",
  サン: "\u2083",
  ヨン: "\u2084",
  // The shifted term a_{n+1} is half of what a recurrence says, and the index
  // has to be taken whole: converting the `エーエヌ` in front of it first would
  // leave the 「プラスイチ」 stranded outside the subscript.
  エヌプラスイチ: "\u2099\u208a\u2081",
  エヌマイナスイチ: "\u2099\u208b\u2081",
};

const TERMS: Record<string, string> = Object.fromEntries(
  Object.entries(TERM_LETTERS).flatMap(([letterKana, letter]) =>
    Object.entries(TERM_INDICES).map(([indexKana, index]) => [
      letterKana + indexKana,
      letter + index,
    ]),
  ),
);

/**
 * Greek letters, which the narration spells in kana so they are read at all.
 *
 * Unlike the operators, these are not safe as bare substrings: 「アルファベット」
 * and 「パイプ」 open with letters. The guard is what follows — a Greek name
 * running straight into more katakana is part of a longer word, while one
 * followed by kana, kanji, a symbol or nothing is the letter itself.
 */
const GREEK: Record<string, string> = {
  シータ: "θ",
  パイ: "π",
  アルファ: "α",
  ベータ: "β",
  ガンマ: "γ",
  デルタ: "δ",
  ラムダ: "λ",
  オメガ: "ω",
  シグマ: "Σ",
};

/** Katakana and the prolonged sound mark: what a Greek name must not run into. */
const KATAKANA = /[\u30a0-\u30ff]/;

/** Unambiguous in kana: nothing else in a maths script spells these. */
const ALWAYS: Record<string, string> = {
  コサイン: "cos",
  サイン: "sin",
  タンジェント: "tan",
  イコール: "=",
  ルート: "√",
  ...POWERS,
  ...TERMS,
};

/**
 * Arithmetic spelled out. The narration reserves these kana forms for
 * operators — an ordinary verb is written in kanji ("対角線を引く"), which is a
 * different token entirely — so they can be converted wherever they appear.
 */
const OPERATORS: Record<string, string> = {
  たす: "+",
  ひく: "−",
  かける: "×",
  わる: "÷",
  マイナス: "−",
  プラス: "+",
};

/**
 * An exponent the table above cannot name.
 *
 * 「にじょう」 and 「さんじょう」 are spelled out there, but an exponent that is
 * itself an expression — 「2のnたす1じょう」 — has no fixed spelling, and the kana
 * was being left in the caption as 「2のn+1じょう」.
 *
 * Guarded like the operators, because じょう also opens ordinary words; after a
 * digit, a letter or another power it can only be an exponent.
 */
const POWER_TAIL: Record<string, string> = {
  じょう: "乗",
};

/** Everything that is only itself when notation comes before it. */
const AFTER_NOTATION_ONLY: Record<string, string> = {
  ...OPERATORS,
  ...POWER_TAIL,
};

/**
 * What an operator may follow inside a single token and still be an operator.
 *
 * Word boundaries glue an operator to whatever precedes it — `xのにじょうたす2x`
 * comes back with a `にじょうたす` token — so the head-of-token rule alone would
 * miss it. Replacing the kana anywhere would instead break 「満たす」, which is
 * one token whose たす is part of a verb. Requiring notation on the left tells
 * the two apart: `2乗たす` converts, `満たす` does not.
 */
const AFTER_NOTATION =
  /[0-9A-Za-z乗√πθ°=+−×÷()/.₁₂₃₄ₖₘₙ]/;

/**
 * Rejoins a word the boundaries cut up.
 *
 * Boundaries do not land on word edges: a katakana word straight after a digit
 * comes back split as `98コ` + `サイン`, and 「のにじょう」 arrives as three
 * tokens, `の` + `に` + `じょう`. Nothing about the split is predictable, so the
 * window grows until it spells one of the words being looked for.
 *
 * Shortest window first — `の` + `に` + `じょう` + `は` also contains
 * 「のにじょう」, and taking it would swallow the 「は」 and its timing along
 * with the exponent.
 */
const MAX_SPAN = 4;

const mergeSplitWords = (captions: Caption[], words: string[]): Caption[] => {
  const merged: Caption[] = [];
  let index = 0;

  while (index < captions.length) {
    let span = 1;

    for (let width = 2; width <= Math.min(MAX_SPAN, captions.length - index); width++) {
      const window = captions.slice(index, index + width);
      const joined = window.map((caption) => caption.text).join("");
      const completesAWord = words.some(
        (word) =>
          joined.includes(word) &&
          !window.some((caption) => caption.text.includes(word)),
      );
      if (completesAWord) {
        span = width;
        break;
      }
    }

    if (span === 1) {
      merged.push(captions[index]);
      index += 1;
      continue;
    }

    const window = captions.slice(index, index + span);
    merged.push({
      ...window[0],
      text: window.map((caption) => caption.text).join(""),
      endMs: window[span - 1].endMs,
      pageBreakAfter: window[span - 1].pageBreakAfter,
    });
    index += span;
  }

  return merged;
};

/** Longest first, so `のにじょう` wins over the `にじょう` inside it. */
const byLengthDesc = (entries: [string, string][]) =>
  [...entries].sort(([a], [b]) => b.length - a.length);

const applyGuarded = (text: string) => {
  let out = text;

  for (const [spoken, symbol] of Object.entries(AFTER_NOTATION_ONLY)) {
    let at = out.indexOf(spoken);
    while (at !== -1) {
      const isHead = at === 0;
      const followsNotation = at > 0 && AFTER_NOTATION.test(out[at - 1]!);
      if (!isHead && !followsNotation) {
        at = out.indexOf(spoken, at + 1);
        continue;
      }
      out = out.slice(0, at) + symbol + out.slice(at + spoken.length);
      at = out.indexOf(spoken, at + symbol.length);
    }
  }

  return out;
};

const applyGreek = (text: string) => {
  let out = text;

  for (const [spoken, letter] of byLengthDesc(Object.entries(GREEK))) {
    let at = out.indexOf(spoken);
    while (at !== -1) {
      const next = out[at + spoken.length];
      if (next !== undefined && KATAKANA.test(next)) {
        at = out.indexOf(spoken, at + 1);
        continue;
      }
      out = out.slice(0, at) + letter + out.slice(at + spoken.length);
      at = out.indexOf(spoken, at + letter.length);
    }
  }

  return out;
};

export const applyDisplaySpelling = (captions: Caption[]): Caption[] => {
  const merged = mergeSplitWords(captions, [
    ...Object.keys(ALWAYS),
    ...Object.keys(GREEK),
  ]);
  const always = byLengthDesc(Object.entries(ALWAYS));

  return merged.map((caption) => {
    let text = caption.text;
    for (const [spoken, written] of always) {
      text = text.split(spoken).join(written);
    }
    text = applyGreek(text);
    text = applyGuarded(text);
    return text === caption.text ? caption : { ...caption, text };
  });
};
