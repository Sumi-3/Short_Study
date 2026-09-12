/**
 * 寸法は別 module に置く。`config.ts` は Remotion の browser build に bundle できない `node:fs`
 * を触るためである。
 */
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/** ShortCut の紹介映像は、学習 short とは別の横長 Composition として扱う。 */
export const SYSTEM_INTRO_VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;
