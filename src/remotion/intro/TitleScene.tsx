import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: 310,
          backgroundColor: withAlpha(theme.accents[0], 0.16),
          scale: interpolate(frame, [0, fps * 1.7], [0.45, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
            output: "perceptual-scale",
          }),
        }}
      />
      <div
        style={{
          zIndex: 1,
          fontFamily: theme.fontFamily,
          fontSize: 160,
          fontWeight: 900,
          letterSpacing: -8,
          color: theme.ink,
          opacity: interpolate(frame, [0, fps * 0.8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
          scale: interpolate(frame, [0, fps * 1], [0.72, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
            output: "perceptual-scale",
          }),
        }}
      >
        Short<span style={{ color: theme.accents[0] }}>Cut</span>
      </div>
      <div
        style={{
          zIndex: 1,
          marginTop: 24,
          fontFamily: theme.fontFamily,
          fontSize: 30,
          // 和文は字面が詰まっているので、欧文向けの広い字間をそのまま当てると間延びする。
          letterSpacing: 2,
          fontWeight: 700,
          color: theme.inkDim,
          opacity: interpolate(frame, [fps * 0.7, fps * 1.4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
        }}
      >
        数学を、ショート動画で。
      </div>
    </AbsoluteFill>
  );
};
