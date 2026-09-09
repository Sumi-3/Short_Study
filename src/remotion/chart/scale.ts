/**
 * データ chart 共通の geometry。
 *
 * すべて同じ box に描き、値軸はデータに合わせて fit するという規約を共有する。count 軸では0に
 * 意味があるため例外だが、ゼロ始まりを標準にはしない。ここへまとめておけば、4種類の chart が
 * それぞれ独自の margin や tick 間隔を作るのを防げる。
 */
export const WIDTH = 904;
export const HEIGHT = 700;
/** 左 margin は値 label 用、下 margin は axis 用。 */
export const PAD = { top: 54, right: 34, bottom: 92, left: 96 } as const;

export const plotWidth = WIDTH - PAD.left - PAD.right;
export const plotHeight = HEIGHT - PAD.top - PAD.bottom;

export type Scale = (value: number) => number;

export const scaleX = (min: number, max: number): Scale => {
  const span = max - min || 1;
  return (value) => PAD.left + ((value - min) / span) * plotWidth;
};

export const scaleY = (min: number, max: number): Scale => {
  const span = max - min || 1;
  return (value) => HEIGHT - PAD.bottom - ((value - min) / span) * plotHeight;
};

/**
 * 読み手自身が選ぶような tick 値。10のべき乗に1、2、5を掛けた刻みなので、データの scale を
 * 問わず label が端数だらけにならない。
 */
export const niceTicks = (min: number, max: number, target = 5): number[] => {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return [min];
  }

  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised > 5 ? 10 : normalised > 2 ? 5 : normalised > 1 ? 2 : 1) *
    magnitude;

  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step / 2; value += step) {
    // これがないと floating point により 0.30000000000000004 が残る。
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
};

/** 末尾の0は axis では誤った精度に見える。 */
export const tickLabel = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
