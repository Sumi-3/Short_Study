import type { SceneVisual } from "../../types";
import { compileExpression } from "./expression";

type PlotVisual = Extract<SceneVisual, { kind: "plot" }>;
export type PlotRegion = NonNullable<PlotVisual["curves"][number]["region"]>;
type Point = [number, number];
type Interval = [number, number];
type Boundary = (x: number) => Interval[];

const SAMPLES = 800;

const intersect = (left: Interval[], right: Interval[]): Interval[] =>
  left.flatMap(([a, b]) => right.flatMap(([c, d]) => {
    const low = Math.max(a, c);
    const high = Math.min(b, d);
    return high > low ? [[low, high] as Interval] : [];
  }));

const insideBoundary = (
  curve: PlotVisual["curves"][number],
  tRange: Interval,
): Boundary | null => {
  if (!curve.exprY) return null;
  const fx = compileExpression(curve.expr, "t");
  const fy = compileExpression(curve.exprY, "t");
  if (!fx || !fy) return null;
  const points: Point[] = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const t = tRange[0] + (tRange[1] - tRange[0]) * i / SAMPLES;
    return [fx(t), fy(t)];
  });
  if (points.some((point) => !point.every(Number.isFinite))) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const first = points[0];
  const last = points[SAMPLES];
  // 2π の丸め誤差は許すが、開いた弧を弦で勝手に閉じない。
  if (span === 0 || Math.hypot(first[0] - last[0], first[1] - last[1]) > span * 0.005) {
    return null;
  }
  points[SAMPLES] = first;

  return (x) => {
    const crossings: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      // 頂点を二重に数えると内部と外部が逆転するので、辺は半開区間にする。
      if ((ax <= x && x < bx) || (bx <= x && x < ax)) {
        crossings.push(ay + (by - ay) * (x - ax) / (bx - ax));
      }
    }
    crossings.sort((a, b) => a - b);
    const intervals: Interval[] = [];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      intervals.push([crossings[i], crossings[i + 1]]);
    }
    return intervals;
  };
};

/** 複数の y 区間を交差させるので、閉曲線の内部と不等式も同じ走査で扱える。 */
export const buildRegionPolygons = (
  data: Pick<PlotVisual, "curves" | "shade" | "tRange">,
  xRange: Interval,
  yRange: Interval,
): Point[][] => {
  const constraints = data.curves.filter((curve) => curve.region);
  if (constraints.length === 0) return [];
  const boundaries: Boundary[] = [];
  const between = constraints.filter((curve) => curve.region === "between");
  if (between.length > 0) {
    // 左右端は交点や問題の区間から指定する。画面端まで無限の外側領域を塗るのを防ぐ。
    if (between.length !== 2 || !data.shade || between.some((curve) => curve.exprY)) return [];
    const f = compileExpression(between[0].expr);
    const g = compileExpression(between[1].expr);
    if (!f || !g) return [];
    boundaries.push((x) => {
      const a = f(x);
      const b = g(x);
      return Number.isFinite(a) && Number.isFinite(b) ? [[Math.min(a, b), Math.max(a, b)]] : [];
    });
  }

  for (const curve of constraints) {
    if (curve.region === "between") continue;
    if (curve.region === "inside") {
      const boundary = insideBoundary(curve, data.tRange ?? [0, 2 * Math.PI]);
      if (!boundary) return [];
      boundaries.push(boundary);
    } else {
      const fn = curve.exprY ? null : compileExpression(curve.expr);
      // 無効な境界を除外してしまうと、指定より広い領域を正解として見せてしまう。
      if (!fn) return [];
      boundaries.push((x) => {
        const y = fn(x);
        if (!Number.isFinite(y)) return [];
        return curve.region === "above" ? [[y, Infinity]] : [[-Infinity, y]];
      });
    }
  }

  const from = Math.max(xRange[0], data.shade?.[0] ?? xRange[0]);
  const to = Math.min(xRange[1], data.shade?.[1] ?? xRange[1]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  const polygons: Point[][] = [];
  let runs: { upper: Point[]; lower: Point[] }[] = [];
  const close = () => {
    for (const { upper, lower } of runs) {
      if (upper.length > 1) polygons.push([...upper, ...lower.reverse()]);
    }
    runs = [];
  };

  for (let i = 0; i <= SAMPLES; i++) {
    const x = from + (to - from) * i / SAMPLES;
    const intervals = boundaries.reduce((current, boundary) => intersect(current, boundary(x)), [yRange]);
    // 区間が分裂・合流した列ではつなぎ直し、離れた領域を跨ぐ多角形を作らない。
    if (intervals.length !== runs.length) close();
    if (runs.length === 0) runs = intervals.map(() => ({ upper: [], lower: [] }));
    intervals.forEach(([low, high], index) => {
      runs[index].upper.push([x, high]);
      runs[index].lower.push([x, low]);
    });
  }
  close();
  return polygons;
};
