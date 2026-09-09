import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useTheme, withAlpha } from "./theme";

/**
 * A soft colour wash.
 *
 * This used to be a solid circle behind `filter: blur(160px)`. That looked the
 * same but cost 74% of total render time — a full-frame blur pass, recomputed
 * every frame, three times over. A radial gradient paints the identical
 * falloff in one step, taking the 65s video from 168s to ~44s.
 */
const Blob: React.FC<{
  color: string;
  /** Diameter of the visible wash, i.e. the old circle plus its blur spread. */
  size: number;
  from: [number, number];
  to: [number, number];
  period: number;
  phase: number;
}> = ({ color, size, from, to, period, phase }) => {
  const frame = useCurrentFrame();
  const { wash } = useTheme();
  // Ping-pong so the loop never jumps, and stays cheap to render.
  const t = Math.abs((((frame + phase) % (period * 2)) / period) - 1);

  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: interpolate(t, [0, 1], [from[0], to[0]]),
        top: interpolate(t, [0, 1], [from[1], to[1]]),
        backgroundImage: `radial-gradient(closest-side, ${withAlpha(
          color,
          0.55 * wash,
        )} 0%, ${withAlpha(color, 0.34 * wash)} 38%, ${withAlpha(
          color,
          0.1 * wash,
        )} 68%, ${withAlpha(color, 0)} 100%)`,
      }}
    />
  );
};

/**
 * Lives outside the scene sequences so its motion is continuous across cuts.
 */
export const Background: React.FC = () => {
  const theme = useTheme();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        backgroundImage: `linear-gradient(160deg, ${theme.bg} 0%, ${theme.bgDeep} 100%)`,
        overflow: "hidden",
      }}
    >
      <Blob
        color={theme.accents[2]}
        size={1140}
        from={[-380, -40]}
        to={[-40, -220]}
        period={210}
        phase={0}
      />
      <Blob
        color={theme.accents[1]}
        size={1080}
        from={[460, 820]}
        to={[140, 1080]}
        period={260}
        phase={90}
      />
      <Blob
        color={theme.accents[4]}
        size={960}
        from={[260, 1520]}
        to={[-200, 1260]}
        period={180}
        phase={150}
      />
      {/* The veil softens the washes so text stays legible. */}
      <AbsoluteFill style={{ backgroundColor: theme.veil }} />
    </AbsoluteFill>
  );
};
