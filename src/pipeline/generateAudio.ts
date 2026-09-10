import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { config, paths } from "../config.js";
import type { Scene } from "../types.js";
import { normalizeNarration } from "../mathSpeech.js";

/** clip 先頭基準のタイミングを持つ単語（日本語では短い token）。 */
export type WordBoundary = {
  text: string;
  fromMs: number;
  toMs: number;
};

export type SceneAudio = {
  sceneId: number;
  filePath: string;
  /** `staticFile()` 用の `public/` からの相対パス。 */
  audioSrc: string;
  durationInSeconds: number;
  /**
   * これを報告するのは EdgeTTS だけ。synthesiser は各単語を置いた位置を知っているので正確であり、
   * CAPTION_SOURCE=tts が Whisper を完全に省ける理由でもある。
   */
  wordBoundaries: WordBoundary[] | null;
};

/** EdgeTTS は時間を 100 nanosecond tick で返す。 */
const TICKS_PER_MS = 10_000;

const sceneFileName = (sceneId: number) =>
  `scene-${String(sceneId).padStart(2, "0")}.mp3`;

/**
 * 締め切り付きで stream を読み切る。
 *
 * EdgeTTS は WebSocket 1 本で全シーンを直列に合成する。接続が黙って落ちると、この
 * stream は end も error も出さないまま止まり、await が永久に返らない。工程の表示は
 * 「ナレーションを合成しています」のままで、利用者には壊れたのか長いだけなのかが
 * 分からない。だから最後の chunk からの無音時間で切る。全体ではなく chunk 間で計るのは、
 * 長いナレーションを合成しているだけの状態を落とさないためである。
 */
const streamToBuffer = async (stream: NodeJS.ReadableStream, timeoutMs: number) => {
  const chunks: Buffer[] = [];
  let idle: ReturnType<typeof setTimeout> | undefined;

  const stalled = new Promise<never>((_, reject) => {
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(
        () => reject(new Error(`TTS stream stalled for ${Math.round(timeoutMs / 1000)}s`)),
        timeoutMs,
      );
    };
    arm();
    stream.on("data", arm);
    stream.on("end", () => clearTimeout(idle));
  });

  const read = (async () => {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  })();

  try {
    return await Promise.race([read, stalled]);
  } finally {
    clearTimeout(idle);
  }
};

/**
 * metadata stream は WebSocket message ごとに `{"Metadata":[...]}` JSON object を 1 つ出すが、
 * Node は複数を 1 chunk にまとめることがある。そのため連結した text は chunk ごとに parse せず、
 * brace depth で分割する。
 */
const splitJsonObjects = (text: string): string[] => {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
};

const parseWordBoundaries = (raw: string): WordBoundary[] => {
  const boundaries: WordBoundary[] = [];

  for (const object of splitJsonObjects(raw)) {
    let payload: { Metadata?: unknown[] };
    try {
      payload = JSON.parse(object);
    } catch {
      continue;
    }
    for (const entry of payload.Metadata ?? []) {
      const event = entry as {
        Type?: string;
        Data?: { Offset: number; Duration: number; text: { Text: string } };
      };
      if (event.Type !== "WordBoundary" || !event.Data) {
        continue;
      }
      const fromMs = event.Data.Offset / TICKS_PER_MS;
      boundaries.push({
        text: event.Data.text.Text,
        fromMs,
        toMs: fromMs + event.Data.Duration / TICKS_PER_MS,
      });
    }
  }

  return boundaries;
};

const synthesizeWithEdge = async (
  texts: string[],
  voice: string,
): Promise<{ audio: Buffer; boundaries: WordBoundary[] }[]> => {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true },
  );

  try {
    const results: { audio: Buffer; boundaries: WordBoundary[] }[] = [];
    // 直列にする。WebSocket connection 1 本で、1 度に synthesis も 1 件だけ行う。
    for (const text of texts) {
      const { audioStream, metadataStream } = tts.toStream(text, {
        rate: config.edgeRate,
        pitch: config.edgePitch,
        volume: config.edgeVolume,
      });

      let metadataRaw = "";
      metadataStream?.on("data", (chunk: Buffer | string) => {
        metadataRaw += chunk.toString();
      });

      const audio = await streamToBuffer(audioStream, config.ttsTimeoutMs);
      results.push({ audio, boundaries: parseWordBoundaries(metadataRaw) });
    }
    return results;
  } finally {
    tts.close();
  }
};

const synthesizeWithElevenLabs = async (texts: string[]): Promise<Buffer[]> => {
  if (!config.elevenLabsApiKey) {
    throw new Error(
      "TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is not set.",
    );
  }

  const buffers: Buffer[] = [];
  for (const text of texts) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": config.elevenLabsApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: config.elevenLabsModel,
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
        // fetch に既定の締め切りは無い。応答本文の読み取りまでこの signal が覆う。
        signal: AbortSignal.timeout(config.ttsTimeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(
        `ElevenLabs returned ${response.status}: ${await response.text()}`,
      );
    }
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }
  return buffers;
};

export const generateAudio = async ({
  scenes,
  slug,
  voice = config.edgeVoice,
}: {
  scenes: Scene[];
  slug: string;
  /** 作成画面で動画ごとに選ぶ。なければ EDGE_VOICE へフォールバックする。 */
  voice?: string;
}): Promise<SceneAudio[]> => {
  // 字幕のLaTeXを送らず、読み用だけを取り出して検査する。旧台本は従来の読み下しを保つ。
  const texts = scenes.map((scene) => normalizeNarration(scene.narration));
  const dir = paths.projectDir(slug);
  fs.mkdirSync(dir, { recursive: true });

  const synthesized =
    config.ttsProvider === "elevenlabs"
      ? (await synthesizeWithElevenLabs(texts)).map((audio) => ({
          audio,
          boundaries: null,
        }))
      : await synthesizeWithEdge(texts, voice);

  const result: SceneAudio[] = [];
  for (const [index, scene] of scenes.entries()) {
    const fileName = sceneFileName(scene.scene_id);
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, synthesized[index].audio);

    const { slowDurationInSeconds } = await parseMedia({
      src: filePath,
      reader: nodeReader,
      fields: { slowDurationInSeconds: true },
      acknowledgeRemotionLicense: true,
    });

    result.push({
      sceneId: scene.scene_id,
      filePath,
      audioSrc: `${paths.staticProject(slug)}/${fileName}`,
      durationInSeconds: slowDurationInSeconds,
      wordBoundaries: synthesized[index].boundaries,
    });
  }

  return result;
};
