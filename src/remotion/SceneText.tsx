import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { shadowOf, useTheme } from "./theme";
import { SceneShell } from "./SceneShell";
import { MathText } from "./MathText";
import type { Scene } from "../types";

const Bullet: React.FC<{
  text: string;
  index: number;
  accent: string;
}> = ({ text, index, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // narration に合わせて list が組み上がるよう、時間をずらす。
  const start = (0.9 + index * 0.45) * fps;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        opacity: clamped(
          frame,
          [start, start + 0.4 * fps],
          [0, 1],
          theme.easing,
        ),
        translate: clamped(
          frame,
          [start, start + 0.55 * fps],
          ["0px 36px", "0px 0px"], theme.easing),
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          backgroundColor: accent,
          rotate: "45deg",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.3,
          color: theme.ink,
          textShadow: shadowOf(theme),
        }}
      >
        {/* 箇条書きも問題文や見出しと同じ本文で、$…$ の数式や x^2 の指数が混じる。生の文字列のままだと
            $ が画面に出るので、同じ組版を通す。 */}
        <MathText text={text} />
      </div>
    </div>
  );
};

/**
 * hook、summary、bullet-list scene。visual が文字であるものを扱う。`visual` payload のない scene も
 * ここへ来て、headline だけを表示する。
 */
export const SceneText: React.FC<{
  scene: Scene;
  durationInFrames: number;
  accent: string;
  problem?: { text: string; points: string[]; unit: string };
}> = ({ scene, durationInFrames, accent, problem }) => {
  const items =
    scene.visual?.kind === "bullets" ? scene.visual.items : [];

  return (
    <SceneShell
      scene={scene}
      durationInFrames={durationInFrames}
      accent={accent}
      problem={problem}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 44,
          justifyContent: "center",
          height: "100%",
        }}
      >
        {items.map((item, index) => (
          <Bullet key={item} text={item} index={index} accent={accent} />
        ))}
      </div>
    </SceneShell>
  );
};
