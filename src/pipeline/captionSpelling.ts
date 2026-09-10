import type { Caption } from "@remotion/captions";
import { normalizeMathText, splitMathText } from "../mathText.js";

/** 他教科の旧字幕も数式の途中で切らず、元の発話区間を保って組版する。 */
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

/** 教科によらず生 TeX は修復する。数学用のカナ置換まで他教科に広げる必要はない。 */
export const normalizeCaptionMath = (captions: Caption[]): Caption[] => {
  const source = captions.map((caption) => caption.text).join("");
  const words = splitMathText(source).filter((part) => part.math)
    .map((part) => source.slice(part.start, part.end));
  return mergeSplitWords(captions, words).map((caption) => {
    const text = normalizeMathText(caption.text);
    return text === caption.text ? caption : { ...caption, text };
  });
};
