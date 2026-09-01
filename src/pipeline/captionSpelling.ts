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
 * Powers, longest spelling first: 「のにじょう」 has to be tried before
 * 「にじょう」 so the の is swallowed rather than left stranded in front of the
 * exponent.
 *
 * The kanji forms are here for shorts generated before the narration rule
 * changed. They read badly — 「2乗」 splits into `2` and `乗`, and a lone 乗 is
 * as readable as の(る) as it is じょう — which is why the prompt now asks for
 * the kana spelling. Displaying them correctly costs nothing.
 */
const POWERS: Record<string, string> = {
  のにじょう: "²",
  のさんじょう: "³",
  のよんじょう: "⁴",
  にじょう: "²",
  さんじょう: "³",
  よんじょう: "⁴",
  の二乗: "²",
  の三乗: "³",
  の2乗: "²",
  の3乗: "³",
  二乗: "²",
  三乗: "³",
  "2乗": "²",
  "3乗": "³",
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
 * What an operator may follow inside a single token and still be an operator.
 *
 * Word boundaries glue an operator to whatever precedes it — `xのにじょうたす2x`
 * comes back with a `にじょうたす` token — so the head-of-token rule alone would
 * miss it. Replacing the kana anywhere would instead break 「満たす」, which is
 * one token whose たす is part of a verb. Requiring notation on the left tells
 * the two apart: `²たす` converts, `満たす` does not.
 */
const AFTER_NOTATION =
  /[0-9A-Za-z²³⁴√πθ°=+−×÷()/.₁₂₃₄ₖₘₙ]/;

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

const applyOperators = (text: string) => {
  let out = text;

  for (const [spoken, symbol] of Object.entries(OPERATORS)) {
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

export const applyDisplaySpelling = (captions: Caption[]): Caption[] => {
  const merged = mergeSplitWords(captions, Object.keys(ALWAYS));
  const always = byLengthDesc(Object.entries(ALWAYS));

  return merged.map((caption) => {
    let text = caption.text;
    for (const [spoken, written] of always) {
      text = text.split(spoken).join(written);
    }
    text = applyOperators(text);
    return text === caption.text ? caption : { ...caption, text };
  });
};
