import { useId, useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { useTheme, withAlpha } from "../theme";
import { compileExpression } from "./expression";
import { SvgLabel } from "./SvgLabel";
import { MathText } from "../MathText";
import { buildRegionPolygons, type PlotRegion } from "./plotRegions";
import { parsePlotPointLabel } from "../../plotPointLabels";

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
  /** label の先頭に [coord] で座標、[guide] で両軸への補助線。併用・単独とも可。 */
  points: { x: number; y: number; label: string }[];
};

const WIDTH = 904;
const HEIGHT = 800;
const PAD = 46;
const LEGEND_BAND_HEIGHT = 76;
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
  const clipId = useId();
  // curve を scene 自身の accent と区別できるよう、その色は飛ばす。
  const curveColors = theme.accents.filter((c) => c !== accent);
  const hasLegend = data.curves.some((curve) => curve.label.trim());

  const plotWidth = WIDTH - PAD * 2;
  // 凡例は曲線と軸目盛りのどちらにも重ねない。label のない旧データには従来の描画域を残す。
  const plotBottom = HEIGHT - PAD - (hasLegend ? LEGEND_BAND_HEIGHT : 0);
  const plotHeight = plotBottom - PAD;

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
  const toY = (y: number) => plotBottom - ((y - yMin) / (yMax - yMin)) * plotHeight;

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
  const legendCurves = compiled
    .map((curve, index) => ({ curve, index }))
    .filter(({ curve }) => Boolean(curve.label.trim()));
  const legendCellWidth = legendCurves.length ? plotWidth / legendCurves.length : 0;

  const hasRegion = data.curves.some((curve) => curve.region);
  const regionPolygons = useMemo(
    () => buildRegionPolygons(data, [xMin, xMax], [yMin, yMax]),
    [data, xMin, xMax, yMin, yMax],
  );

  /**
   * 回転体の「どちらへ回すか」を示す印。
   *
   * 立体を描かずに済ませる。回転体の絵は普通シルエットで描くもので、陰影を付けると
   * 見せたい断面がかえって隠れる。ここでは断面の円を真横から見た楕円として置き、
   * その上を進む矢印だけで向きを伝える。3D を持ち込まないので追加の依存もない。
   */
  const revolve = useMemo(() => {
    const curve = compiled.find((entry) => entry.region === "revolve" && entry.fn);
    if (!curve || !data.shade) return null;
    const [from, to] = data.shade;
    /*
     * 置くのは区間の真ん中。最も太いところへ置くと、y=x のような単調な曲線では必ず
     * 端に寄り、塗った領域からはみ出して軸の目盛りに重なる。真ん中なら断面が領域の
     * 内側に収まり、大きさも半分で済む。
     */
    let at = (from + to) / 2;
    let radius = Math.abs(curve.fn!(at));
    if (!Number.isFinite(radius) || radius < (yMax - yMin) * 0.02) {
      // 真ん中が潰れている場合だけ、太いところを探し直す。
      radius = 0;
      for (let i = 0; i <= 40; i++) {
        const x = from + ((to - from) * i) / 40;
        const y = curve.fn!(x);
        if (Number.isFinite(y) && Math.abs(y) > radius) {
          radius = Math.abs(y);
          at = x;
        }
      }
    }
    if (radius === 0) return null;
    const cx = toX(at);
    const cy = toY(0);
    const ry = Math.abs(toY(radius) - cy);
    // 回転面を斜めから見た見かけの幅。1 にすると円になり、軸方向から見た絵になってしまう。
    const rx = ry * 0.3;
    return { cx, cy, rx, ry };
  }, [compiled, data.shade, xMin, xMax, yMin, yMax]);

  const axesProgress = clamped(frame, [0, 0.7 * fps], [0, 1], theme.easing);

  // 原点が window の外でも、最寄りの端に軸と名前を残して座標の意味を読めるようにする。
  const axisY = toY(Math.max(yMin, Math.min(yMax, 0)));
  const axisX = toX(Math.max(xMin, Math.min(xMax, 0)));
  // x 軸が下端に寄ると目盛りを通常どおり下へ出すと凡例帯を使ってしまう。
  const xAxisNearBottom = axisY > plotBottom - 48;
  const xTickLabelY = xAxisNearBottom ? axisY - 14 : axisY + 36;
  const xAxisLabelY = xAxisNearBottom ? axisY - 14 : axisY + 10;

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
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD} y={PAD} width={plotWidth} height={plotHeight} />
        </clipPath>
      </defs>
      {/* grid */}
      <g stroke={withAlpha(theme.ink, 0.12)} strokeWidth={1}>
        {ticks(xMin, xMax).map((x) => (
          <line key={`gx${x}`} x1={toX(x)} y1={PAD} x2={toX(x)} y2={plotBottom} />
        ))}
        {ticks(yMin, yMax).map((y) => (
          <line key={`gy${y}`} x1={PAD} y1={toY(y)} x2={WIDTH - PAD} y2={toY(y)} />
        ))}
      </g>

      {/* origin から外へ wipe する axis。 */}
      <g stroke={withAlpha(theme.ink, 0.85)} strokeWidth={3} strokeLinecap="round">
        <line
          x1={PAD}
          y1={axisY}
          x2={PAD + (WIDTH - PAD * 2) * axesProgress}
          y2={axisY}
        />
        <line
          x1={axisX}
          y1={plotBottom}
          x2={axisX}
          y2={plotBottom - plotHeight * axesProgress}
        />
      </g>

      {/* tick label。 */}
      {ticks(xMin, xMax)
        .filter((x) => x !== 0)
        .map((x) => (
          <text
            key={`tx${x}`}
            x={toX(x)}
            y={xTickLabelY}
            fill={withAlpha(theme.ink, 0.55)}
            fontSize={28}
            fontFamily={theme.fontFamily}
            textAnchor="middle"
            opacity={axesProgress}
          >
            {x}
          </text>
        ))}

      {ticks(yMin, yMax)
        .filter((y) => y !== 0)
        .map((y) => (
          <text
            key={`ty${y}`}
            x={axisX - 14}
            y={toY(y) + 9}
            fill={withAlpha(theme.ink, 0.55)}
            fontSize={28}
            fontFamily={theme.fontFamily}
            textAnchor="end"
            opacity={axesProgress}
          >
            {y}
          </text>
        ))}

      {/* 軸名は端の外側に置き、目盛りと window 内の曲線凡例から離す。 */}
      <g fill={theme.inkDim} fontSize={32} fontWeight={700} fontFamily={theme.fontFamily} opacity={axesProgress}>
        <text x={WIDTH - PAD + 18} y={xAxisLabelY}>x</text>
        <text x={axisX} y={PAD - 18} textAnchor="middle">y</text>
      </g>

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
                clipPath={`url(#${clipId})`}
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
          clipPath={`url(#${clipId})`}
          points={polygon.map(([x, y]) => `${toX(x)},${toY(y)}`).join(" ")}
          fill={withAlpha(accent, 0.28)}
          opacity={clamped(frame, [1.6 * fps, 2.3 * fps], [0, 1], theme.easing)}
        />
      ))}

      {/* SVG 全体の overflow は文字のために残し、線と塗りだけを window 内に収める。 */}
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
          <g key={curve.expr} clipPath={`url(#${clipId})`}>
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

      {/* 回転の向き。曲線を引き終えてから出す。 */}
      {revolve
        ? (() => {
            const { cx, cy, rx, ry } = revolve;
            const swept = clamped(
              frame,
              [2.2 * fps, 3.0 * fps],
              [0, 1],
              theme.easing,
            );
            if (swept <= 0) return null;
            // θ=0 を上端にし、手前側（右）へ回る向きを正にする。
            const point = (theta: number): [number, number] => [
              cx + rx * Math.sin(theta),
              cy - ry * Math.cos(theta),
            ];
            /*
             * 手前側を半周だけ描く。ほぼ一周させると楕円と重なって、時計回りなのか
             * 反時計回りなのかが読めなくなる。上から手前を通って下へ、で向きは足りる。
             */
            const span = Math.PI * swept;
            const steps = 64;
            const path = Array.from({ length: steps + 1 }, (_, i) =>
              point((span * i) / steps).map((v) => v.toFixed(2)).join(","),
            ).join(" ");
            // 矢じりは接線に合わせる。終点だけで向きを決めると、弧の曲がりと食い違う。
            const [hx, hy] = point(span);
            const [px, py] = point(span - 0.06);
            const angle = (Math.atan2(hy - py, hx - px) * 180) / Math.PI;
            return (
              <g opacity={Math.min(1, swept * 2)} clipPath={`url(#${clipId})`}>
                {/* 回転面そのもの。矢印だけでは、何の上を回っているのかが分からない。 */}
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill="none"
                  stroke={withAlpha(theme.ink, 0.28)}
                  strokeWidth={2}
                  strokeDasharray="7 7"
                />
                <polyline
                  points={path}
                  fill="none"
                  stroke={accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <polygon
                  points="0,0 -26,11 -26,-11"
                  fill={accent}
                  transform={`translate(${hx.toFixed(2)},${hy.toFixed(2)}) rotate(${angle.toFixed(2)})`}
                />
              </g>
            );
          })()
        : null}

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
        const label = parsePlotPointLabel(point.label);
        const text = label.coord
          ? `${label.text}${label.text ? " " : ""}(${point.x}, ${point.y})`
          : label.text;
        const annotated = label.coord || label.guide;
        const inWindow = Number.isFinite(cx) && Number.isFinite(cy) &&
          point.x >= xMin && point.x <= xMax && point.y >= yMin && point.y <= yMax;
        if (annotated && !inWindow) return null;
        // 長くなる座標は窓の内側に寄せる。旧ラベルの配置は保存済み動画のまま保つ。
        const left = annotated && cx > WIDTH / 2;

        return (
          <g key={`${point.x},${point.y}`}>
            <g clipPath={`url(#${clipId})`}>
              {label.guide ? (
                <g stroke={accent} strokeWidth={3} strokeDasharray="10 8" opacity={pop}>
                  {/* 原点が窓外のときの枠線は本来の軸ではないので、そこへの射影は描かない。 */}
                  {yMin <= 0 && yMax >= 0 && point.y !== 0 ? (
                    <line x1={cx} y1={cy} x2={cx} y2={cy + (toY(0) - cy) * pop} />
                  ) : null}
                  {xMin <= 0 && xMax >= 0 && point.x !== 0 ? (
                    <line x1={cx} y1={cy} x2={cx + (toX(0) - cx) * pop} y2={cy} />
                  ) : null}
                </g>
              ) : null}
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
            </g>
            {text ? (
              <SvgLabel
                text={text}
                // 点から離し、座標の長いラベルも右端・下端で欠けにくくする。
                x={cx + (left ? -22 : 22)}
                y={annotated && cy > plotBottom - 60 ? cy - 26 : cy + 44}
                anchor={left ? "end" : "start"}
                color={accent}
                size={32}
                weight={700}
                fontFamily={theme.fontFamily}
                opacity={pop}
                background={annotated ? theme.bg : undefined}
                outline={annotated ? undefined : { color: theme.bgDeep, width: 6 }}
              />
            ) : null}
          </g>
        );
      })}

      {/* 凡例は専用の帯へ置く。セル内で切れば、長い式が隣の曲線の意味まで奪わない。 */}
      {legendCurves.map(({ curve, index }, legendIndex) => {
        const start = (1.4 + index * 0.5) * fps;
        const cellX = PAD + legendCellWidth * legendIndex;
        return (
          <foreignObject
            key={`legend-${curve.expr}`}
            x={cellX}
            y={plotBottom}
            width={legendCellWidth}
            height={LEGEND_BAND_HEIGHT}
            opacity={clamped(frame, [start, start + 0.4 * fps], [0, 1])}
          >
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                overflow: "hidden",
                color: theme.ink,
                fontSize: legendCurves.length === 3 ? 26 : 30,
                fontWeight: 700,
                fontFamily: theme.fontFamily,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 8,
                  borderRadius: 4,
                  flexShrink: 0,
                  backgroundColor: curveColors[index % curveColors.length],
                }}
              />
              <span style={{ minWidth: 0, overflow: "hidden" }}><MathText text={curve.label} /></span>
            </div>
          </foreignObject>
        );
      })}
    </svg>
    </div>
  );
};
