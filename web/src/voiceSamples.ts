/**
 * The preview clip for each voice, all of them saying `SAMPLE_TEXT`.
 *
 * The files sit next to this module and go through the bundler as assets, so
 * they are hashed, cached and available on a static deploy. They are not
 * fetched from the API server: a preview that waits on a cold serverless
 * function would take longer than reading the label.
 *
 * Vite expands the template literal into a glob over `./samples/*.mp3` at build
 * time, which is why the directory has to hold exactly the ids in `VOICES` —
 * `scripts/voice-samples.ts` writes them under those names for that reason.
 */
export const sampleUrl = (voiceId: string) =>
  new URL(`./samples/${voiceId}.mp3`, import.meta.url).href;

let playing: HTMLAudioElement | null = null;

/**
 * Plays one preview, stopping whatever was already playing.
 *
 * Rejections are swallowed on purpose: a browser that refuses to play without
 * a gesture it recognises should leave the create screen working, not throw.
 */
export const playSample = (voiceId: string) => {
  playing?.pause();
  const audio = new Audio(sampleUrl(voiceId));
  playing = audio;
  void audio.play().catch(() => undefined);
};
