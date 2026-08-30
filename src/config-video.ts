/**
 * Dimensions live in their own module because `config.ts` touches `node:fs`,
 * which cannot be bundled into the Remotion browser build.
 */
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;
