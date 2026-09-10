import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme, withAlpha } from "../theme";
import { compileExpression } from "./expression";
import { SvgLabel } from "./SvgLabel";
import { buildRegionPolygons, type PlotRegion } from "./plotRegions";

export type PlotCurve = {
  expr: string;
  /** curve が parametric のときの y(t)。その場合 `expr` は x(t)。 */
  exprY: string | null;
  label: string;
  /** between は shade の区間で2曲線の間、inside は閉曲線内部。 */
  region: PlotRegion | null;
};

export type PlotData = {
  xRange: [number, number];
  yRange: [number, number];
  curves: PlotCurve[];
  tRange: [number, number] | null;
  /** region 指定時は x 範囲。それ以外は最初の曲線と x 軸の間。 */
  shade: [number, number] | null;
  points: { x: number; y: number; label: string }[];
};

const WIDTH = 904;
const HEIGHT = 800;
const PAD = 46;
const SAMPLES = 240;

/** [-3, 3] のような range で0.6ではなく1刻みになる、ほどよい tick step。 */
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
 * 1本以上の function curve を持つ coordinate plane を SVG で描く。
 *
 * curve は `stroke-dashoffset` の animation でなく、sample 済み path を切って左から右へ出す。dash animation は
 * browser 自身の path 測定に依存するが、切り出しなら frame を frame number の純粋な関数にでき、これは
 * Remotion に必要な性質である。
 */
export const Plot: React.FC<{ data: PlotData; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // curve を scene 自身の accent と区別できるよう、その色は飛ばす。
  const curveColors = theme.accents.filter((c) => c !== accent);

  const plotWidth = WIDTH - PAD * 2;
  const plotHeight = HEIGHT - PAD * 2;

  /**
   * 実際に描く window。
   *
   * function plot は各 axis を独立に伸ばして frame を満たす。それで正しい。`y = x²` には両 axis が同じ
   * scale を共有すべき理由がない。一方 circle は逆で、伸ばした axis では ellipse になり、絵が横の式に
   * 矛盾する。
   *
   * そこで丸さが問題になる場合は scale を uniform にする。parametric curve は常に graph でなく shape であり、
   * x と y の span が等しいことは square window を求める表現でもある。
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
                // parametric では、両 coordinate が t の function になる。
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

  const hasRegion = data.curves.some((curve) => curve.region);
  const regionPolygons = useMemo(
    () => buildRegionPolygons(data, [xMin, xMax], [yMin, yMax]),
    [data, xMin, xMax, yMin, yMax],
  );

  const axesProgress = clamped(frame, [0, 0.7 * fps], [0, 1], theme.easing);

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
      // `meet` は stage が実際に残した大きさへ plot を scale する。headline が短ければ全幅、wrap すれば
      // 小さくなる。固定の `height: auto` では box が短くなった瞬間に overflow する。
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {/* grid */}
      <g stroke={withAlpha(theme.ink, 0.12)} strokeWidth={1}>
        {ticks(xMin, xMax).map((x) => (
          <line key={`gx${x}`} x1={toX(x)} y1={PAD} x2={toX(x)} y2={HEIGHT - PAD} />
        ))}
        {ticks(yMin, yMax).map((y) => (
          <line key={`gy${y}`} x1={PAD} y1={toY(y)} x2={WIDTH - PAD} y2={toY(y)} />
        ))}
      </g>

      {/* origin から外へ wipe する axis。 */}
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

      {/* tick label。 */}
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

      {/* region 指定時の shade は x 範囲。共通部分が空でも積分の塗りへ戻すと誤った領域になる。 */}
      {data.shade && compiled[0]?.fn && !hasRegion
        ? (() => {
            const [from, to] = data.shade;
            const grow = clamped(
              frame,
              [1.6 * fps, 2.6 * fps],
              [0, 1],
              theme.easing,
            );
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

      {/* 境界線を隠さないよう、領域を先に塗る。 */}
      {regionPolygons.map((polygon, index) => (
        <polygon
          key={`region${index}`}
          points={polygon.map(([x, y]) => `${toX(x)},${toY(y)}`).join(" ")}
          fill={withAlpha(accent, 0.28)}
          opacity={clamped(frame, [1.6 * fps, 2.3 * fps], [0, 1], theme.easing)}
        />
      ))}

      {/* curve。 */}
      {compiled.map((curve, index) => {
        const color = curveColors[index % curveColors.length];
        const start = (0.8 + index * 0.5) * fps;
        const drawn = clamped(
          frame,
          [start, start + 1.1 * fps],
          [0, 1],
          theme.easing,
        );

        // curve が描画 window を出る箇所で path を切り、1/x のような pole を asymptote 越しにつながない。
        const segments: string[][] = [[]];
        const visible = Math.round(SAMPLES * drawn);
        const slack = yMax - yMin;
        for (let i = 0; i <= visible; i++) {
          const at = i / SAMPLES;
          // parametric curve は t でたどり、function は x で走査する。
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

      {/* mark 済み point。answer を何も覆わないよう最後に描く。 */}
      {/* 旧 manifest はこの field 導入前のもの。 */}
      {(data.points ?? []).map((point, index) => {
        const start = (1.9 + index * 0.35) * fps;
        const pop = clamped(
          frame,
          [start, start + 0.45 * fps],
          [0, 1],
          theme.easing,
        );
        if (pop <= 0) {
          return null;
        }
        const cx = toX(point.x);
        const cy = toY(point.y);

        return (
          <g key={`${point.x},${point.y}`}>
            {/* point へ縮む ring。目線をその point に着地させる。 */}
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
              <SvgLabel
                text={point.label}
                // 右下に置く。point が y = 0 に近いと右上では x-axis とその tick label に衝突するため。
                x={cx + 22}
                y={cy + 44}
                color={accent}
                size={32}
                weight={700}
                fontFamily={theme.fontFamily}
                opacity={pop}
                // 着地位置を問わず読めるよう、暗い outline を置く。
                outline={{ color: theme.bgDeep, width: 6 }}
              />
            ) : null}
          </g>
        );
      })}

      {/* legend。 */}
      {compiled.map((curve, index) => {
        if (!curve.label) {
          return null;
        }
        const start = (1.4 + index * 0.5) * fps;
        return (
          <g
            key={`legend-${curve.expr}`}
            opacity={clamped(frame, [start, start + 0.4 * fps], [0, 1])}
          >
            <rect
              x={PAD}
              y={PAD - 34 + index * 40}
              width={26}
              height={8}
              rx={4}
              fill={curveColors[index % curveColors.length]}
            />
            <SvgLabel
              text={curve.label}
              x={PAD + 40}
              y={PAD - 24 + index * 40}
              color={theme.ink}
              size={30}
              weight={700}
              fontFamily={theme.fontFamily}
            />
          </g>
        );
      })}
    </svg>
    </div>
  );
};
