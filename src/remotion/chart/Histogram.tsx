import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme, withAlpha } from "../theme";
import { Axes, ChartCaption, MarkLines } from "./Axes";
import { HEIGHT, PAD, WIDTH, scaleX, scaleY } from "./scale";
import type { SceneVisual } from "../../types";

type Data = Extract<SceneVisual, { kind: "histogram" }>;

/**
 * bar chart ではなく histogram。bar は接し、横軸は階級境界を tick に持つ数直線である。この違いが
 * 中1 データの活用の学習内容そのもので、bar 間に gap があれば階級が別々の category だと示してしまう。
 */
export const Histogram: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const bins = data.bins;
  const from = Math.min(...bins.map((bin) => bin.from));
  const to = Math.max(...bins.map((bin) => bin.to));
  const tallest = Math.max(...bins.map((bin) => bin.count), 1);

  const x = scaleX(from, to);
  const y = scaleY(0, tallest * 1.15);
  const baseline = HEIGHT - PAD.bottom;

  // すべての boundary を出し、階級幅が等しいと読み手に分かるようにする。
  const edges = [...new Set(bins.flatMap((bin) => [bin.from, bin.to]))].sort(
    (a, b) => a - b,
  );

  const marked = (bin: { from: number; to: number }) =>
    data.marks.some((mark) => mark.value >= bin.from && mark.value <= bin.to);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      fontFamily={theme.fontFamily}
    >
      <Axes x={x} y={y} xTicks={edges} yDomain={[0, tallest * 1.15]} unit={data.unit} />

      {bins.map((bin, index) => {
        const start = (1.1 + index * 0.12) * fps;
        const grow = clamped(
          frame,
          [start, start + 0.45 * fps],
          [0, 1],
          theme.easing,
        );
        const height = (baseline - y(bin.count)) * grow;

        return (
          <g key={index}>
            <rect
              x={x(bin.from)}
              y={baseline - height}
              width={Math.max(0, x(bin.to) - x(bin.from))}
              height={height}
              fill={withAlpha(accent, 0.75)}
              stroke={theme.bgDeep}
              strokeWidth={3}
            />
            {/* count は補助情報で、同じ bar を通る label 付き reference line の方が主役なので譲る。 */}
            {bin.count > 0 && grow > 0.7 && !marked(bin) ? (
              <text
                x={(x(bin.from) + x(bin.to)) / 2}
                y={baseline - height - 16}
                fill={theme.ink}
                fontSize={30}
                fontWeight={700}
                textAnchor="middle"
                opacity={interpolate(grow, [0.7, 1], [0, 1])}
              >
                {bin.count}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* mean、median、mode。histogram を画面に出す理由そのもの。 */}
      <MarkLines
        marks={data.marks}
        x={x}
        baseline={baseline}
        top={PAD.top + 30}
        delay={1.1 + bins.length * 0.12 + 0.3}
      />

      <ChartCaption text={data.caption} accent={accent} delay={1.4} />
    </svg>
  );
};
