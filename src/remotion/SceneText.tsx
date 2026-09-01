import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { shadowOf, useTheme } from "./theme";
import { SceneShell } from "./SceneShell";
import type { Scene } from "../types";

const Bullet: React.FC<{
  text: string;
  index: number;
  accent: string;
}> = ({ text, index, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // Staggered so the list builds in time with the narration.
  const start = (0.9 + index * 0.45) * fps;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        opacity: interpolate(frame, [start, start + 0.4 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
        translate: interpolate(
          frame,
          [start, start + 0.55 * fps],
          ["0px 36px", "0px 0px"],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          },
        ),
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
        {text}
      </div>
    </div>
  );
};

/**
 * Hook, summary and bullet-list scenes — anything whose visual is words.
 * Scenes with no `visual` payload land here too, showing only the headline.
 */
export const SceneText: React.FC<{
  scene: Scene;
  durationInFrames: number;
  accent: string;
  problem?: { text: string; label: string; unit: string };
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
