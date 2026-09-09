import type { Theme } from "../theme";

const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const luminance = (channels: number[]) => channels.reduce((sum, value, index) => {
  const s = value / 255;
  return sum + (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
}, 0);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const blend = (over: number[], under: number[], alpha: number) => over.map((value, index) => value * alpha + under[index] * (1 - alpha));

/**
 * Roles use the marker palette, independent of the scene's rotating accent.
 * Whiteboard's green is fine as a large wash but too light for a small edge
 * label on its grey ground. Move only diagram role colors toward the theme's
 * ink until both gradient endpoints give text contrast. The background's
 * three washes and highlighted face can also sit under an edge, so reserve
 * stroke contrast even at their combined peak; labels have a bgDeep outline.
 * Changing the shared palette would also change problem cards and existing
 * boolean manifests.
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
