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
 * Normalise powers before deciding whether they belong to an expression.
 *
 * These used to become ², and it was wrong in a way only real captions showed:
 * 「両辺を2乗するのが鍵です」 came out as 「両辺を²するのが鍵です」. 「2乗する」 is a
 * verb — the exponent is a thing you do to both sides, not a superscript on
 * anything. That forced the old unconditional replacement to use 「2乗」 in
 * both positions. We can now restore superscripts because applyPowers checks
 * the base AND the following verb across token boundaries, after normalising
 * all spellings. A token starting with 「2乗」 alone is not evidence of a base.
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
  "2乗": "2乗",
  "3乗": "3乗",
  "4乗": "4乗",
};

/**
 * Keep 「の」 with the exponent so removing it does not leave an empty timed
 * token. Like プラスマイナス and かっこ1, these are literal merge keys.
 */
const POWER_PHRASES = Object.fromEntries(
  Object.entries(POWERS).map(([spoken, written]) => [`の${spoken}`, `の${written}`]),
);

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
  // Keep Σ: spoken 「シグマ」 also names statistical σ, and captions have no
  // reliable semantic context to turn only summations into ∑. MathText makes
  // both capital-sigma code points display-size operators, so this is visible
  // consistently without introducing that statistical false positive.
  シグマ: "Σ",
};

/** Katakana and the prolonged sound mark: what a Greek name must not run into. */
const KATAKANA = /[\u30a0-\u30ff]/;

/**
 * 「分の」 fixes the order and scope, including 「4分の3ルート19」. A slash
 * alone cannot supply those bounds. Actual matches remain literal merge keys
 * so even a radical or a Greek name split into characters stays one fraction.
 * Exclude partial decimals and chained fractions; keep digits as strings to
 * avoid rounding large integers. Numeric denominators must be nonzero.
 */
const FRACTION_LETTER = `(?:[A-Za-zΑ-ΡΣ-ω]|(?:${Object.keys(GREEK).join("|")})(?![\\u30a0-\\u30ff]))`;
const FRACTION_ATOM = `(?:0|[1-9][0-9]*|${FRACTION_LETTER})`;
const FRACTION_NUMERATOR = `(?:${FRACTION_ATOM}?(?:ルート|√)${FRACTION_ATOM}|${FRACTION_ATOM})`;
const FRACTION_EDGE = "[0-9A-Za-zΑ-ΡΣ-ω０-９一二三四五六七八九十百千万億兆零〇./√]";
const FRACTION = new RegExp(
  `(?<!${FRACTION_EDGE})(?<!ルート)(?<!ぶんの)(?<!分の)([1-9][0-9]*|${FRACTION_LETTER})` +
  `(?:ぶんの|分の)(${FRACTION_NUMERATOR})(?!${FRACTION_EDGE}|ルート|ぶんの|分の)`,
  "g",
);

/** Unambiguous in kana: nothing else in a maths script spells these. */
const ALWAYS: Record<string, string> = {
  コサイン: "cos",
  サイン: "sin",
  タンジェント: "tan",
  リミット: "lim",
  イコール: "=",
  ルート: "√",
  // Run before guarded プラス/マイナス, and merge split TTS tokens as one word.
  プラスマイナス: "±",
  /*
   * Sub-question numbers. The narration says 「かっこ1」 because the synthesiser
   * reads a bare 「(1)」 as a pause rather than a number, and the caption is the
   * same words read rather than heard, so it wants the notation back.
   *
   * Spelled out per digit rather than matched with a pattern: `mergeSplitWords`
   * above reassembles a token the synthesiser split by looking for these exact
   * keys, and a regular expression cannot take part in that. Nine is past any
   * real exam question.
   */
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`かっこ${index + 1}`, `(${index + 1})`]),
  ),
  ...POWERS,
  ...POWER_PHRASES,
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
  /[0-9A-Za-z乗√πθαβγδλωΣ°=+−×÷()/.₁₂₃₄ₖₘₙ²³⁴]/;

// Operators and opening brackets can precede operators, but cannot be a base.
const POWER_BASE = /[0-9A-Za-zπθαβγδλωΣ)）\]₁₂₃₄ₖₘₙ]/;
const SUPERSCRIPTS: Record<string, string> = { "2": "²", "3": "³", "4": "⁴" };

const applyPowers = (text: string, context: string, offset: number) =>
  text.replace(/(の)?([234])乗/g, (spoken, particle: string | undefined, power: string, at: number) => {
    const before = context[offset + at - 1];
    const after = context.slice(offset + at + spoken.length);
    // 「xの2乗する」 is awkward but still verbal. Include inflections such as
    // して・しない・すれば・される, even when TTS puts them in the next token.
    const verbal = /^\s*(?:す[るれ]|し|さ[れせ]|せ[ずぬよ])/.test(after);
    // Bare 「12乗」 is the twelfth power, not 1². Numeric bases need 「の」;
    // narration already requires it, whereas x2乗 and (x+1)2乗 are unambiguous.
    const ambiguousDigits = !particle && before !== undefined && /[0-9]/.test(before);
    return before && POWER_BASE.test(before) && !verbal && !ambiguousDigits
      ? SUPERSCRIPTS[power]
      : spoken;
  });

/**
 * Rejoins a word the boundaries cut up.
 *
 * Boundaries do not land on word edges: a katakana word straight after a digit
 * comes back split as `98コ` + `サイン`, and 「のにじょう」 arrives as three
 * tokens, `の` + `に` + `じょう`. Nothing about the split is predictable, so the
 * window grows until it spells one of the words being looked for.
 *
 * Prefer the longest word at the same start (エーエヌプラスイチ must not
 * stop at エーエヌ), then take only the tokens needed to complete it. This
 * preserves neighbouring words and their timings, including the 「は」 after
 * 「のにじょう」. A character per token bounds the window by key length.
 */
const mergeSplitWords = (captions: Caption[], words: string[]): Caption[] => {
  const merged: Caption[] = [];
  const maxSpan = Math.max(0, ...words.map((word) => word.length));
  let index = 0;

  while (index < captions.length) {
    let span = 1;
    const lookahead = captions.slice(index, index + maxSpan);
    const joined = lookahead.map((caption) => caption.text).join("");
    const firstLength = captions[index].text.length;
    let bestStart = Infinity;
    let bestEnd = 0;
    for (const word of words) {
      let at = joined.indexOf(word);
      while (at !== -1 && at < firstLength) {
        const end = at + word.length;
        if (end > firstLength && (at < bestStart || (at === bestStart && end > bestEnd))) {
          bestStart = at;
          bestEnd = end;
        }
        at = joined.indexOf(word, at + 1);
      }
    }
    let covered = firstLength;
    while (covered < bestEnd) {
      covered += lookahead[span].text.length;
      span++;
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
  const fractionMatches = Array.from(captions.map((caption) => caption.text).join("").matchAll(FRACTION));
  const fractions = [...new Set(fractionMatches.map((match) => match[0]))];
  const fractionStarts = new Set(fractionMatches.map((match) => match.index));
  // Merge fractions first: a smaller word must not consume half of one. A
  // character per token is the worst split, so key length bounds the window
  // even for multi-digit fractions (the former four-token window could not).
  const fractionMerged = mergeSplitWords(captions, fractions);
  const merged = mergeSplitWords(fractionMerged, [
    ...Object.keys(ALWAYS),
    ...Object.keys(GREEK),
  ]);
  const always = byLengthDesc(Object.entries(ALWAYS));

  let sourceOffset = 0;
  const normalised = merged.map((caption) => {
    // Keep the full-context guard even when a decimal's prefix is another token.
    let text = caption.text.replace(FRACTION, (spoken, denominator, numerator, at) =>
      fractionStarts.has(sourceOffset + at) ? `${numerator}/${denominator}` : spoken);
    sourceOffset += caption.text.length;
    for (const [spoken, written] of always) {
      text = text.split(spoken).join(written);
    }
    text = applyGreek(text);
    text = applyGuarded(text);
    return text === caption.text ? caption : { ...caption, text };
  });
  const context = normalised.map((caption) => caption.text).join("");
  let offset = 0;
  return normalised.map((caption) => {
    const text = applyPowers(caption.text, context, offset);
    offset += caption.text.length;
    return text === caption.text ? caption : { ...caption, text };
  });
};
