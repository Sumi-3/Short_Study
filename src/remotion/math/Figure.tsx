import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme, withAlpha } from "../theme";
import type { SceneVisual } from "../../types";
import { figureRoleColor } from "./figureRoleColor";

type FigureData = Extract<SceneVisual, { kind: "figure" }>;

const WIDTH = 904;
const HEIGHT = 800;
/** Room outside the figure for the labels that hang off its corners. */
const PAD = 78;

const RIGHT_ANGLE_TOLERANCE = 0.035; // ~2°

type Screen = { x: number; y: number };

/** Shortest signed turn from `from` to `to`, in (-π, π]. */
const shortestTurn = (from: number, to: number) => {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
};

/**
 * A plane-geometry diagram: labelled points, the segments and circles built
 * on them, and angle marks.
 *
 * The model supplies coordinates in whatever units suit the problem — this
 * fits them to the stage itself. The scale is deliberately **uniform** on both
 * axes, unlike `Plot`: a plot may stretch to use the space, but an equilateral
 * triangle that renders as a scalene one is simply wrong.
 *
 * Solids are drawn the way a textbook draws them: a flat projection with the
 * hidden edges dashed. That keeps the whole component 2-D.
 */
export const Figure: React.FC<{ data: FigureData; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const { at, project, scale: unitScale, centroid } = useMemo(() => {
    const byLabel = new Map(data.points.map((p) => [p.label, p]));

    // A circle reaches a radius past its centre in every direction, so the
    // extent it needs is part of the box the figure has to be fitted into.
    const spans = [
      ...data.points.map((p) => ({ x0: p.x, x1: p.x, y0: p.y, y1: p.y })),
      // Axes are meaningless if the origin is off the page.
      ...(data.axes ? [{ x0: 0, x1: 0, y0: 0, y1: 0 }] : []),
      // Early boolean manifests predate circles; an absent list must not
      // prevent their existing edges from rendering.
      ...(data.circles ?? []).flatMap((circle) => {
        const center = byLabel.get(circle.center);
        if (!center) {
          return [];
        }

        // An arc only reaches as far as it actually sweeps. Taking the whole
        // circle's extent would pad a quarter-circle sector out with three
        // quadrants of empty space and shrink it to a corner of the frame.
        const sweep = ((circle.toAngle - circle.fromAngle) % 360 + 360) % 360;
        const partial = circle.fromAngle !== circle.toAngle;
        const angles = partial
          ? [
              circle.fromAngle,
              circle.toAngle,
              // Whichever compass points the arc passes through are where it
              // reaches its extremes.
              ...[0, 90, 180, 270].filter(
                (cardinal) =>
                  ((cardinal - circle.fromAngle) % 360 + 360) % 360 <= sweep,
              ),
            ]
          : [0, 90, 180, 270];

        const reach = angles.map((degrees) => ({
          x: center.x + Math.cos((degrees * Math.PI) / 180) * circle.radius,
          y: center.y + Math.sin((degrees * Math.PI) / 180) * circle.radius,
        }));
        // A sector is closed back to its centre, so that counts too.
        if (partial && circle.sector) {
          reach.push({ x: center.x, y: center.y });
        }

        return reach.map((point) => ({
          x0: point.x,
          x1: point.x,
          y0: point.y,
          y1: point.y,
        }));
      }),
    ];

    const minX = Math.min(...spans.map((s) => s.x0));
    const maxX = Math.max(...spans.map((s) => s.x1));
    const minY = Math.min(...spans.map((s) => s.y0));
    const maxY = Math.max(...spans.map((s) => s.y1));
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    // A figure with no extent in one axis (three collinear points) must still
    // get a finite scale from the other one.
    const scale = Math.min(
      spanX > 0 ? (WIDTH - PAD * 2) / spanX : Infinity,
      spanY > 0 ? (HEIGHT - PAD * 2) / spanY : Infinity,
    );
    const safeScale = Number.isFinite(scale) ? scale : 1;

    const offsetX = (WIDTH - spanX * safeScale) / 2 - minX * safeScale;
    // Screen y grows downward; maths y grows up.
    const offsetY = (HEIGHT - spanY * safeScale) / 2 + maxY * safeScale;

    const byId = new Map<string, Screen>();
    for (const point of data.points) {
      byId.set(point.label, {
        x: point.x * safeScale + offsetX,
        y: offsetY - point.y * safeScale,
      });
    }

    const placed = [...byId.values()];
    const project = (x: number, y: number) => ({
      x: x * safeScale + offsetX,
      y: offsetY - y * safeScale,
    });
    return {
      at: (id: string) => byId.get(id) ?? null,
      project,
      // Radii are in the model's units and have to be scaled the same way.
      scale: safeScale,
      centroid: {
        x: placed.reduce((sum, p) => sum + p.x, 0) / (placed.length || 1),
        y: placed.reduce((sum, p) => sum + p.y, 0) / (placed.length || 1),
      },
    };
  }, [data.points, data.circles, data.axes]);

  /** Unit vector pointing away from the middle of the figure — where a label
   * can sit without landing on top of the drawing. */
  const outward = (from: Screen) => {
    const dx = from.x - centroid.x;
    const dy = from.y - centroid.y;
    const length = Math.hypot(dx, dy);
    return length < 1 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length };
  };

  const fade = (start: number, duration = 0.3) =>
    clamped(
      frame,
      [start * fps, (start + duration) * fps],
      [0, 1],
      theme.easing,
    );

  const segmentStart = (index: number) => 0.7 + index * 0.22;
  const lastSegmentEnd =
    segmentStart(Math.max(0, data.segments.length - 1)) + 0.4;

  const label = (text: string, position: Screen, color: string, size: number, opacity: number) => (
    <text
      x={position.x}
      y={position.y}
      fill={color}
      fontSize={size}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="middle"
      opacity={opacity}
      // Dark outline under every label so it stays readable wherever the
      // auto-placement puts it.
      stroke={theme.bgDeep}
      strokeWidth={7}
      paintOrder="stroke"
    >
      {text}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      fontFamily={theme.fontFamily}
    >
      {/* Coordinate axes, when the figure lives on the plane rather than
          floating free — a complex plane, a position vector, a graph. */}
      {data.axes
        ? (() => {
            const origin = project(0, 0);
            const show = fade(0.2, 0.5);
            return (
              <g opacity={show}>
                <line
                  x1={0}
                  y1={origin.y}
                  x2={WIDTH}
                  y2={origin.y}
                  stroke={theme.ink}
                  strokeOpacity={0.45}
                  strokeWidth={4}
                />
                <line
                  x1={origin.x}
                  y1={0}
                  x2={origin.x}
                  y2={HEIGHT}
                  stroke={theme.ink}
                  strokeOpacity={0.45}
                  strokeWidth={4}
                />
                <text
                  x={origin.x - 18}
                  y={origin.y + 38}
                  fill={theme.inkDim}
                  fontSize={30}
                  fontWeight={700}
                  textAnchor="end"
                >
                  O
                </text>
              </g>
            );
          })()
        : null}

      {/* The face or region the scene is actually about. */}
      {data.highlight.length >= 3
        ? (() => {
            const corners = data.highlight
              .map(at)
              .filter((point): point is Screen => point !== null);
            if (corners.length < 3) {
              return null;
            }
            return (
              <polygon
                points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill={withAlpha(accent, 0.18)}
                opacity={fade(0.6, 0.5)}
              />
            );
          })()
        : null}

      {/* Circles, drawn the way a compass draws them: starting at the top and
          sweeping round. */}
      {(data.circles ?? []).map((circle, index) => {
        const center = at(circle.center);
        if (!center) {
          return null;
        }
        const radius = circle.radius * unitScale;
        const circumference = 2 * Math.PI * radius;
        // Maths angles run anticlockwise; screen y runs down, so they negate.
        const whole = circle.fromAngle === circle.toAngle;
        const a0 = (-circle.fromAngle * Math.PI) / 180;
        const a1 = (-circle.toAngle * Math.PI) / 180;
        const onCircle = (angle: number) => ({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
        const sweepDegrees =
          ((circle.toAngle - circle.fromAngle) % 360 + 360) % 360;
        const largeArc = sweepDegrees > 180 ? 1 : 0;
        const arcPath = `M ${onCircle(a0).x} ${onCircle(a0).y} A ${radius} ${radius} 0 ${largeArc} 0 ${
          onCircle(a1).x
        } ${onCircle(a1).y}`;
        const start = 0.55 + index * 0.3;
        const sweep = clamped(
          frame,
          [start * fps, (start + 0.65) * fps],
          [0, 1], theme.easing);
        const outwards = outward(center);

        if (!whole) {
          return (
            <g key={`c${index}`} opacity={sweep}>
              {circle.sector ? (
                <path
                  d={`${arcPath} L ${center.x} ${center.y} Z`}
                  fill={withAlpha(accent, 0.22)}
                  stroke={accent}
                  strokeWidth={4}
                />
              ) : (
                <path
                  d={arcPath}
                  fill="none"
                  stroke={accent}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
              )}
              {circle.label
                ? label(
                    circle.label,
                    {
                      x: center.x + Math.cos((a0 + a1) / 2) * (radius + 40),
                      y: center.y + Math.sin((a0 + a1) / 2) * (radius + 40),
                    },
                    accent,
                    36,
                    1,
                  )
                : null}
            </g>
          );
        }

        return (
          <g key={`c${index}`}>
            <circle
              cx={center.x}
              cy={center.y}
              r={radius}
              fill="none"
              stroke={theme.ink}
              strokeWidth={5}
              // A dashed circle already owns the dash pattern, so it fades in
              // rather than being drawn.
              {...(circle.dashed
                ? { strokeDasharray: "14 12", opacity: sweep }
                : {
                    strokeDasharray: circumference,
                    strokeDashoffset: circumference * (1 - sweep),
                    transform: `rotate(-90 ${center.x} ${center.y})`,
                  })}
            />
            {circle.label
              ? label(
                  circle.label,
                  {
                    x: center.x + outwards.x * (radius + 34),
                    y: center.y + outwards.y * (radius + 34),
                  },
                  theme.ink,
                  36,
                  fade(start + 0.5),
                )
              : null}
          </g>
        );
      })}

      {/* Segments, drawn growing from their first endpoint. Emphasised ones go
          last so they sit on top of whatever they cross. */}
      {[...data.segments]
        .map((segment, index) => ({ segment, index }))
        .sort((a, b) => Number(Boolean(a.segment.emphasis)) - Number(Boolean(b.segment.emphasis)))
        .map(({ segment, index }) => {
          const from = at(segment.from);
          const to = at(segment.to);
          if (!from || !to) {
            return null;
          }

          const start = segmentStart(index);
          const grow = clamped(
            frame,
            [start * fps, (start + 0.4) * fps],
            [0, 1], theme.easing);
          const tip = {
            x: from.x + (to.x - from.x) * grow,
            y: from.y + (to.y - from.y) * grow,
          };
          const color = segment.emphasis
            // Boolean manifests used the scene's rotating accent. Numeric
            // roles stay fixed across scenes so corresponding edges retain
            // their identity as the explanation moves to the next step.
            ? segment.emphasis === true ? accent : figureRoleColor(theme, segment.emphasis)
            : segment.dashed
              ? theme.inkDim
              : theme.ink;

          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const along = { x: Math.cos(angle), y: Math.sin(angle) };
          const across = { x: -along.y, y: along.x };
          const head = segment.arrow ? 26 : 0;
          const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const push = outward(middle);

          return (
            <g key={`s${index}`}>
              <line
                x1={from.x}
                y1={from.y}
                // An arrowhead is drawn as a filled triangle, so the line stops
                // short of the point rather than poking through the tip.
                x2={tip.x - along.x * head * grow}
                y2={tip.y - along.y * head * grow}
                stroke={color}
                strokeWidth={segment.emphasis ? 9 : 5}
                strokeLinecap="round"
                // Dashed edges are the hidden ones in a solid's projection.
                strokeDasharray={segment.dashed ? "14 12" : undefined}
              />
              {segment.arrow && grow > 0.9 ? (
                <polygon
                  points={[
                    `${tip.x},${tip.y}`,
                    `${tip.x - along.x * 30 + across.x * 13},${
                      tip.y - along.y * 30 + across.y * 13
                    }`,
                    `${tip.x - along.x * 30 - across.x * 13},${
                      tip.y - along.y * 30 - across.y * 13
                    }`,
                  ].join(" ")}
                  fill={color}
                />
              ) : null}

              {/* Equal-length marks. Two segments carrying the same number of
                  strokes are the same length — the notation a congruence proof
                  is actually written in. */}
              {grow > 0.95
                ? Array.from({ length: segment.ticks }, (_, tick) => {
                    const spread = (tick - (segment.ticks - 1) / 2) * 14;
                    const cx = middle.x + along.x * spread;
                    const cy = middle.y + along.y * spread;
                    return (
                      <line
                        key={tick}
                        x1={cx + across.x * 13}
                        y1={cy + across.y * 13}
                        x2={cx - across.x * 13}
                        y2={cy - across.y * 13}
                        stroke={color}
                        strokeWidth={5}
                        strokeLinecap="round"
                      />
                    );
                  })
                : null}
              {segment.label
                ? label(
                    segment.label,
                    { x: middle.x + push.x * 34, y: middle.y + push.y * 34 },
                    color,
                    36,
                    fade(start + 0.35),
                  )
                : null}
            </g>
          );
        })}

      {/* Angle marks — a square for a right angle, an arc otherwise. */}
      {data.angles.map((angle, index) => {
        const vertex = at(angle.at);
        const a = at(angle.from);
        const b = at(angle.to);
        if (!vertex || !a || !b) {
          return null;
        }

        const from = Math.atan2(a.y - vertex.y, a.x - vertex.x);
        const turn = shortestTurn(from, Math.atan2(b.y - vertex.y, b.x - vertex.x));
        const isRight = Math.abs(Math.abs(turn) - Math.PI / 2) < RIGHT_ANGLE_TOLERANCE;
        const opacity = fade(lastSegmentEnd + index * 0.15);

        const radius = 48;
        const bisector = from + turn / 2;
        const labelAt = {
          x: vertex.x + Math.cos(bisector) * (radius + 34),
          y: vertex.y + Math.sin(bisector) * (radius + 34),
        };

        const mark = isRight
          ? (() => {
              const size = 30;
              const u = { x: Math.cos(from) * size, y: Math.sin(from) * size };
              const v = {
                x: Math.cos(from + turn) * size,
                y: Math.sin(from + turn) * size,
              };
              return (
                <polyline
                  points={[
                    `${vertex.x + u.x},${vertex.y + u.y}`,
                    `${vertex.x + u.x + v.x},${vertex.y + u.y + v.y}`,
                    `${vertex.x + v.x},${vertex.y + v.y}`,
                  ].join(" ")}
                  fill="none"
                  stroke={accent}
                  strokeWidth={4}
                />
              );
            })()
          : (
              <g>
                {/* Concentric arcs, the notation for "these angles are equal". */}
                {/* Before equal-angle ticks existed, every marked angle had
                    one arc. Keep that notation when reading those manifests. */}
                {Array.from({ length: Math.max(1, angle.ticks ?? 0) }, (_, tick) => {
                  const r = radius + tick * 14;
                  return (
                    <path
                      key={tick}
                      d={`M ${vertex.x + Math.cos(from) * r} ${
                        vertex.y + Math.sin(from) * r
                      } A ${r} ${r} 0 0 ${turn > 0 ? 1 : 0} ${
                        vertex.x + Math.cos(from + turn) * r
                      } ${vertex.y + Math.sin(from + turn) * r}`}
                      fill="none"
                      stroke={accent}
                      strokeWidth={4}
                    />
                  );
                })}
              </g>
            );

        return (
          <g key={`a${index}`} opacity={opacity}>
            {mark}
            {angle.label && !isRight
              ? label(angle.label, labelAt, accent, 34, 1)
              : null}
          </g>
        );
      })}

      {/* Vertices last: their dots and names must never be covered. */}
      {data.points.map((point, index) => {
        const position = at(point.label);
        if (!position) {
          return null;
        }
        const opacity = fade(0.4 + index * 0.08, 0.25);
        const push = outward(position);

        return (
          <g key={`p${point.label}`}>
            <circle
              cx={position.x}
              cy={position.y}
              r={9}
              fill={theme.ink}
              opacity={opacity}
            />
            {label(
              point.label,
              { x: position.x + push.x * 38, y: position.y + push.y * 38 },
              theme.ink,
              40,
              opacity,
            )}
          </g>
        );
      })}
    </svg>
  );
};
