import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { useTheme, withAlpha } from "./theme";
import { SvgLabel } from "./math/SvgLabel";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "tree" }>;

const WIDTH = 904;
const HEIGHT = 780;
const PAD = { top: 26, right: 24, bottom: 74, left: 44 } as const;

type Node = {
  label: string;
  depth: number;
  children: Node[];
  /** leaf に割り当て、tree を上がるにつれて平均する row index。 */
  row: number;
};

/**
 * outcome list の共通 prefix を共有して tree を組み立てる。
 *
 * That merge is not a shortcut for describing the tree — it *is* what a 樹形図
 * means. "表表, 表裏, 裏表, 裏裏" and the drawing with two branches that each
 * 再び split する共通部分は同じ object なので、model は outcome を列挙するだけで branching が決まる。
 * さらに leaf count も信頼できる。誤 label され得る値ではなく row 数だからである。
 */
const buildTree = (paths: string[][]) => {
  const root: Node = { label: "", depth: -1, children: [], row: 0 };
  let leaves = 0;

  for (const path of paths) {
    let node = root;
    for (const [depth, label] of path.entries()) {
      let child = node.children.find((candidate) => candidate.label === label);
      if (!child) {
        child = { label, depth, children: [], row: 0 };
        node.children.push(child);
      }
      node = child;
    }
  }

  // leaf は連続 row を取り、parent は child の中央と同じ高さに置く。これにより branch が扇状に読める。
  const assign = (node: Node): number => {
    if (node.children.length === 0) {
      node.row = leaves++;
      return node.row;
    }
    const rows = node.children.map(assign);
    node.row = (rows[0] + rows[rows.length - 1]) / 2;
    return node.row;
  };
  assign(root);

  const depth = Math.max(...paths.map((path) => path.length));
  return { root, leaves, depth };
};

const flatten = (node: Node, out: Node[] = []) => {
  for (const child of node.children) {
    out.push(child);
    flatten(child, out);
  }
  return out;
};

/**
 * 樹形図. Drawn left to right so the outcomes stack down the frame — the shape
 * 9:16 screen が実際に持つ幅と、数える順序を表す。
 */
export const Tree: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const { root, leaves, depth } = useMemo(() => buildTree(data.paths), [data.paths]);
  const nodes = useMemo(() => flatten(root), [root]);

  const rowHeight = (HEIGHT - PAD.top - PAD.bottom) / Math.max(leaves, 1);
  const columnWidth = (WIDTH - PAD.left - PAD.right) / (depth + 1);
  const x = (node: Node) => PAD.left + columnWidth * (node.depth + 1);
  const y = (node: Node) => PAD.top + rowHeight * (node.row + 0.5);

  const fontSize = Math.min(40, Math.max(22, rowHeight * 0.42));
  /** beat ごとに1 column。tree が描かれる順に成長する。 */
  const columnStart = (column: number) => 0.7 + column * 0.55;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
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
        {/* elbow として描く branch。parent からまっすぐ進み、vertical drop の後に child へ入る。shared parent
            からの diagonal は数本を超えると重なって blur になる。 */}
        {nodes.map((node) => {
          const parent =
            nodes.find((candidate) => candidate.children.includes(node)) ?? root;
          const start = columnStart(node.depth);
          const draw = clamped(
            frame,
            [start * fps, (start + 0.4) * fps],
            [0, 1], theme.easing);
          if (draw <= 0) {
            return null;
          }

          const fromX = x(parent) + (parent === root ? 12 : 46);
          const toX = x(node) - 46;
          const midX = fromX + (toX - fromX) * 0.45;

          return (
            <path
              key={`edge${node.depth}-${node.row}-${node.label}`}
              d={`M ${fromX} ${y(parent)} L ${midX} ${y(parent)} L ${midX} ${
                y(parent) + (y(node) - y(parent)) * draw
              } ${draw > 0.99 ? `L ${toX} ${y(node)}` : ""}`}
              fill="none"
              stroke={withAlpha(accent, 0.75)}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* diagram の始点。すべてがここから branch する。 */}
        <circle
          cx={x(root) + 12}
          cy={y(root)}
          r={11}
          fill={accent}
          opacity={clamped(frame, [0.4 * fps, 0.7 * fps], [0, 1])}
        />

        {nodes.map((node) => {
          const start = columnStart(node.depth) + 0.3;
          const appear = clamped(
            frame,
            [start * fps, (start + 0.3) * fps],
            [0, 1], theme.easing);
          const isLeaf = node.children.length === 0;

          return (
            <SvgLabel
              key={`node${node.depth}-${node.row}-${node.label}`}
              text={node.label}
              x={x(node)}
              y={y(node) + fontSize * 0.36}
              color={isLeaf ? accent : theme.ink}
              size={fontSize}
              weight={isLeaf ? 900 : 700}
              anchor="middle"
              opacity={appear}
              outline={{ color: theme.bgDeep, width: 7 }}
            />
          );
        })}

        {/* count こそこれを描く目的であり、path から導くことで、絵と食い違うことがない。 */}
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 18}
          fill={accent}
          fontSize={44}
          fontWeight={900}
          textAnchor="end"
          opacity={clamped(
            frame,
            [columnStart(depth) * fps + 0.6 * fps, columnStart(depth) * fps + 1.1 * fps],
            [0, 1])}
        >
          全{leaves}通り
        </text>

        {data.caption ? (
          <SvgLabel
            text={data.caption}
            x={PAD.left}
            y={HEIGHT - 18}
            color={theme.inkDim}
            size={34}
            weight={700}
            opacity={clamped(
              frame,
              [columnStart(depth) * fps + 0.6 * fps, columnStart(depth) * fps + 1.1 * fps],
              [0, 1])}
          />
        ) : null}
      </svg>
    </div>
  );
};
