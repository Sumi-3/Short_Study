import type { Caption } from "@remotion/captions";
import { splitNarration } from "../narration.js";
import { normalizeNarration } from "../mathSpeech.js";
import { markPhraseBreaks } from "./captionBreaks.js";

type Block = { equal: boolean; i1: number; i2: number; j1: number; j2: number };
type Span = { lo: number; hi: number };

// 分数の中の数字を読みと一致させると、LaTeX がトークンの途中で切れてしまう。
const atomize = (text: string) => text.match(/\$[^$]*\$|[\s\S]/gu) ?? [];

/** SequenceMatcher（autojunk=false）と同じく、最長の連続一致を基準に左右を対応付ける。 */
const diff = (reading: string[], atoms: string[]): Block[] => {
  const matches: Block[] = [];
  const pending = [[0, reading.length, 0, atoms.length]];
  while (pending.length) {
    const [i1, i2, j1, j2] = pending.pop()!;
    let bestI = i1, bestJ = j1, size = 0;
    let previous = new Uint32Array(j2 - j1 + 1);
    for (let i = i1; i < i2; i++) {
      const current = new Uint32Array(previous.length);
      for (let j = j1; j < j2; j++) {
        if (reading[i] !== atoms[j]) continue;
        const length = previous[j - j1] + 1;
        current[j - j1 + 1] = length;
        // 同長なら読み側、次に字幕側の先頭を優先し、繰り返す助詞の対応を安定させる。
        if (length > size) { bestI = i - length + 1; bestJ = j - length + 1; size = length; }
      }
      previous = current;
    }
    if (!size) continue;
    matches.push({ equal: true, i1: bestI, i2: bestI + size, j1: bestJ, j2: bestJ + size });
    if (i1 < bestI && j1 < bestJ) pending.push([i1, bestI, j1, bestJ]);
    if (bestI + size < i2 && bestJ + size < j2) pending.push([bestI + size, i2, bestJ + size, j2]);
  }
  matches.sort((a, b) => a.i1 - b.i1);
  const blocks: Block[] = [];
  let i = 0, j = 0;
  for (const match of [...matches, { equal: true, i1: reading.length, i2: reading.length, j1: atoms.length, j2: atoms.length }]) {
    if (i < match.i1 || j < match.j1) blocks.push({ equal: false, i1: i, i2: match.i1, j1: j, j2: match.j1 });
    if (match.i1 < match.i2) blocks.push(match);
    i = match.i2;
    j = match.j2;
  }
  return blocks;
};

const correspondence = (reading: string, display: string) => {
  const chars = Array.from(reading);
  const atoms = atomize(display);
  const blocks = diff(chars, atoms);
  // indexOf のUTF-16オフセットを文字列diffの位置に戻し、補助漢字も1文字として扱う。
  const offsets = new Map<number, number>();
  let offset = 0;
  chars.forEach((char, i) => { offsets.set(offset, i); offset += char.length; });
  offsets.set(offset, chars.length);
  return { atoms, blocks, offsets };
};

export const alignCaptions = (narration: string, captions: Caption[]): Caption[] => {
  const { display } = splitNarration(narration);
  const reading = normalizeNarration(narration);
  if (display === null) return markPhraseBreaks(reading, captions);
  const { atoms, blocks, offsets } = correspondence(reading, display);
  const mapped: { caption: Caption; span: Span }[] = [];
  let cursor = 0;
  for (const caption of captions) {
    const at = reading.indexOf(caption.text, cursor);
    const start = offsets.get(at);
    const end = offsets.get(at + caption.text.length);
    if (at >= 0) cursor = at + caption.text.length;
    let lo = Infinity, hi = -Infinity;
    if (start !== undefined && end !== undefined && caption.text) {
      for (const b of blocks) {
        if (b.i2 <= start || b.i1 >= end) continue;
        lo = Math.min(lo, b.equal ? b.j1 + Math.max(0, start - b.i1) : b.j1);
        hi = Math.max(hi, b.equal ? b.j1 + Math.min(b.i2 - b.i1, end - b.i1) : b.j2);
      }
    }
    /*
     * 対応の取れない発話は字幕から落とす。
     *
     * 却下して台本を書き直させる道もあるが、そのために TTS をもう一度回す。時刻の裏付けが
     * ない字幕を出すよりその語を表示しないほうが破綻が小さいので、黙って進める。
     */
    if (lo >= hi || !atoms.slice(lo, hi).join("").trim()) continue;
    const previous = mapped.at(-1);
    if (previous && lo < previous.span.hi) {
      // 同じ差分に落ちた語を束ねる。語が差分と一致の両方をまたぐ場合も重複表示を防ぐ。
      previous.span.hi = Math.max(previous.span.hi, hi);
      previous.caption.endMs = caption.endMs;
      previous.caption.timestampMs = (previous.caption.startMs + caption.endMs) / 2;
    } else {
      mapped.push({ caption: { ...caption }, span: { lo, hi } });
    }
  }
  const result = mapped.map(({ caption, span }, index) => {
    const end = mapped[index + 1]?.span.lo ?? atoms.length;
    // 先頭の未発話文字は最初の語へ、それ以外の隙間は直前の語へ返して本文を保つ。
    const text = atoms.slice(index === 0 ? 0 : span.lo, end).join("");
    return { ...caption, text, pageBreakAfter: /[。！？、，]/.test(text) };
  });
  return result;
};
