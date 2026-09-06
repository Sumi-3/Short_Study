/**
 * The voices this pipeline can actually use.
 *
 * Azure's catalogue lists many more Japanese voices — Aoi, Daichi, Mayu,
 * Naoki, Shiori, the DragonHD pair, the MAI-Voice ones — but every one of them
 * is refused by the free Edge endpoint msedge-tts talks to ("Stream closed
 * before the synthesis completed"). They need an Azure Speech key and a
 * different client. Only two Japanese voices come back from `getVoices()`.
 *
 * The multilingual voices are the way past that: they are billed to other
 * locales but speak Japanese, and — measured, not assumed — return the same
 * word boundaries, which is what `CAPTION_SOURCE=tts` builds captions from.
 */
export type Voice = {
  /** EdgeTTS `ShortName`, passed straight to `setMetadata`. */
  id: string;
  /**
   * How the voice sounds, not what Microsoft named it.
   *
   * "ナナミ" and "セラフィナ" tell a person nothing about which one to pick for
   * their video, and the multilingual ones are named after the locale they are
   * billed to rather than anything audible. These read off the samples in
   * `web/src/samples/`: pitch, how far the intonation moves, and how long the
   * same sentence takes. Regenerate those (`scripts/voice-samples.ts`) and the
   * wording should be checked against them again.
   */
  label: string;
  /** True for the two voices Microsoft actually built for Japanese. */
  native: boolean;
};

export const VOICES: readonly Voice[] = [
  { id: "ja-JP-NanamiNeural", label: "明るい女性", native: true },
  { id: "ja-JP-KeitaNeural", label: "きびきびした男性", native: true },
  { id: "en-US-AvaMultilingualNeural", label: "軽やかな女性", native: false },
  { id: "en-US-EmmaMultilingualNeural", label: "ほがらかな女性", native: false },
  { id: "pt-BR-ThalitaMultilingualNeural", label: "表情ゆたかな女性", native: false },
  { id: "de-DE-SeraphinaMultilingualNeural", label: "ゆったりした女性", native: false },
  { id: "fr-FR-VivienneMultilingualNeural", label: "落ち着いた女性", native: false },
  { id: "it-IT-GiuseppeMultilingualNeural", label: "明るい男性", native: false },
  { id: "de-DE-FlorianMultilingualNeural", label: "やわらかい男性", native: false },
  { id: "ko-KR-HyunsuMultilingualNeural", label: "やさしい男性", native: false },
  { id: "en-US-BrianMultilingualNeural", label: "ゆっくり話す男性", native: false },
  { id: "en-US-AndrewMultilingualNeural", label: "語りかける男性", native: false },
  { id: "fr-FR-RemyMultilingualNeural", label: "深みのある男性", native: false },
  { id: "en-AU-WilliamMultilingualNeural", label: "低く落ち着いた男性", native: false },
];

/**
 * What every voice is auditioned saying on the create screen.
 *
 * A greeting rather than a line of maths: the point is to judge the voice, and
 * a formula read aloud is judged as a formula.
 */
export const SAMPLE_TEXT = "こんにちは、一緒に勉強しましょう！";

export const isVoiceId = (value: unknown): value is string =>
  typeof value === "string" && VOICES.some((voice) => voice.id === value);
