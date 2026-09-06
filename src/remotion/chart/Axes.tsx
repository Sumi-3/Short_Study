import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme } from "../theme";
import {
  HEIGHT,
  PAD,
  WIDTH,
  niceTicks,
  tickLabel,
  type Scale,
} from "./scale";

/**
 * The frame every data chart sits in: two axes that sweep out, gridlines, and
 * the tick labels. Charts draw their marks on top once this has arrived.
 */
export const Axes: React.FC<{
  x: Scale;
  y: Scale;
  xTicks: number[] | null;
  yDomain: [number, number] | null;
  /** Suppresses the vertical axis for charts laid out along a number line. */
  valueAxis?: boolean;
  unit?: string;
}> = ({ x, y, xTicks, yDomain, valueAxis = true, unit = "" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const sweep = clamped(frame, [0.2 * fps, 0.8 * fps], [0, 1], theme.easing);
  const labels = clamped(frame, [0.7 * fps, 1.1 * fps], [0, 1]);

  const yTicks = yDomain ? niceTicks(yDomain[0], yDomain[1], 4) : [];

  return (
    <g>
      {yDomain
        ? yTicks.map((tick) => (
            <g key={`y${tick}`} opacity={labels}>
              <line
                x1={PAD.left}
                y1={y(tick)}
                x2={WIDTH - PAD.right}
                y2={y(tick)}
                stroke={theme.ink}
                strokeOpacity={0.14}
                strokeWidth={2}
              />
              <text
                x={PAD.left - 20}
                y={y(tick) + 12}
                fill={theme.inkDim}
                fontSize={30}
                fontWeight={700}
                textAnchor="end"
              >
                {tickLabel(tick)}
              </text>
            </g>
          ))
        : null}

      <line
        x1={PAD.left}
        y1={HEIGHT - PAD.bottom}
        x2={PAD.left + (WIDTH - PAD.left - PAD.right) * sweep}
        y2={HEIGHT - PAD.bottom}
        stroke={theme.ink}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {valueAxis ? (
        <line
          x1={PAD.left}
          y1={HEIGHT - PAD.bottom}
          x2={PAD.left}
          y2={HEIGHT - PAD.bottom - (HEIGHT - PAD.top - PAD.bottom) * sweep}
          stroke={theme.ink}
          strokeWidth={4}
          strokeLinecap="round"
        />
      ) : null}

      {(xTicks ?? []).map((tick) => (
        <g key={`x${tick}`} opacity={labels}>
          <line
            x1={x(tick)}
            y1={HEIGHT - PAD.bottom}
            x2={x(tick)}
            y2={HEIGHT - PAD.bottom + 12}
            stroke={theme.ink}
            strokeOpacity={0.5}
            strokeWidth={3}
          />
          <text
            x={x(tick)}
            y={HEIGHT - PAD.bottom + 50}
            fill={theme.inkDim}
            fontSize={30}
            fontWeight={700}
            textAnchor="middle"
          >
            {tickLabel(tick)}
          </text>
        </g>
      ))}

      {unit ? (
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 14}
          fill={theme.inkDim}
          fontSize={30}
          fontWeight={700}
          textAnchor="end"
          opacity={labels}
        >
          {unit}
        </text>
      ) : null}
    </g>
  );
};

/**
 * Mean / median / mode lines.
 *
 * Each label sits at the top of its own line and the lines are cut to
 * different heights, because the interesting case is exactly the one where two
 * of these coincide — a symmetric distribution puts the mean and the median at
 * the same value, and labels drawn at the same height would then overlap into
 * an unreadable smear.
 */
export const MarkLines: React.FC<{
  marks: readonly { value: number; label: string }[];
  x: Scale;
  baseline: number;
  /** Height of the first line; later ones stop progressively lower. */
  top: number;
  delay: number;
}> = ({ marks, x, baseline, top, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  return (
    <g>
      {marks.map((mark, index) => {
        const start = (delay + index * 0.35) * fps;
        const draw = clamped(
          frame,
          [start, start + 0.4 * fps],
          [0, 1],
          theme.easing,
        );
        const ceiling = top + index * 46;

        return (
          <g key={`${mark.label}${index}`} opacity={draw}>
            <line
              x1={x(mark.value)}
              y1={baseline}
              x2={x(mark.value)}
              y2={baseline - (baseline - ceiling) * draw}
              stroke={theme.ink}
              strokeWidth={5}
              strokeDasharray="12 10"
            />
            <text
              x={x(mark.value)}
              y={ceiling - 10}
              fill={theme.ink}
              fontSize={32}
              fontWeight={900}
              textAnchor="middle"
              stroke={theme.bgDeep}
              strokeWidth={7}
              paintOrder="stroke"
            >
              {mark.label}
            </text>
          </g>
        );
      })}
    </g>
  );
};

/** The line under every chart that names what it shows. */
export const ChartCaption: React.FC<{ text: string; accent: string; delay: number }> = ({
  text,
  accent,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  if (!text) {
    return null;
  }

  return (
    <text
      x={WIDTH / 2}
      y={PAD.top - 16}
      fill={accent}
      fontSize={36}
      fontWeight={700}
      textAnchor="middle"
      fontFamily={theme.fontFamily}
      opacity={clamped(frame, [delay * fps, (delay + 0.4) * fps], [0, 1])}
    >
      {text}
    </text>
  );
};
