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
 * They are not made for Japanese, so their accent is a matter of taste; the
 * samples in `out/voice-samples/` exist to be listened to.
 */
export type Voice = {
  /** EdgeTTS `ShortName`, passed straight to `setMetadata`. */
  id: string;
  label: string;
  gender: "female" | "male";
  /** True for the two voices Microsoft actually built for Japanese. */
  native: boolean;
};

export const VOICES: readonly Voice[] = [
  { id: "ja-JP-NanamiNeural", label: "ナナミ", gender: "female", native: true },
  { id: "ja-JP-KeitaNeural", label: "ケイタ", gender: "male", native: true },
  { id: "en-US-AvaMultilingualNeural", label: "エヴァ", gender: "female", native: false },
  { id: "en-US-EmmaMultilingualNeural", label: "エマ", gender: "female", native: false },
  { id: "fr-FR-VivienneMultilingualNeural", label: "ヴィヴィアン", gender: "female", native: false },
  { id: "de-DE-SeraphinaMultilingualNeural", label: "セラフィナ", gender: "female", native: false },
  { id: "pt-BR-ThalitaMultilingualNeural", label: "タリタ", gender: "female", native: false },
  { id: "en-US-AndrewMultilingualNeural", label: "アンドリュー", gender: "male", native: false },
  { id: "en-US-BrianMultilingualNeural", label: "ブライアン", gender: "male", native: false },
  { id: "en-AU-WilliamMultilingualNeural", label: "ウィリアム", gender: "male", native: false },
  { id: "fr-FR-RemyMultilingualNeural", label: "レミ", gender: "male", native: false },
  { id: "de-DE-FlorianMultilingualNeural", label: "フロリアン", gender: "male", native: false },
  { id: "it-IT-GiuseppeMultilingualNeural", label: "ジュゼッペ", gender: "male", native: false },
  { id: "ko-KR-HyunsuMultilingualNeural", label: "ヒョンス", gender: "male", native: false },
];

export const isVoiceId = (value: unknown): value is string =>
  typeof value === "string" && VOICES.some((voice) => voice.id === value);
