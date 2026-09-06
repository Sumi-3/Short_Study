/**
 * Re-synthesises the preview clip every voice is auditioned by.
 *
 * The clips are committed under `web/src/samples/` and imported by the build,
 * rather than fetched at runtime: they are a few hundred kilobytes in total,
 * and a preview that has to wait on the API server would defeat the point of
 * tapping ▶ before committing to a sixty-second render.
 *
 *   npx tsx scripts/voice-samples.ts
 *
 * Run it when VOICES changes, or when the rate/pitch defaults do — a preview
 * that does not match what the pipeline produces is worse than none.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { config } from "../src/config.js";
import { SAMPLE_TEXT, VOICES } from "../src/voices.js";

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../web/src/samples",
);

const synthesize = async (voice: string): Promise<Buffer> => {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  try {
    const { audioStream } = tts.toStream(SAMPLE_TEXT, {
      rate: config.edgeRate,
      pitch: config.edgePitch,
      volume: config.edgeVolume,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
};

fs.mkdirSync(outDir, { recursive: true });

for (const voice of VOICES) {
  const audio = await synthesize(voice.id);
  const file = path.join(outDir, `${voice.id}.mp3`);
  fs.writeFileSync(file, audio);
  console.log(`${voice.id}  ${(audio.length / 1024).toFixed(0)} KB`);
}
