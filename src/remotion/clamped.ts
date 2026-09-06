import { interpolate, type EasingFunction } from "remotion";

/**
 * `interpolate` with both ends clamped, and the theme's easing when one is
 * given.
 *
 * Every animation in this video is an entrance or an exit that has to hold its
 * end values, so 51 of the 54 interpolations spelled out the same two
 * `extrapolate` options. Naming them leaves the exceptions — the two
 * `perceptual-scale` scales — looking like the exceptions they are.
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
