import { AbsoluteFill } from "remotion";
import { Background } from "./Background";
import { SceneShell } from "./SceneShell";
import { ThemeProvider, accentFor, layout, themeOf } from "./theme";
import type { Scene } from "../types";

/**
 * 静止した video の opening frame。
 *
 * home screen は以前、chip・question・rule・hook を持つ独自 card を描いており、対応する video と
 * ずれていた。同じ question が card では一方の組版、tap 後には別の組版になった。代わりに composition と
 * 同じ `SceneShell` で本物の opening を描くため、card が video と食い違わない。
 *
 * 意図して manifest ではなく summary を受け取る。opening に必要な question と unit は home screen が持つ
 * summary にすでにあり、card ごとに manifest を fetch すると library の scroll が network 待ちになる。
 */
export type PosterProps = {
  topic: string;
  /** bullet point としての question。空なら question 自体へ fallback する。 */
  outline: string[];
  unit: string;
};

/**
 * headline も visual もない scene。question が scene 全体になる。`SceneShell` は problem を渡されると
 * 自動的に headline を外す。
 */
const HOOK: Scene = {
  scene_id: 1,
  narration: "",
  visual_type: "hook",
  visual_content: "",
};

/**
 * 表示する frame が `SceneShell` の exit fade から十分遠くなる長さ。exit fade は終了7 frame前に始まる。
 */
export const POSTER_DURATION = 300;

/**
 * opening の入場が完了する時点。question は0.35sで fade in し0.5sで slide、unit banner は0.4s、stage
 * 自体は8 frameを使う。0.8sまでにすべて静止し、まだ何も先へ移っていない。
 */
export const posterFrame = (fps: number) => Math.round(fps * 0.8);

export const Poster: React.FC<PosterProps> = ({
  topic,
  outline,
  unit,
}) => {
  const theme = themeOf();

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
        <Background />
        {/* `SceneText` 経由ではなく `SceneShell` を直接使う。hook に bullet はなく、video も同じ shell で
            描くため、card が対応する frame とずれることはない。 */}
        <SceneShell
          scene={HOOK}
          durationInFrames={POSTER_DURATION}
          accent={accentFor(theme, 0)}
          problem={{ text: topic, points: outline, unit }}
          poster
        />
      </AbsoluteFill>
    </ThemeProvider>
  );
};

export const POSTER_SIZE = { width: layout.width, height: layout.height };
