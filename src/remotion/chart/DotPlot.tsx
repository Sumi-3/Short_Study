import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme } from "../theme";
import { Axes, ChartCaption, MarkLines } from "./Axes";
import { HEIGHT, PAD, WIDTH, niceTicks, plotHeight, scaleX } from "./scale";
import type { SceneVisual } from "../../types";

type Data = Extract<SceneVisual, { kind: "dot" }>;

/**
 * 数直線上の dot plot。各値を1つの dot で表し、同じ値は積み上げる。
 *
 * 3つの平均を読み取るための図である。mode は最も高い stack、median は中央の dot、mean は
 * 数直線が釣り合う位置になる。histogram は grouping してこれを隠すが、ここでは各 data point を
 * 個別のまま保つ。
 */
export const DotPlot: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const lowest = Math.min(...data.values);
  const highest = Math.max(...data.values);
  const pad = (highest - lowest || 1) * 0.12;
  const x = scaleX(lowest - pad, highest + pad);
  const baseline = HEIGHT - PAD.bottom;

  // 値順で下から stack を組み、各 dot が同値の dot がすでに何個下にあるか分かるよう sort する。
  const seen = new Map<number, number>();
  const stacked = [...data.values]
    .sort((a, b) => a - b)
    .map((value) => {
      const level = seen.get(value) ?? 0;
      seen.set(value, level + 1);
      return { value, level };
    });

  // 最も高い stack を基準にサイズを決め、少数の値でも axis 沿いに縮こまらず chart を満たす。
  const tallest = Math.max(...seen.values());
  const step = Math.min(56, (plotHeight * 0.72) / tallest);
  const radius = step * 0.4;
  const stackTop = HEIGHT - PAD.bottom - step * tallest;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      fontFamily={theme.fontFamily}
    >
      <Axes
        x={x}
        y={() => 0}
        xTicks={niceTicks(lowest, highest, 6)}
        yDomain={null}
        valueAxis={false}
        unit={data.unit}
      />

      {stacked.map((dot, index) => {
        const start = (1.0 + index * 0.07) * fps;
        const drop = clamped(
          frame,
          [start, start + 0.32 * fps],
          [0, 1],
          theme.easing,
        );
        const resting = baseline - step / 2 - dot.level * step;

        return (
          <circle
            key={index}
            cx={x(dot.value)}
            // その場で fade in させず、最後の60pxを落下して所定位置に収める。
            cy={resting - 60 * (1 - drop)}
            r={radius}
            fill={accent}
            opacity={drop}
          />
        );
      })}

      <MarkLines
        marks={data.marks}
        x={x}
        baseline={baseline}
        top={Math.max(PAD.top + 44, stackTop - 70)}
        delay={1.0 + stacked.length * 0.07 + 0.3}
      />

      <ChartCaption
        text={data.caption}
        accent={accent}
        delay={1.0 + stacked.length * 0.07 + 0.3}
      />
    </svg>
  );
};
