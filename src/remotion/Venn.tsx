import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { useTheme, withAlpha } from "./theme";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "venn" }>;

const WIDTH = 904;
const HEIGHT = 760;
const CX = WIDTH / 2;
const CY = HEIGHT / 2 - 10;

/**
 * Region ids, in the order the counts arrive. Fixed rather than derived from
 * the set names so the model has one thing to remember and the highlight ids
 * mean the same thing whatever the sets are called.
 */
const TWO = ["A", "AB", "B", "none"] as const;
const THREE = ["A", "B", "C", "AB", "BC", "AC", "ABC", "none"] as const;

/**
 * ベン図 for two or three sets.
 *
 * Each region is cut out with nested SVG masks — inside these circles, outside
 * those — rather than by drawing lens shapes by hand. Arc geometry for the
 * three-set case is genuinely fiddly and gets subtly wrong at the cusps, while
 * "inside A, inside B, outside C" is exactly what the region means and is
 * impossible to get wrong.
 */
export const Venn: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const pair = data.sets.length === 2;
  const radius = pair ? 210 : 190;
  const offset = pair ? 118 : 108;

  // Two side by side; three on the points of a triangle, the arrangement that
  // gives all seven regions a visible area.
  const centres = pair
    ? [
        { x: CX - offset, y: CY },
        { x: CX + offset, y: CY },
      ]
    : [
        { x: CX, y: CY - offset },
        { x: CX - offset * 0.92, y: CY + offset * 0.62 },
        { x: CX + offset * 0.92, y: CY + offset * 0.62 },
      ];

  const ids = pair ? TWO : THREE;

  /** Which circles a region is inside, by index. */
  const membership = (id: string) =>
    id === "none" ? [] : id.split("").map((letter) => letter.charCodeAt(0) - 65);

  /** Where a region's number sits. */
  const anchor = (id: string) => {
    if (id === "none") {
      return { x: WIDTH - 70, y: HEIGHT - 46 };
    }
    const inside = membership(id);
    const mean = {
      x: inside.reduce((sum, i) => sum + centres[i].x, 0) / inside.length,
      y: inside.reduce((sum, i) => sum + centres[i].y, 0) / inside.length,
    };
    if (inside.length === data.sets.length) {
      return { x: CX, y: pair ? CY : CY + offset * 0.12 };
    }
    // Push a partial region away from the middle so it lands in its own lobe.
    const dx = mean.x - CX;
    const dy = mean.y - CY;
    const length = Math.hypot(dx, dy) || 1;
    const push = inside.length === 1 ? radius * 0.55 : radius * 0.42;
    return { x: mean.x + (dx / length) * push, y: mean.y + (dy / length) * push };
  };

  const grow = clamped(frame, [0.5 * fps, 1.2 * fps], [0, 1], theme.easing);

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
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        fontFamily={theme.fontFamily}
      >
        <defs>
          {centres.map((centre, index) => (
            <g key={index}>
              <mask id={`in${index}`}>
                <rect width={WIDTH} height={HEIGHT} fill="black" />
                <circle cx={centre.x} cy={centre.y} r={radius} fill="white" />
              </mask>
              <mask id={`out${index}`}>
                <rect width={WIDTH} height={HEIGHT} fill="white" />
                <circle cx={centre.x} cy={centre.y} r={radius} fill="black" />
              </mask>
            </g>
          ))}
        </defs>

        {/* The answer region, tinted. Nested groups intersect the masks. */}
        {data.highlight
          .filter((id) => (ids as readonly string[]).includes(id))
          .map((id) => {
            const inside = membership(id);
            let element = (
              <rect
                width={WIDTH}
                height={HEIGHT}
                fill={withAlpha(accent, 0.45)}
                opacity={clamped(frame, [1.4 * fps, 2 * fps], [0, 1])}
              />
            );
            for (let index = 0; index < centres.length; index++) {
              const mask = inside.includes(index) ? `in${index}` : `out${index}`;
              element = <g mask={`url(#${mask})`}>{element}</g>;
            }
            return <g key={`hl${id}`}>{element}</g>;
          })}

        {/* The universal set. Without it the "neither" count floats in space
            with nothing to belong to. */}
        <rect
          x={8}
          y={8}
          width={WIDTH - 16}
          height={HEIGHT - 16}
          rx={16}
          fill="none"
          stroke={withAlpha(theme.ink, 0.35)}
          strokeWidth={4}
          opacity={grow}
        />
        <text
          x={26}
          y={54}
          fill={theme.inkDim}
          fontSize={38}
          fontWeight={900}
          opacity={grow}
        >
          U
        </text>

        {centres.map((centre, index) => (
          <circle
            key={`c${index}`}
            cx={centre.x}
            cy={centre.y}
            r={radius * grow}
            fill="none"
            stroke={theme.ink}
            strokeWidth={5}
          />
        ))}

        {/* Set names, outside their own circle. */}
        {data.sets.map((name, index) => {
          const centre = centres[index];
          const dx = centre.x - CX;
          const dy = centre.y - CY;
          const length = Math.hypot(dx, dy) || 1;
          return (
            <text
              key={`name${index}`}
              x={centre.x + (dx / length) * (radius + 40)}
              y={centre.y + (dy / length) * (radius + 40) + 14}
              fill={accent}
              fontSize={46}
              fontWeight={900}
              textAnchor="middle"
              opacity={grow}
              stroke={theme.bgDeep}
              strokeWidth={8}
              paintOrder="stroke"
            >
              {name}
            </text>
          );
        })}

        {ids.map((id, index) => {
          const count = data.counts[index];
          if (count === undefined || !Number.isFinite(count)) {
            return null;
          }
          const at = anchor(id);
          const start = (1.5 + index * 0.14) * fps;

          return (
            <text
              key={`n${id}`}
              x={at.x}
              y={at.y + 14}
              fill={theme.ink}
              fontSize={44}
              fontWeight={900}
              textAnchor="middle"
              opacity={clamped(frame, [start, start + 0.3 * fps], [0, 1])}
              stroke={theme.bgDeep}
              strokeWidth={8}
              paintOrder="stroke"
            >
              {count}
            </text>
          );
        })}

        {data.caption ? (
          <text
            x={CX}
            y={HEIGHT - 8}
            fill={accent}
            fontSize={36}
            fontWeight={700}
            textAnchor="middle"
            opacity={clamped(frame, [2.2 * fps, 2.7 * fps], [0, 1])}
          >
            {data.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
