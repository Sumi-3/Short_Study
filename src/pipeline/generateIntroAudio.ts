import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeNarration } from "../mathSpeech.js";
import { SYSTEM_INTRO_SCRIPT } from "../remotion/intro/script.js";
import type { IntroNarration } from "../remotion/intro/script.js";
import type { Scene } from "../types.js";
import { VOICES, type Voice } from "../voices.js";

const TEMP_SLUG = "intro-narration";
const DEFAULT_VOICE = VOICES[0];

const readVoice = (): Voice => {
  const voiceFlag = process.argv.indexOf("--voice");
  const requested = voiceFlag === -1
    ? DEFAULT_VOICE.id
    : process.argv[voiceFlag + 1];
  if (!requested) {
    throw new Error("--voice の後に VOICES の id を指定してください。");
  }
  const voice = VOICES.find((candidate) => candidate.id === requested);
  if (!voice) {
    throw new Error(
      `未対応の voice: ${requested}\n利用可能: ${VOICES.map((candidate) => candidate.id).join(", ")}`,
    );
  }
  return voice;
};

/**
 * 読み上げないシーン（タイトルなど）は TTS に送らない。空文字を渡すと EdgeTTS が
 * 空の clip を返し、尺が 0 のまま narration.json に載ってしまう。
 */
const spokenScenes = SYSTEM_INTRO_SCRIPT.filter((scene) => scene.narration.trim() !== "");

const introScenes: Scene[] = spokenScenes.map((scene, index) => ({
  scene_id: index + 1,
  narration: scene.narration,
  visual_type: "hook",
  visual_content: scene.id,
}));

const main = async () => {
  const voice = readVoice();
  const spokenNarrations = introScenes.map((scene) => normalizeNarration(scene.narration));
  const rewritten = introScenes.filter((scene, index) => scene.narration !== spokenNarrations[index]);
  if (rewritten.length > 0) {
    console.warn(`normalizeNarration changed: ${rewritten.map((scene) => scene.scene_id).join(", ")}`);
  }

  // generateAudio の project path は本番生成専用なので、既存の public/projects を一切触らない。
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "short-study-intro-audio-"));
  process.env.SHORT_STUDY_DATA_DIR = tempRoot;

  try {
    const { generateAudio } = await import("./generateAudio.js");
    const audios = await generateAudio({
      scenes: introScenes,
      slug: TEMP_SLUG,
      voice: voice.id,
    });
    if (audios.length !== spokenScenes.length) {
      throw new Error(`音声数が一致しません: ${audios.length}`);
    }

    const introDir = path.join(process.cwd(), "public", "intro");
    const audioDir = path.join(introDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });

    const scenes: IntroNarration[] = audios.map((audio, index) => {
      const source = introScenes[index];
      const targetName = `scene-${String(source.scene_id).padStart(2, "0")}.mp3`;
      fs.copyFileSync(audio.filePath, path.join(audioDir, targetName));
      return {
        id: spokenScenes[index].id,
        narration: source.narration,
        audioSrc: `intro/audio/${targetName}`,
        durationInSeconds: audio.durationInSeconds,
        wordBoundaries: audio.wordBoundaries,
      };
    });

    const narrationPath = path.join(introDir, "narration.json");
    const pendingPath = `${narrationPath}.pending`;
    fs.writeFileSync(
      pendingPath,
      JSON.stringify({
        version: 1,
        voice: { id: voice.id, label: voice.label },
        scenes,
      }, null, 2),
    );
    fs.renameSync(pendingPath, narrationPath);

    for (const scene of scenes) {
      console.log(`${scene.id}: ${scene.durationInSeconds.toFixed(3)}s`);
    }
    console.log(`total: ${scenes.reduce((total, scene) => total + scene.durationInSeconds, 0).toFixed(3)}s`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
