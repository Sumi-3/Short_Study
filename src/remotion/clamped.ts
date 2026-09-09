import { interpolate, type EasingFunction } from "remotion";

/**
 * 両端を clamp し、指定されたときは theme の easing も使う `interpolate`。
 *
 * この動画のアニメーションはすべて、終端値を保持すべき入場または退場である。そのため54個の
 * interpolation のうち51個が同じ2つの `extrapolate` option を明記していた。これに名前を
 * 付けると、例外である2つの `perceptual-scale` の scale が本当に例外として見える。
 */
export function clamped(
  frame: number,
  range: readonly number[],
  output: readonly number[],
  easing?: EasingFunction,
): number;
export function clamped(
  frame: number,
  range: readonly number[],
  output: readonly string[],
  easing?: EasingFunction,
): string;
export function clamped(
  frame: number,
  range: readonly number[],
  output: readonly (number | string)[],
  easing?: EasingFunction,
): number | string {
  return interpolate(frame, range, output as readonly number[], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    ...(easing ? { easing } : {}),
  });
}
