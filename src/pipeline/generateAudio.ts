import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { config, paths } from "../config.js";
import type { Scene } from "../types.js";

/** A word (or, in Japanese, a short token) with timings relative to the clip. */
export type WordBoundary = {
  text: string;
  fromMs: number;
  toMs: number;
};

export type SceneAudio = {
  sceneId: number;
  filePath: string;
  /** Path relative to `public/`, for `staticFile()`. */
  audioSrc: string;
  durationInSeconds: number;
  /**
   * Only EdgeTTS reports these. They are exact (the synthesiser knows where it
   * put each word), which is why CAPTION_SOURCE=tts can skip Whisper entirely.
   */
  wordBoundaries: WordBoundary[] | null;
};

/** EdgeTTS reports time in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;

const sceneFileName = (sceneId: number) =>
  `scene-${String(sceneId).padStart(2, "0")}.mp3`;

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * The metadata stream emits one `{"Metadata":[...]}` JSON object per WebSocket
 * message, but Node may coalesce them into a single chunk, so the concatenated
 * text is split by brace depth rather than parsed per chunk.
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
): Promise<{ audio: Buffer; boundaries: WordBoundary[] }[]> => {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    config.edgeVoice,
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true },
  );

  try {
    const results: { audio: Buffer; boundaries: WordBoundary[] }[] = [];
    // Sequentially: one WebSocket connection, one synthesis at a time.
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

      const audio = await streamToBuffer(audioStream);
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
}: {
  scenes: Scene[];
  slug: string;
}): Promise<SceneAudio[]> => {
  const dir = paths.projectDir(slug);
  fs.mkdirSync(dir, { recursive: true });

  const texts = scenes.map((scene) => scene.narration);
  const synthesized =
    config.ttsProvider === "elevenlabs"
      ? (await synthesizeWithElevenLabs(texts)).map((audio) => ({
          audio,
          boundaries: null,
        }))
      : await synthesizeWithEdge(texts);

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
