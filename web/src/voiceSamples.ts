/**
 * 各 voice が `SAMPLE_TEXT` を話す preview clip。
 *
 * file はこの module の隣に置き、asset として bundler を通す。そのため hash 化・
 * cache 化され static deploy でも使える。API server から fetch はしない。cold な
 * serverless function を待つ preview は label を読むより時間がかかるからである。
 *
 * Vite は build 時に template literal を `./samples/*.mp3` の glob へ展開する。
 * そのため directory には `VOICES` の id と完全に一致する file だけを置く必要があり、
 * `scripts/voice-samples.ts` もその名前で書き出している。
 */
export const sampleUrl = (voiceId: string) =>
  new URL(`./samples/${voiceId}.mp3`, import.meta.url).href;

let playing: HTMLAudioElement | null = null;

/**
 * すでに再生中のものを止めて、ひとつの preview を再生する。
 *
 * rejection は意図して握りつぶす。認識できる gesture なしの再生を拒む browser でも、
 * 例外にせず create 画面を動かし続けるべきだからである。
 */
export const playSample = (voiceId: string) => {
  playing?.pause();
  const audio = new Audio(sampleUrl(voiceId));
  playing = audio;
  void audio.play().catch(() => undefined);
};
