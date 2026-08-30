import { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "./theme";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "tree" }>;

const WIDTH = 904;
const HEIGHT = 780;
const PAD = { top: 26, right: 24, bottom: 74, left: 44 } as const;

type Node = {
  label: string;
  depth: number;
  children: Node[];
  /** Row index, assigned to leaves and averaged up the tree. */
  row: number;
};

/**
 * Builds the tree from a list of outcomes by sharing their common prefixes.
 *
 * That merge is not a shortcut for describing the tree — it *is* what a 樹形図
 * means. "表表, 表裏, 裏表, 裏裏" and the drawing with two branches that each
 * split again are the same object, so the model lists the outcomes and the
 * branching falls out. It also makes the leaf count trustworthy: it is the
 * number of rows, not something that can be mislabelled.
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

  // Leaves take consecutive rows; a parent sits level with the middle of its
  // children, which is what makes the branches read as a fan.
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
 * a 9:16 screen actually has, and the order they are counted in.
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
  /** One column per beat, so the tree grows the way it is drawn. */
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
        {/* Branches, drawn as elbows: a straight run out of the parent, then a
            vertical drop, then into the child. Diagonals from a shared parent
            overlap into a blur once there are more than a couple. */}
        {nodes.map((node) => {
          const parent =
            nodes.find((candidate) => candidate.children.includes(node)) ?? root;
          const start = columnStart(node.depth);
          const draw = interpolate(
            frame,
            [start * fps, (start + 0.4) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing },
          );
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

        {/* The start of the diagram: everything branches from here. */}
        <circle
          cx={x(root) + 12}
          cy={y(root)}
          r={11}
          fill={accent}
          opacity={interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />

        {nodes.map((node) => {
          const start = columnStart(node.depth) + 0.3;
          const appear = interpolate(
            frame,
            [start * fps, (start + 0.3) * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing },
          );
          const isLeaf = node.children.length === 0;

          return (
            <text
              key={`node${node.depth}-${node.row}-${node.label}`}
              x={x(node)}
              y={y(node) + fontSize * 0.36}
              fill={isLeaf ? accent : theme.ink}
              fontSize={fontSize}
              fontWeight={isLeaf ? 900 : 700}
              textAnchor="middle"
              opacity={appear}
              stroke={theme.bgDeep}
              strokeWidth={7}
              paintOrder="stroke"
            >
              {node.label}
            </text>
          );
        })}

        {/* The count is the whole point of drawing one of these, and it is
            derived from the paths rather than asserted, so it cannot disagree
            with the picture. */}
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 18}
          fill={accent}
          fontSize={44}
          fontWeight={900}
          textAnchor="end"
          opacity={interpolate(
            frame,
            [columnStart(depth) * fps + 0.6 * fps, columnStart(depth) * fps + 1.1 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )}
        >
          全{leaves}通り
        </text>

        {data.caption ? (
          <text
            x={PAD.left}
            y={HEIGHT - 18}
            fill={theme.inkDim}
            fontSize={34}
            fontWeight={700}
            opacity={interpolate(
              frame,
              [columnStart(depth) * fps + 0.6 * fps, columnStart(depth) * fps + 1.1 * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )}
          >
            {data.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
