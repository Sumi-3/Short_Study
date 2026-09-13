/**
 * このパイプラインで実際に使える音声。
 *
 * Azure のカタログには Aoi、Daichi、Mayu、Naoki、Shiori、DragonHD の 2 種、MAI-Voice
 * など、さらに多くの日本語音声がある。しかし msedge-tts が使う無料 Edge endpoint はすべてを
 * "Stream closed before the synthesis completed" として拒否する。Azure Speech key と別 client が
 * 必要で、`getVoices()` が返す日本語音声は 2 種だけである。
 *
 * multilingual 音声はこの制限を越える方法である。課金 locale は別でも日本語を話し、推測でなく
 * 実測で、字幕の元にしている word boundary を同じように返す。
 */
export type Voice = {
  /** `setMetadata` へそのまま渡す EdgeTTS `ShortName`。 */
  id: string;
  /**
   * Microsoft が付けた名前ではなく、実際の聞こえ方。
   *
   * "ナナミ" と "セラフィナ" だけでは動画にどちらを選ぶべきか分からず、multilingual 音声の名前も
   * 聞こえ方ではなく課金 locale に由来する。`web/src/samples/` のサンプルから、音程、抑揚の幅、
   * 同じ文を読む長さを読み取っている。これを `scripts/voice-samples.ts` で再生成したら、文言も
   * 改めて照合する必要がある。
   */
  label: string;
  /** Microsoft が日本語向けに実装した 2 音声なら true。 */
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
 * 作成画面で全音声を試聴するときの発話内容。
 *
 * 数式の 1 行ではなく挨拶にする。目的は音声を判断することであり、数式を読ませると数式として
 * 判断されてしまうためである。
 */
export const SAMPLE_TEXT = "こんにちは、一緒に勉強しましょう！";

export const isVoiceId = (value: unknown): value is string =>
  typeof value === "string" && VOICES.some((voice) => voice.id === value);
