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

/**
 * TTS は毎秒およそ6文字として、句読点も含めて1文字あたり5 frame を割り当てた仮尺。
 * 録音を入れる段階で audio duration に置き換えられるよう、台本とは分離している。
 */
export const SYSTEM_INTRO_SCRIPT: readonly IntroScene[] = [
  { id: "title", narration: "ShortCut", durationInFrames: 90, visual: "title" },
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
      "まず、ユーザは解説動画にしたい問題の写真を撮影、もしくは画像を入力します．画像から問題文の部分を切り抜くと，テキストの抽出が行われます．問題文があっていれば，音声を選択し，動画の生成を行います．動画は1、2分で生成されます．",
    durationInFrames: 615,
    visual: "input",
  },
  {
    id: "generated-video",
    narration:
      "こちらが生成された動画です．入力された問題文を成形し、問題分野・問題文の表示、問題を解く方針の説明，アニメーションを用いた解説が行われます．",
    durationInFrames: 390,
    visual: "generated-video",
  },
  {
    id: "animation-gallery",
    narration:
      "解説動画に用いられるアニメーションは複数あります．関数の描画，図形，表，ヒストグラムなど，解説に最適なアニメーションが用いられます．",
    durationInFrames: 375,
    visual: "animation-gallery",
  },
  {
    id: "library",
    narration:
      "作成した動画はホーム画面から見直すことができます．フィルター機能を用いて，好きな分野の動画だけを再生することができます．これで解説を終わります．",
    durationInFrames: 390,
    visual: "library",
  },
];

export const SYSTEM_INTRO_DURATION_IN_FRAMES = SYSTEM_INTRO_SCRIPT.reduce(
  (total, scene) => total + scene.durationInFrames,
  0,
);
