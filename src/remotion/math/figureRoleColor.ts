import type { Theme } from "../theme";

const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const luminance = (channels: number[]) => channels.reduce((sum, value, index) => {
  const s = value / 255;
  return sum + (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
}, 0);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const blend = (over: number[], under: number[], alpha: number) => over.map((value, index) => value * alpha + under[index] * (1 - alpha));

/**
 * role は scene ごとに循環する accent とは独立して marker palette を使う。whiteboard の green は大きな
 * wash にはよいが、grey ground 上の小さな edge label には明るすぎる。diagram role colour だけを theme の
 * ink 側へ動かし、gradient 両端で text contrast を得る。background の3つの wash と highlight 済み face も
 * edge 下に重なり得るため、その合成ピークでも stroke contrast を確保する。label には bgDeep outline がある。
 * shared palette を変えると problem card と既存の boolean manifest まで変わってしまう。
 */
export const figureRoleColor = (theme: Theme, role: number): string => {
  const source = theme.accents[role - 1] ?? theme.ink;
  const channels = rgb(source);
  const ink = rgb(theme.ink);
  const grounds = [theme.bg, theme.bgDeep].map((color) => luminance(rgb(color)));
  const veil = theme.veil.match(/[\d.]+/g)!.map(Number);
  const surfaces = [theme.bg, theme.bgDeep].flatMap((ground) => {
    let peak = rgb(ground);
    for (const index of [2, 1, 4]) peak = blend(rgb(theme.accents[index]), peak, 0.55 * theme.wash);
    peak = blend(veil.slice(0, 3), peak, veil[3]);
    return [peak, ...theme.accents.map((color) => blend(rgb(color), peak, 0.18))].map(luminance);
  });
  for (let step = 0; step <= 20; step++) {
    const mixed = channels.map((value, index) => Math.round(value + (ink[index] - value) * step / 20));
    const light = luminance(mixed);
    if (grounds.every((ground) => contrast(light, ground) >= 4.5) &&
        surfaces.every((ground) => contrast(light, ground) >= 3)) {
      return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return theme.ink;
};
