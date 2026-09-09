/**
 * 試聴する各 voice の preview clip を再合成する。
 *
 * clip は runtime に fetch せず `web/src/samples/` に commit し、build が import する。
 * 合計は数百 kilobyte にすぎず、60秒の render を始める前に ▶ をタップする狙いが、
 * API server を待つ preview では失われるためである。
 *
 *   npx tsx scripts/voice-samples.ts
 *
 * `VOICES` や rate/pitch の default が変わったら実行する。pipeline の出力と合わない
 * preview は、ないほうがましだからである。
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
