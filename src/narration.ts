// 数学の本文や LaTeX と衝突せず、シーンの19フィールドを増やさずに読みを持たせる。
export const NARRATION_SEPARATOR = "<<<TTS_READING>>>";

export const splitNarration = (narration: string): { display: string | null; reading: string } => {
  const at = narration.indexOf(NARRATION_SEPARATOR);
  if (at < 0) return { display: null, reading: narration };
  if (narration.indexOf(NARRATION_SEPARATOR, at + NARRATION_SEPARATOR.length) >= 0) {
    throw new Error(`narration の区切り ${NARRATION_SEPARATOR} は1つだけにしてください。`);
  }
  const display = narration.slice(0, at).trim();
  const reading = narration.slice(at + NARRATION_SEPARATOR.length).trim();
  if (!display || !reading) throw new Error("narration の字幕用・読み用ブロックは両方とも必要です。");
  return { display, reading };
};
