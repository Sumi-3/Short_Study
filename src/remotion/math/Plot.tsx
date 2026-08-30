import { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "../theme";
import { compileExpression } from "./expression";

export type PlotCurve = {
  expr: string;
  /** y(t) when the curve is parametric; `expr` is then x(t). */
  exprY: string | null;
  label: string;
  /** Which side of the curve belongs to the shaded region. */
  region: "above" | "below" | null;
};

export type PlotData = {
  xRange: [number, number];
  yRange: [number, number];
  curves: PlotCurve[];
  tRange: [number, number] | null;
  /** Area under the first curve, for integrals. Empty tuple means none. */
  shade: [number, number] | null;
  points: { x: number; y: number; label: string }[];
};

const WIDTH = 904;
const HEIGHT = 800;
const PAD = 46;
const SAMPLES = 240;


/** Nice-ish tick step so a range like [-3, 3] gets 1s, not 0.6s. */
const tickStep = (span: number) => {
  const raw = span / 6;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return nice * magnitude;
};

const ticks = (min: number, max: number) => {
  const step = tickStep(max - min);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
  }
  return out;
};

/**
 * A coordinate plane with one or more function curves, drawn as SVG.
 *
 * The curve reveals left-to-right by trimming the sampled path rather than by
 * animating `stroke-dashoffset`: dash animation depends on the browser's own
 * path measurement, and trimming keeps the frame a pure function of the frame
 * number, which is what Remotion needs.
 */
export const Plot: React.FC<{ data: PlotData; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // Skip the scene's own accent so the curves stay distinguishable from it.
  const curveColors = theme.accents.filter((c) => c !== accent);

  const plotWidth = WIDTH - PAD * 2;
  const plotHeight = HEIGHT - PAD * 2;

  /**
   * The window actually drawn.
   *
   * A function plot stretches each axis independently to fill the frame, which
   * is right: nothing about `y = x²` depends on the two axes sharing a scale.
   * A circle is the opposite — drawn on stretched axes it is an ellipse, and
   * the picture then contradicts the equation next to it.
   *
   * So the scale is made uniform whenever roundness is at stake: a parametric
   * curve is always a shape rather than a graph, and equal x and y spans are
   * how someone asks for a square window.
   */
  const [xMin, xMax, yMin, yMax] = useMemo(() => {
    const [x0, x1] = data.xRange;
    const [y0, y1] = data.yRange;
    const uniform =
      data.curves.some((curve) => curve.exprY) ||
      Math.abs((x1 - x0) - (y1 - y0)) < Math.abs(x1 - x0) * 0.01;

    if (!uniform) {
      return [x0, x1, y0, y1];
    }

    const scale = Math.min(plotWidth / (x1 - x0), plotHeight / (y1 - y0));
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    const halfX = plotWidth / scale / 2;
    const halfY = plotHeight / scale / 2;
    return [midX - halfX, midX + halfX, midY - halfY, midY + halfY];
  }, [data.xRange, data.yRange, data.curves, plotWidth, plotHeight]);

  const toX = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const toY = (y: number) => HEIGHT - PAD - ((y - yMin) / (yMax - yMin)) * plotHeight;

  const compiled = useMemo(
    () =>
      data.curves
        .map((curve) =>
          curve.exprY
            ? {
                ...curve,
                fn: null,
                // Parametric: both coordinates are functions of t.
                x: compileExpression(curve.expr, "t"),
                y: compileExpression(curve.exprY, "t"),
              }
            : {
                ...curve,
                fn: compileExpression(curve.expr),
                x: null,
                y: null,
              },
        )
        .filter((curve) => curve.fn || (curve.x && curve.y)),
    [data.curves],
  );

  const [tMin, tMax] = data.tRange ?? [0, Math.PI * 2];

  /**
   * The region satisfying every inequality, as one polygon per run of columns
   * where it is non-empty.
   *
   * Solved column by column rather than by scanning the plane: each constraint
   * is `y > f(x)` or `y < f(x)`, so at a given x the region is a single
   * interval and intersecting them is just tightening a bound. The runs are
   * what handle a region that is in two pieces, as a pair of inequalities on a
   * parabola can be.
   */
  const regionPolygons = useMemo(() => {
    const constraints = compiled.filter((curve) => curve.region && curve.fn);
    if (constraints.length === 0) {
      return [];
    }

    const [from, to] = data.shade ?? [xMin, xMax];
    const polygons: string[][] = [];
    let upper: string[] = [];
    let lower: string[] = [];

    const close = () => {
      if (upper.length > 1) {
        polygons.push([...upper, ...lower.reverse()]);
      }
      upper = [];
      lower = [];
    };

    for (let i = 0; i <= SAMPLES; i++) {
      const x = from + ((to - from) * i) / SAMPLES;
      let low = yMin;
      let high = yMax;
      let usable = true;

      for (const constraint of constraints) {
        const value = constraint.fn!(x);
        if (!Number.isFinite(value)) {
          usable = false;
          break;
        }
        if (constraint.region === "above") {
          low = Math.max(low, value);
        } else {
          high = Math.min(high, value);
        }
      }

      if (!usable || high <= low) {
        close();
        continue;
      }
      upper.push(`${toX(x)},${toY(high)}`);
      lower.push(`${toX(x)},${toY(low)}`);
    }
    close();

    return polygons;
  }, [compiled, data.shade, xMin, xMax, yMin, yMax]);

  const axesProgress = interpolate(frame, [0, 0.7 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: theme.easing,
  });

  const zeroY = yMin <= 0 && yMax >= 0 ? toY(0) : null;
  const zeroX = xMin <= 0 && xMax >= 0 ? toX(0) : null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      // `meet` scales the plot to whatever the stage actually leaves it: full
      // width when the headline is short, smaller when it wraps. A fixed
      // `height: auto` would overflow the moment the box got shorter.
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {/* Grid */}
      <g stroke={withAlpha(theme.ink, 0.12)} strokeWidth={1}>
        {ticks(xMin, xMax).map((x) => (
          <line key={`gx${x}`} x1={toX(x)} y1={PAD} x2={toX(x)} y2={HEIGHT - PAD} />
        ))}
        {ticks(yMin, yMax).map((y) => (
          <line key={`gy${y}`} x1={PAD} y1={toY(y)} x2={WIDTH - PAD} y2={toY(y)} />
        ))}
      </g>

      {/* Axes, wiping outward from the origin */}
      <g stroke={withAlpha(theme.ink, 0.85)} strokeWidth={3} strokeLinecap="round">
        {zeroY !== null ? (
          <line
            x1={PAD}
            y1={zeroY}
            x2={PAD + (WIDTH - PAD * 2) * axesProgress}
            y2={zeroY}
          />
        ) : null}
        {zeroX !== null ? (
          <line
            x1={zeroX}
            y1={HEIGHT - PAD}
            x2={zeroX}
            y2={HEIGHT - PAD - (HEIGHT - PAD * 2) * axesProgress}
          />
        ) : null}
      </g>

      {/* Tick labels */}
      {zeroY !== null
        ? ticks(xMin, xMax)
            .filter((x) => x !== 0)
            .map((x) => (
              <text
                key={`tx${x}`}
                x={toX(x)}
                y={zeroY + 36}
                fill={withAlpha(theme.ink, 0.55)}
                fontSize={28}
                fontFamily={theme.fontFamily}
                textAnchor="middle"
                opacity={axesProgress}
              >
                {x}
              </text>
            ))
        : null}

      {zeroX !== null
        ? ticks(yMin, yMax)
            .filter((y) => y !== 0)
            .map((y) => (
              <text
                key={`ty${y}`}
                x={zeroX - 14}
                y={toY(y) + 9}
                fill={withAlpha(theme.ink, 0.55)}
                fontSize={28}
                fontFamily={theme.fontFamily}
                textAnchor="end"
                opacity={axesProgress}
              >
                {y}
              </text>
            ))
        : null}

      {/* Shaded area — the visual for an integral. When the scene describes a
          region instead, `shade` is its x-bound and the polygons above own the
          fill, so this stands down. */}
      {data.shade && compiled[0]?.fn && regionPolygons.length === 0
        ? (() => {
            const [from, to] = data.shade;
            const grow = interpolate(frame, [1.6 * fps, 2.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: theme.easing,
            });
            const end = from + (to - from) * grow;
            const steps = 80;
            const points: string[] = [`${toX(from)},${toY(0)}`];
            for (let i = 0; i <= steps; i++) {
              const x = from + ((end - from) * i) / steps;
              const y = compiled[0].fn!(x);
              if (Number.isFinite(y)) {
                points.push(`${toX(x)},${toY(y)}`);
              }
            }
            points.push(`${toX(end)},${toY(0)}`);
            return (
              <polygon
                points={points.join(" ")}
                fill={withAlpha(accent, 0.45)}
                stroke={withAlpha(accent, 0.9)}
                strokeWidth={2}
              />
            );
          })()
        : null}

      {/* The region an inequality describes, under the curves that bound it. */}
      {regionPolygons.map((polygon, index) => (
        <polygon
          key={`region${index}`}
          points={polygon.join(" ")}
          fill={withAlpha(accent, 0.28)}
          opacity={interpolate(frame, [1.6 * fps, 2.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          })}
        />
      ))}

      {/* Curves */}
      {compiled.map((curve, index) => {
        const color = curveColors[index % curveColors.length];
        const start = (0.8 + index * 0.5) * fps;
        const drawn = interpolate(frame, [start, start + 1.1 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        });

        // Break the path wherever the curve leaves the plotted window, so a
        // pole like 1/x does not get joined across the asymptote.
        const segments: string[][] = [[]];
        const visible = Math.round(SAMPLES * drawn);
        const slack = yMax - yMin;
        for (let i = 0; i <= visible; i++) {
          const at = i / SAMPLES;
          // A parametric curve is traced in t; a function is swept in x.
          const px = curve.fn
            ? xMin + (xMax - xMin) * at
            : curve.x!(tMin + (tMax - tMin) * at);
          const py = curve.fn
            ? curve.fn(px)
            : curve.y!(tMin + (tMax - tMin) * at);

          if (
            !Number.isFinite(px) ||
            !Number.isFinite(py) ||
            py < yMin - slack ||
            py > yMax + slack
          ) {
            if (segments[segments.length - 1].length > 0) {
              segments.push([]);
            }
            continue;
          }
          segments[segments.length - 1].push(`${toX(px)},${toY(py)}`);
        }

        return (
          <g key={curve.expr}>
            {segments
              .filter((segment) => segment.length > 1)
              .map((segment, segmentIndex) => (
                <polyline
                  key={segmentIndex}
                  points={segment.join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
          </g>
        );
      })}

      {/* Marked points — drawn last so nothing covers the answer. */}
      {/* Older manifests predate this field. */}
      {(data.points ?? []).map((point, index) => {
        const start = (1.9 + index * 0.35) * fps;
        const pop = interpolate(frame, [start, start + 0.45 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        });
        if (pop <= 0) {
          return null;
        }
        const cx = toX(point.x);
        const cy = toY(point.y);

        return (
          <g key={`${point.x},${point.y}`}>
            {/* A ring that shrinks onto the point, so the eye lands on it. */}
            <circle
              cx={cx}
              cy={cy}
              r={10 + 26 * (1 - pop)}
              fill="none"
              stroke={accent}
              strokeWidth={4}
              opacity={pop}
            />
            <circle cx={cx} cy={cy} r={11} fill={accent} opacity={pop} />
            {point.label ? (
              <text
                // Below-right: above-right collides with the x-axis and its
                // tick labels whenever the point sits close to y = 0.
                x={cx + 22}
                y={cy + 44}
                fill={accent}
                fontSize={32}
                fontWeight={700}
                fontFamily={theme.fontFamily}
                opacity={pop}
                // A dark outline keeps it readable wherever it lands.
                stroke={theme.bgDeep}
                strokeWidth={6}
                paintOrder="stroke"
              >
                {point.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Legend */}
      {compiled.map((curve, index) => {
        if (!curve.label) {
          return null;
        }
        const start = (1.4 + index * 0.5) * fps;
        return (
          <g
            key={`legend-${curve.expr}`}
            opacity={interpolate(frame, [start, start + 0.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          >
            <rect
              x={PAD}
              y={PAD - 34 + index * 40}
              width={26}
              height={8}
              rx={4}
              fill={curveColors[index % curveColors.length]}
            />
            <text
              x={PAD + 40}
              y={PAD - 24 + index * 40}
              fill={theme.ink}
              fontSize={30}
              fontWeight={700}
              fontFamily={theme.fontFamily}
            >
              {curve.label}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
};
