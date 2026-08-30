/**
 * Shared geometry for the data charts.
 *
 * They all draw into the same box and share one convention: the value axis is
 * fitted to the data, not to zero-based defaults, except where a count axis
 * makes zero meaningful. Keeping that here stops four charts from each
 * inventing their own margins and tick spacing.
 */
export const WIDTH = 904;
export const HEIGHT = 700;
/** Left margin carries the value labels; bottom carries the axis. */
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
 * Tick values a reader would have chosen: steps of 1, 2 or 5 times a power of
 * ten, so the labels stay round however the data is scaled.
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
    // Floating point leaves 0.30000000000000004 lying around otherwise.
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
};

/** Trailing zeros read as false precision on an axis. */
export const tickLabel = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
