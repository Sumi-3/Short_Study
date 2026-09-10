import type { Caption } from "@remotion/captions";
import { splitNarration } from "../narration.js";
import { normalizeNarration } from "../mathSpeech.js";
import { markPhraseBreaks } from "./captionBreaks.js";

export class CaptionAlignmentError extends Error {}

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
  const matchRate = blocks.reduce((sum, b) => sum + (b.equal ? b.i2 - b.i1 : 0), 0) / Math.max(1, chars.length);
  // indexOf のUTF-16オフセットを文字列diffの位置に戻し、補助漢字も1文字として扱う。
  const offsets = new Map<number, number>();
  let offset = 0;
  chars.forEach((char, i) => { offsets.set(offset, i); offset += char.length; });
  offsets.set(offset, chars.length);
  return { atoms, blocks, matchRate, offsets };
};

const check = (matchRate: number, texts: string[], missing: string[] = []) => {
  const reasons: string[] = [];
  if (matchRate < 0.3) reasons.push(`読みと字幕の一致率が${(matchRate * 100).toFixed(1)}%です（最低30%）。散文を数式にせず、内容を大きく足したり落としたりしないでください。`);
  if (missing.length) reasons.push(`字幕の当たらない発話トークンが${missing.length}個あります「${missing.slice(0, 8).join(" / ")}」。読みと字幕の内容を対応させてください。`);
  if (texts.some((text) => (text.match(/\$/g)?.length ?? 0) % 2)) reasons.push("字幕トークン内の $ の個数が奇数です。数式を $…$ で閉じてください。");
  if (reasons.length) throw new CaptionAlignmentError(reasons.join("\n"));
};

/** 時刻を捏造せずに検査できる項目だけを、TTSの前に却下して再生成へ戻す。 */
export const assertNarrationAlignment = (narration: string) => {
  const { display } = splitNarration(narration);
  if (display === null) return;
  const { matchRate, atoms } = correspondence(normalizeNarration(narration), display);
  check(matchRate, atoms);
};

export const alignCaptions = (narration: string, captions: Caption[]) => {
  const { display } = splitNarration(narration);
  const reading = normalizeNarration(narration);
  if (display === null) return { captions: markPhraseBreaks(reading, captions), matchRate: 1 };
  const { atoms, blocks, matchRate, offsets } = correspondence(reading, display);
  const mapped: { caption: Caption; span: Span }[] = [];
  const missing: string[] = [];
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
    if (lo >= hi || !atoms.slice(lo, hi).join("").trim()) {
      missing.push(caption.text);
      continue;
    }
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
  if (!captions.length && reading.trim()) missing.push(reading);
  // 未対応の発話へ句読点を足して空でなくしてしまう前に検査する。
  check(matchRate, mapped.map(({ span }) => atoms.slice(span.lo, span.hi).join("")), missing);
  const result = mapped.map(({ caption, span }, index) => {
    const end = mapped[index + 1]?.span.lo ?? atoms.length;
    // 先頭の未発話文字は最初の語へ、それ以外の隙間は直前の語へ返して本文を保つ。
    const text = atoms.slice(index === 0 ? 0 : span.lo, end).join("");
    return { ...caption, text, pageBreakAfter: /[。！？、，]/.test(text) };
  });
  check(matchRate, result.map((caption) => caption.text));
  return { captions: result, matchRate };
};

export const assertCaptionAlignments = (scenes: readonly { narration: string }[], captions: Caption[][]) => {
  scenes.forEach((scene, index) => {
    try { alignCaptions(scene.narration, captions[index] ?? []); }
    catch (error) {
      if (!(error instanceof CaptionAlignmentError)) throw error;
      throw new CaptionAlignmentError(`シーン${index + 1}: ${error.message}`);
    }
  });
};
