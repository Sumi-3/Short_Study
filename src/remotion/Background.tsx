import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useTheme, withAlpha } from "./theme";

/**
 * やわらかな色のにじみ。
 *
 * 以前は `filter: blur(160px)` をかけた単色の円だった。見た目は同じでも、全画面の
 * blur を毎フレーム3回計算するため、レンダー時間の74%を占めていた。radial gradient
 * なら同じ減衰を一度で描けるため、65s の動画は168sから約44sになった。
 */
const Blob: React.FC<{
  color: string;
  /** 見えているにじみの直径。以前の円と blur の広がりを合わせた値。 */
  size: number;
  from: [number, number];
  to: [number, number];
  period: number;
  phase: number;
}> = ({ color, size, from, to, period, phase }) => {
  const frame = useCurrentFrame();
  const { wash } = useTheme();
  // 折り返し運動にしてループの継ぎ目をなくし、描画コストも抑える。
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
 * シーンの切れ目をまたいでも動きを連続させるため、各 Sequence の外に置く。
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
      {/* にじみを和らげ、文字の可読性を保つための veil。 */}
      <AbsoluteFill style={{ backgroundColor: theme.veil }} />
    </AbsoluteFill>
  );
};
