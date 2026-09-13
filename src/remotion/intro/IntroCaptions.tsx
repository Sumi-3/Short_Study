import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "../theme";
import { activeSentenceIndex, sentenceWindows } from "./sentenceWindows";

export const IntroCaptions: React.FC<{ text: string; durationInFrames: number }> = ({
  text,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const windows = sentenceWindows(text, durationInFrames, fps);
  if (windows.length === 0) return null;
  const active = windows[activeSentenceIndex(windows, frame)];

  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        bottom: 26,
        padding: "13px 32px",
        borderRadius: theme.radius,
        backgroundColor: theme.plate,
        border: `2px solid ${withAlpha(theme.ink, 0.12)}`,
        color: theme.ink,
        fontFamily: theme.fontFamily,
        fontSize: 31,
        fontWeight: 700,
        lineHeight: 1.45,
        textAlign: "center",
        boxShadow: `0 10px 32px ${withAlpha(theme.ink, 0.12)}`,
        // 差し替わった瞬間に前の文が残像として読まれないよう、文ごとに立ち上げ直す。
        opacity: interpolate(frame, [active.start, active.start + fps * 0.2], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
      }}
    >
      {active.text}
    </div>
  );
};
