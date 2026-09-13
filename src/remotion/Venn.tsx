import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { useTheme, withAlpha } from "./theme";
import { SvgLabel } from "./math/SvgLabel";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "venn" }>;

const WIDTH = 904;
const HEIGHT = 760;
const CX = WIDTH / 2;
const CY = HEIGHT / 2 - 10;

/**
 * count が届く順の region id。set 名から導かず固定することで、model が覚えるものを1つにし、set の
 * 呼び名にかかわらず highlight id が同じ意味を持つようにする。
 */
const TWO = ["A", "AB", "B", "none"] as const;
const THREE = ["A", "B", "C", "AB", "BC", "AC", "ABC", "none"] as const;

/**
 * ベン図 for two or three sets.
 *
 * 各 region は lens shape を手で描かず、nested SVG mask で切り出す。すなわちこの circle の内側、
 * あの circle の外側という形である。3 set の arc geometry は本当に扱いづらく cusp で微妙に誤りやすいが、
 * "inside A, inside B, outside C" は region の意味そのもので間違えようがない。
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

  // 2つなら横並び、3つなら triangle の頂点に置く。7 region すべてに見える面積を与える配置である。
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

  /** region が内側にある circle を index で示す。 */
  const membership = (id: string) =>
    id === "none" ? [] : id.split("").map((letter) => letter.charCodeAt(0) - 65);

  /** region の number を置く位置。 */
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
    // 部分 region を中央から離し、専用の lobe に収める。
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

        {/* 色を付けた answer region。nested group が mask の intersection を作る。 */}
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

        {/* universal set。これがないと "neither" の count が、所属先のないまま空中に浮いてしまう。 */}
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

        {/* set 名は自身の circle の外に置く。 */}
        {data.sets.map((name, index) => {
          const centre = centres[index];
          const dx = centre.x - CX;
          const dy = centre.y - CY;
          const length = Math.hypot(dx, dy) || 1;
          return (
            <SvgLabel
              key={`name${index}`}
              text={name}
              x={centre.x + (dx / length) * (radius + 40)}
              y={centre.y + (dy / length) * (radius + 40) + 14}
              color={accent}
              size={46}
              weight={900}
              anchor="middle"
              opacity={grow}
              outline={{ color: theme.bgDeep, width: 8 }}
            />
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
          <SvgLabel
            text={data.caption}
            x={CX}
            y={HEIGHT - 28}
            color={accent}
            size={36}
            weight={700}
            anchor="middle"
            opacity={clamped(frame, [2.2 * fps, 2.7 * fps], [0, 1])}
          />
        ) : null}
      </svg>
    </div>
  );
};
