import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { IntroCaptions } from "./IntroCaptions";
import { useTheme, withAlpha } from "../theme";

export const SceneLayout: React.FC<{
  title: string;
  narration: string;
  /** 字幕を1文ずつ割り付けるのに要る。Sequence の尺は useVideoConfig からは取れない。 */
  durationInFrames: number;
  children: ReactNode;
}> = ({ title, narration, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // 下余白は1行の字幕帯ぶんだけ空ける。2行に折り返すと帯が上へ伸びて中身に重なるので、
  // 台本側で1文を1行に収める前提に合わせてある。
  return (
    <AbsoluteFill style={{ padding: "54px 100px 120px" }}>
      <div
        style={{
          paddingBottom: 20,
          borderBottom: `2px solid ${withAlpha(theme.ink, 0.14)}`,
          fontFamily: theme.fontFamily,
          fontSize: 48,
          fontWeight: 800,
          lineHeight: 1.2,
          color: theme.ink,
          opacity: interpolate(frame, [0, fps * 0.4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
          translate: interpolate(frame, [0, fps * 0.4], ["0px -16px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1, minHeight: 0, paddingTop: 28 }}>{children}</div>
      <IntroCaptions text={narration} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
