/**
 * 寸法は別 module に置く。`config.ts` は Remotion の browser build に bundle できない `node:fs`
 * を触るためである。
 */
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;
