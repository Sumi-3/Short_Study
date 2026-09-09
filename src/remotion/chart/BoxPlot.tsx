import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { accentFor, useTheme, withAlpha } from "../theme";
import { Axes, ChartCaption } from "./Axes";
import { HEIGHT, PAD, WIDTH, niceTicks, scaleX } from "./scale";
import type { SceneVisual } from "../../types";

type Data = Extract<SceneVisual, { kind: "box" }>;

/**
 * 共通の数直線に横向きで描く箱ひげ図。日本の教科書で使う向きであり、2つまたは3つの data set を
 * 重ねるだけで比較できる。
 *
 * 描く順序そのものが説明になる。whisker が両端の極値へ伸び、box が中央半分を閉じ、最後に median が
 * その内側へ現れる。これは5数要約を読む順序でもある。
 */
export const BoxPlot: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const lows = data.boxes.map((box) => box.min);
  const highs = data.boxes.map((box) => box.max);
  const span = Math.max(...highs) - Math.min(...lows) || 1;
  const from = Math.min(...lows) - span * 0.12;
  const to = Math.max(...highs) + span * 0.12;

  const x = scaleX(from, to);
  const rows = data.boxes.length;
  const band = (HEIGHT - PAD.top - PAD.bottom) / rows;
  const boxHeight = Math.min(150, band * 0.52);

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
        xTicks={niceTicks(from, to, 5)}
        yDomain={null}
        valueAxis={false}
        unit={data.unit}
      />

      {data.boxes.map((box, index) => {
        const middle = PAD.top + band * (index + 0.5);
        const colour = rows === 1 ? accent : accentFor(theme, index);
        const start = (1.0 + index * 0.5) * fps;

        const step = (offset: number, length = 0.4) =>
          clamped(
            frame,
            [start + offset * fps, start + (offset + length) * fps],
            [0, 1], theme.easing);

        const whisker = step(0);
        const boxGrow = step(0.35);
        const median = step(0.75, 0.3);

        const centre = (x(box.q1) + x(box.q3)) / 2;
        const halfWidth = ((x(box.q3) - x(box.q1)) / 2) * boxGrow;

        return (
          <g key={index}>
            {box.label ? (
              <text
                x={PAD.left - 20}
                y={middle + 11}
                fill={theme.inkDim}
                fontSize={32}
                fontWeight={700}
                textAnchor="end"
                opacity={whisker}
              >
                {box.label}
              </text>
            ) : null}

            {/* 中央から両端の極値へ伸びる whisker。 */}
            <line
              x1={centre - (centre - x(box.min)) * whisker}
              y1={middle}
              x2={centre + (x(box.max) - centre) * whisker}
              y2={middle}
              stroke={colour}
              strokeWidth={5}
            />
            {[box.min, box.max].map((end) => (
              <line
                key={end}
                x1={x(end)}
                y1={middle - boxHeight * 0.3}
                x2={x(end)}
                y2={middle + boxHeight * 0.3}
                stroke={colour}
                strokeWidth={5}
                opacity={whisker}
              />
            ))}

            <rect
              x={centre - halfWidth}
              y={middle - boxHeight / 2}
              width={halfWidth * 2}
              height={boxHeight}
              fill={withAlpha(colour, 0.28)}
              stroke={colour}
              strokeWidth={5}
              opacity={boxGrow}
            />
            <line
              x1={x(box.median)}
              y1={middle - (boxHeight / 2) * median}
              x2={x(box.median)}
              y2={middle + (boxHeight / 2) * median}
              stroke={colour}
              strokeWidth={8}
            />
          </g>
        );
      })}

      <ChartCaption text={data.caption} accent={accent} delay={1.6} />
    </svg>
  );
};
