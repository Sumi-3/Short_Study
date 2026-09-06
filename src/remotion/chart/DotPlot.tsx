import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme } from "../theme";
import { Axes, ChartCaption, MarkLines } from "./Axes";
import { HEIGHT, PAD, WIDTH, niceTicks, plotHeight, scaleX } from "./scale";
import type { SceneVisual } from "../../types";

type Data = Extract<SceneVisual, { kind: "dot" }>;

/**
 * A dot plot on a number line: every value is one dot, and equal values stack.
 *
 * This is the picture the three averages are read off — the mode is the tallest
 * stack, the median is the middle dot, the mean is where the line would
 * balance. A histogram hides that by grouping; here every data point is still
 * an individual.
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

  // Sorted so the stacks build bottom-up in value order, and so each dot knows
  // how many identical values already sit under it.
  const seen = new Map<number, number>();
  const stacked = [...data.values]
    .sort((a, b) => a - b)
    .map((value) => {
      const level = seen.get(value) ?? 0;
      seen.set(value, level + 1);
      return { value, level };
    });

  // Sized from the tallest stack, so a handful of values fills the chart
  // instead of huddling along the axis.
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
            // Falls the last 60px into place rather than fading in on the spot.
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
