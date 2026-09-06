import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme } from "../theme";
import { Axes, ChartCaption } from "./Axes";
import { HEIGHT, PAD, WIDTH, niceTicks, scaleX, scaleY } from "./scale";
import { compileExpression } from "../math/expression";
import type { SceneVisual } from "../../types";

type Data = Extract<SceneVisual, { kind: "scatter" }>;

/**
 * 散布図. Points land one after another so the cloud builds up rather than
 * appearing whole — the shape of the scatter is the thing being read, and a
 * cloud that assembles gives the eye time to see it forming.
 *
 * The trend line is optional and comes last, drawn through the same safe
 * expression evaluator the function plots use.
 */
export const Scatter: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const [xMin, xMax] = data.xRange;
  const [yMin, yMax] = data.yRange;
  const x = scaleX(xMin, xMax);
  const y = scaleY(yMin, yMax);

  const settled = 1.0 + data.points.length * 0.05 + 0.4;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      fontFamily={theme.fontFamily}
    >
      <Axes
        x={x}
        y={y}
        xTicks={niceTicks(xMin, xMax, 5)}
        yDomain={[yMin, yMax]}
        unit={data.xLabel}
      />

      {data.yLabel ? (
        <text
          x={PAD.left - 20}
          y={PAD.top - 18}
          fill={theme.inkDim}
          fontSize={30}
          fontWeight={700}
          textAnchor="start"
        >
          {data.yLabel}
        </text>
      ) : null}

      {data.points.map((point, index) => {
        const start = (1.0 + index * 0.05) * fps;
        const pop = clamped(
          frame,
          [start, start + 0.3 * fps],
          [0, 1],
          theme.easing,
        );

        return (
          <circle
            key={index}
            cx={x(point.x)}
            cy={y(point.y)}
            r={11 * pop}
            fill={accent}
            stroke={theme.bgDeep}
            strokeWidth={3}
            opacity={pop}
          />
        );
      })}

      {/* Correlation, once the cloud is complete. */}
      {data.trend
        ? (() => {
            const draw = clamped(
              frame,
              [settled * fps, (settled + 0.6) * fps],
              [0, 1], theme.easing);
            const line = compileExpression(data.trend);
            if (!line) {
              return null;
            }
            const left = line(xMin);
            const right = line(xMax);
            if (!Number.isFinite(left) || !Number.isFinite(right)) {
              return null;
            }
            return (
              <line
                x1={x(xMin)}
                y1={y(left)}
                x2={x(xMin) + (x(xMax) - x(xMin)) * draw}
                y2={y(left) + (y(right) - y(left)) * draw}
                stroke={theme.ink}
                strokeWidth={5}
                strokeDasharray="16 12"
              />
            );
          })()
        : null}

      <ChartCaption text={data.caption} accent={accent} delay={settled} />
    </svg>
  );
};
