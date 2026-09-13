import generatedNarration from "../../../public/intro/narration.json";
import { SYSTEM_INTRO_VIDEO } from "../../config-video";

export type IntroVisualKind =
  | "title"
  | "overview"
  | "input"
  | "generated-video"
  | "animation-gallery"
  | "library";

export type IntroScene = {
  id: IntroVisualKind;
  narration: string;
  durationInFrames: number;
  visual: IntroVisualKind;
};

export type IntroWordBoundary = {
  text: string;
  fromMs: number;
  toMs: number;
};

export type IntroNarration = {
  id: IntroVisualKind;
  narration: string;
  audioSrc: string;
  durationInSeconds: number;
  wordBoundaries: IntroWordBoundary[] | null;
};

type GeneratedNarration = {
  scenes?: IntroNarration[];
};

/**
 * TTS は毎秒およそ6文字として、句読点も含めて1文字あたり5 frame を割り当てた仮尺。
 * 録音を入れる段階で audio duration に置き換えられるよう、台本とは分離している。
 */
export const SYSTEM_INTRO_SCRIPT: readonly IntroScene[] = [
  // ロゴが出るだけのシーンなので読み上げない。narration が空だと音声も字幕も付かず、
  // 尺はここに書いた値がそのまま使われる。
  { id: "title", narration: "", durationInFrames: 60, visual: "title" },
  {
    id: "overview",
    narration:
      "ShortCutは数学の問題をアニメーションを用いながらショート動画で学べるアプリです．ユーザが入力した問題を解説動画に変換します．",
    durationInFrames: 315,
    visual: "overview",
  },
  {
    id: "input",
    narration:
      "まず、ユーザは解説動画にしたい問題の写真を撮影、もしくは画像を入力します．画像から問題文の部分を切り抜くと、テキストの抽出が行われます．テキストを確認し、音声を選択、動画の生成を行います．動画は1、2分で生成されます．",
    durationInFrames: 615,
    visual: "input",
  },
  {
    id: "generated-video",
    narration:
      "こちらが生成された動画です．問題分野・問題文の表示、問題を解く方針の説明、アニメーションを用いた解説が行われます．",
    durationInFrames: 390,
    visual: "generated-video",
  },
  {
    id: "animation-gallery",
    narration:
      "解説動画に用いられるアニメーションは複数あります．関数の描画，図形，表，ヒストグラムなど、解説に最適なアニメーションが用いられます．",
    durationInFrames: 375,
    visual: "animation-gallery",
  },
  {
    id: "library",
    narration:
      "作成した動画は自動で分類され、フィルター機能を用いて好きな分野の動画だけを再生することができます．これで解説を終わります．",
    durationInFrames: 390,
    visual: "library",
  },
];

const generatedScenes = (generatedNarration as GeneratedNarration).scenes ?? [];

/** 台本を直したあとに古い音声を鳴らしたり尺だけを使ったりしない。 */
export const introNarrationFor = (scene: IntroScene) => {
  const narration = generatedScenes.find((candidate) => candidate.id === scene.id);
  if (
    !narration ||
    narration.narration !== scene.narration ||
    !Number.isFinite(narration.durationInSeconds) ||
    narration.durationInSeconds <= 0
  ) {
    return null;
  }
  return narration;
};

/** SceneLayout は本文だけを持つため、台本と一致する音声の境界だけを返す。 */
export const introNarrationForText = (text: string) =>
  SYSTEM_INTRO_SCRIPT
    .map(introNarrationFor)
    .find((narration) => narration?.narration === text) ?? null;

export const introDurationInFrames = (scene: IntroScene, fps: number) => {
  const narration = introNarrationFor(scene);
  return narration
    ? Math.max(1, Math.ceil(narration.durationInSeconds * fps))
    : scene.durationInFrames;
};

export const SYSTEM_INTRO_DURATION_IN_FRAMES = SYSTEM_INTRO_SCRIPT.reduce(
  (total, scene) => total + introDurationInFrames(scene, SYSTEM_INTRO_VIDEO.fps),
  0,
);
