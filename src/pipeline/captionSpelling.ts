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

/** Unambiguous in kana: nothing else in a maths script spells these. */
const ALWAYS: Record<string, string> = {
  コサイン: "cos",
  サイン: "sin",
  タンジェント: "tan",
  イコール: "=",
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
 * Word boundaries do not always land on word edges: a katakana word straight
 * after a digit comes back split, as `98コ` + `サイン`. Rejoining the pair is
 * what makes the lookup above see a whole word.
 */
const mergeSplitWords = (captions: Caption[], words: string[]): Caption[] => {
  const merged: Caption[] = [];

  for (let index = 0; index < captions.length; index++) {
    const current = captions[index];
    const next = captions[index + 1];
    const joined = next ? current.text + next.text : null;

    const spans =
      joined !== null &&
      words.some(
        (word) =>
          joined.includes(word) &&
          !current.text.includes(word) &&
          !next!.text.includes(word),
      );

    if (spans && next) {
      merged.push({
        ...current,
        text: joined!,
        endMs: next.endMs,
        pageBreakAfter: next.pageBreakAfter,
      });
      index++;
      continue;
    }

    merged.push(current);
  }

  return merged;
};

export const applyDisplaySpelling = (captions: Caption[]): Caption[] => {
  const merged = mergeSplitWords(captions, Object.keys(ALWAYS));

  const spelled = merged.map((caption) => {
    let text = caption.text;
    for (const [spoken, written] of Object.entries(ALWAYS)) {
      text = text.split(spoken).join(written);
    }
    return text === caption.text ? caption : { ...caption, text };
  });

  return spelled.map((caption) => {
    const word = caption.text.trim();

    // Whole token, or the head of one: word boundaries sometimes glue the
    // operator to what follows it, as `ひく角`.
    for (const [spoken, symbol] of Object.entries(OPERATORS)) {
      if (word === spoken) {
        return { ...caption, text: symbol };
      }
      if (word.startsWith(spoken)) {
        return { ...caption, text: symbol + word.slice(spoken.length) };
      }
    }

    return caption;
  });
};
