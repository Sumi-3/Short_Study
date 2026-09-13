import { introNarrationForText, type IntroWordBoundary } from "./script";

/** 句点は全角ピリオドと読点の混在があるため、終止記号をまとめて区切りに使う。 */
const SENTENCE = /[^．。！？]+[．。！？]?/g;

const splitSentences = (text: string) =>
  (text.match(SENTENCE) ?? []).map((sentence) => sentence.trim()).filter(Boolean);

/** JSON がない間も Studio を開けるよう、従来の文字数按分を残す。 */
const windowsOf = (sentences: string[], durationInFrames: number) => {
  const totalChars = sentences.reduce((count, sentence) => count + sentence.length, 0);
  let start = 0;

  return sentences.map((text) => {
    const span = (text.length / totalChars) * durationInFrames;
    const window = { text, start, end: start + span };
    start = window.end;
    return window;
  });
};

const spokenLength = (text: string) =>
  text.replace(/[\s　．。！？、，,.!]/g, "").length;

const windowsFromWordBoundaries = (
  sentences: string[],
  boundaries: readonly IntroWordBoundary[],
  fps: number,
) => {
  let boundaryIndex = 0;
  const windows: { text: string; start: number; end: number }[] = [];

  for (const text of sentences) {
    const targetLength = spokenLength(text);
    let spoken = 0;
    let first: IntroWordBoundary | null = null;
    let last: IntroWordBoundary | null = null;

    while (boundaryIndex < boundaries.length && spoken < targetLength) {
      const boundary = boundaries[boundaryIndex++];
      const length = spokenLength(boundary.text);
      if (length === 0) continue;
      if (!first) first = boundary;
      last = boundary;
      spoken += length;
    }

    if (
      !first ||
      !last ||
      spoken < targetLength ||
      !Number.isFinite(first.fromMs) ||
      !Number.isFinite(last.toMs)
    ) {
      return null;
    }
    windows.push({ text, start: (first.fromMs / 1000) * fps, end: (last.toMs / 1000) * fps });
  }

  return windows;
};

/**
 * 1文ずつの表示区間。字幕も、ナレーションに合わせて進む図も同じ刻みで動かしたいので、
 * 計算はここに1つだけ置く。音声があれば単語境界で正確に、無ければ文字数按分で近似する。
 */
export const sentenceWindows = (
  text: string,
  durationInFrames: number,
  fps: number,
): { text: string; start: number; end: number }[] => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const boundaries = introNarrationForText(text)?.wordBoundaries;
  return boundaries
    ? windowsFromWordBoundaries(sentences, boundaries, fps) ?? windowsOf(sentences, durationInFrames)
    : windowsOf(sentences, durationInFrames);
};

/** いま読まれている文の番号。区間を外れたら末尾に留める。 */
export const activeSentenceIndex = (
  windows: readonly { start: number; end: number }[],
  frame: number,
) => {
  const index = windows.findIndex((window) => frame < window.end);
  return index === -1 ? windows.length - 1 : index;
};
