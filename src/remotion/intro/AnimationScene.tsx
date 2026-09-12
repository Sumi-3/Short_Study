import type { ReactNode } from "react";
import { interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { FormulaRun } from "../FormulaRun";
import { Table } from "../Table";
import { Tree } from "../Tree";
import { Venn } from "../Venn";
import { Histogram } from "../chart/Histogram";
import { Scatter } from "../chart/Scatter";
import { Figure } from "../math/Figure";
import { Plot } from "../math/Plot";
import { useTheme, withAlpha } from "../theme";
import type { ManifestScene, SceneVisual } from "../../types";
import { SceneLayout } from "./SceneLayout";
import type { IntroScene } from "./script";

const venn: Extract<SceneVisual, { kind: "venn" }> = {
  kind: "venn",
  sets: ["数学", "動画"],
  counts: [4, 7, 3, 1],
  highlight: ["AB"],
  caption: "理解が重なる場所",
};

const tree: Extract<SceneVisual, { kind: "tree" }> = {
  kind: "tree",
  paths: [["表", "表"], ["表", "裏"], ["裏", "表"], ["裏", "裏"]],
  caption: "場合の数",
};

const table: Extract<SceneVisual, { kind: "table" }> = {
  kind: "table",
  rows: [["x", "-1", "0", "1"], ["f'(x)", "−", "0", "+"], ["f(x)", "↘", "最小", "↗"]],
  caption: "増減表",
};

const histogram: Extract<SceneVisual, { kind: "histogram" }> = {
  kind: "histogram",
  bins: [
    { from: 0, to: 10, count: 3 },
    { from: 10, to: 20, count: 7 },
    { from: 20, to: 30, count: 11 },
    { from: 30, to: 40, count: 6 },
  ],
  unit: "点",
  caption: "分布を読む",
  marks: [{ value: 24, label: "平均" }],
};

const scatter: Extract<SceneVisual, { kind: "scatter" }> = {
  kind: "scatter",
  xRange: [0, 8],
  yRange: [0, 10],
  points: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 8 }, { x: 7, y: 9 }],
  xLabel: "学習時間",
  yLabel: "得点",
  trend: "x + 1",
  caption: "散布図",
};

const formula: ManifestScene = {
  scene_id: 1,
  narration: "",
  visual_type: "step",
  visual_content: "式を順に変形",
  visual: {
    kind: "formula",
    lines: ["x^2 - 5x + 6 = 0", "(x - 2)(x - 3) = 0", "[box]x = 2, 3"],
    caption: "因数分解で解く",
  },
  audioSrc: "",
  audioDurationInSeconds: 0,
  durationInFrames: 300,
  captions: [],
};

const betweenCurves: Extract<SceneVisual, { kind: "plot" }> = {
  kind: "plot",
  xRange: [-0.3, 1.3],
  yRange: [-0.2, 1.35],
  curves: [
    { expr: "x^2", exprY: null, label: "y = x²", region: "between" },
    { expr: "x", exprY: null, label: "y = x", region: "between" },
  ],
  tRange: null,
  shade: [0, 1],
  points: [{ x: 1, y: 1, label: "[coord][guide]交点" }],
};

const solidOfRevolution: Extract<SceneVisual, { kind: "plot" }> = {
  kind: "plot",
  xRange: [-0.3, 4.3],
  yRange: [-0.3, 2.45],
  curves: [{ expr: "sqrt(x)", exprY: null, label: "y = √x", region: "revolve" }],
  tRange: null,
  shade: [0, 4],
  points: [],
};

const cuboid: Extract<SceneVisual, { kind: "figure" }> = {
  kind: "figure",
  points: [
    { x: -2, y: -2, label: "A" }, { x: 1, y: -2, label: "B" },
    { x: 1, y: 1, label: "C" }, { x: -2, y: 1, label: "D" },
    { x: -0.7, y: -0.7, label: "E" }, { x: 2.3, y: -0.7, label: "F" },
    { x: 2.3, y: 2.3, label: "G" }, { x: -0.7, y: 2.3, label: "H" },
  ],
  segments: [
    { from: "A", to: "B", label: "", dashed: false, emphasis: 1, ticks: 0, arrow: false },
    { from: "B", to: "C", label: "", dashed: false, emphasis: 1, ticks: 0, arrow: false },
    { from: "C", to: "D", label: "", dashed: false, emphasis: 1, ticks: 0, arrow: false },
    { from: "D", to: "A", label: "", dashed: false, emphasis: 1, ticks: 0, arrow: false },
    { from: "A", to: "E", label: "", dashed: true, emphasis: false, ticks: 0, arrow: false },
    { from: "B", to: "F", label: "", dashed: false, emphasis: false, ticks: 0, arrow: false },
    { from: "C", to: "G", label: "", dashed: false, emphasis: false, ticks: 0, arrow: false },
    { from: "D", to: "H", label: "", dashed: false, emphasis: false, ticks: 0, arrow: false },
    { from: "E", to: "F", label: "", dashed: true, emphasis: false, ticks: 0, arrow: false },
    { from: "F", to: "G", label: "", dashed: false, emphasis: false, ticks: 0, arrow: false },
    { from: "G", to: "H", label: "", dashed: false, emphasis: false, ticks: 0, arrow: false },
    { from: "E", to: "H", label: "", dashed: true, emphasis: false, ticks: 0, arrow: false },
  ],
  angles: [],
  circles: [],
  highlight: ["A", "B", "C", "D"],
  axes: false,
};

const vectorSum: Extract<SceneVisual, { kind: "figure" }> = {
  kind: "figure",
  points: [
    { x: 0, y: 0, label: "O" }, { x: 3, y: 1, label: "A" },
    { x: 1, y: 2, label: "B" }, { x: 4, y: 3, label: "P" },
  ],
  segments: [
    { from: "O", to: "A", label: "a", dashed: false, emphasis: 1, ticks: 0, arrow: true },
    { from: "O", to: "B", label: "b", dashed: false, emphasis: 2, ticks: 0, arrow: true },
    { from: "A", to: "P", label: "b", dashed: true, emphasis: 2, ticks: 0, arrow: true },
    { from: "B", to: "P", label: "a", dashed: true, emphasis: 1, ticks: 0, arrow: true },
  ],
  angles: [],
  circles: [],
  highlight: ["O", "A", "P", "B"],
  axes: true,
};

const ellipse: Extract<SceneVisual, { kind: "plot" }> = {
  kind: "plot",
  xRange: [-3.5, 3.5],
  yRange: [-2.9, 2.9],
  curves: [{ expr: "3*cos(t)", exprY: "2*sin(t)", label: "(3cos t, 2sin t)", region: "inside" }],
  tRange: [0, 2 * Math.PI],
  shade: null,
  points: [],
};

const trigonometry: Extract<SceneVisual, { kind: "plot" }> = {
  kind: "plot",
  xRange: [0, 6.3],
  yRange: [-1.45, 1.45],
  curves: [
    { expr: "sin(x)", exprY: null, label: "sin x", region: null },
    { expr: "0.65*cos(x)", exprY: null, label: "0.65 cos x", region: null },
  ],
  tRange: null,
  shade: null,
  points: [{ x: Math.PI / 2, y: 1, label: "[guide]最大点" }],
};

const VisualCard: React.FC<{ label: string; index: number; children: ReactNode }> = ({ label, index, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const start = index * fps * 0.16;

  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        padding: 14,
        overflow: "hidden",
        borderRadius: theme.radius,
        backgroundColor: theme.plate,
        border: `2px solid ${withAlpha(theme.ink, 0.1)}`,
        opacity: interpolate(frame, [start, start + fps * 0.42], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
        scale: interpolate(frame, [start, start + fps * 0.48], [0.82, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
          output: "perceptual-scale",
        }),
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: 12,
          left: 16,
          color: theme.accents[index % theme.accents.length],
          fontFamily: theme.fontFamily,
          fontSize: 17,
          fontWeight: 900,
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div style={{ width: "100%", height: "100%", paddingTop: 18, boxSizing: "border-box" }}>{children}</div>
    </div>
  );
};

/**
 * カードの内寸は grid で決まるので、倍率はそこから逆算する。DOM を計測すると delayRender が
 * 6枚ぶん増えるだけで、値は毎回同じになる。
 */
const CARD_WIDTH = (1920 - 100 * 2 - 20 * 2) / 3 - 14 * 2;
const CARD_HEIGHT = (798 - 20) / 2 - 14 * 2 - 18;

/**
 * short 用のコンポーネントは 9:16 の実寸（横1080）を前提に自分を拡大する。カードへ直接置くと
 * その倍率が効いて破綻するので、実寸で組んでからカード幅へ縮める。
 */
const Stage: React.FC<{ height?: number; children: ReactNode }> = ({ height, children }) => {
  const scale = height
    ? Math.min(CARD_WIDTH / 1080, CARD_HEIGHT / height)
    : CARD_WIDTH / 1080;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: 1080, height, scale, flexShrink: 0 }}>{children}</div>
    </div>
  );
};

const FormulaPreview: React.FC = () => {
  const theme = useTheme();
  // FormulaRun は与えられた高さの中央に組むので、短編の 1920 ではなく中身ぶんだけ渡す。
  return (
    <Stage height={1150}>
      <FormulaRun scenes={[formula]} accent={theme.accents[0]} />
    </Stage>
  );
};

const PlotPreview: React.FC<{ data: Extract<SceneVisual, { kind: "plot" }>; accent: string }> = ({ data, accent }) => (
  <Stage height={800}><Plot data={data} accent={accent} /></Stage>
);

const FigurePreview: React.FC<{ data: Extract<SceneVisual, { kind: "figure" }>; accent: string }> = ({ data, accent }) => (
  <Stage height={800}><Figure data={data} accent={accent} /></Stage>
);

const SlideOne: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const turnAt = 6.1 * fps;
  const turnEnd = turnAt + 0.8 * fps;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 20,
        opacity: interpolate(frame, [turnAt, turnEnd], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing }),
        translate: interpolate(frame, [turnAt, turnEnd], ["0px 0px", "0px -38px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing }),
      }}
    >
      <VisualCard label="ベン図" index={0}><Venn data={venn} accent={theme.accents[0]} /></VisualCard>
      <VisualCard label="樹形図" index={1}><Tree data={tree} accent={theme.accents[2]} /></VisualCard>
      <VisualCard label="表" index={2}><Stage><Table data={table} accent={theme.accents[3]} /></Stage></VisualCard>
      <VisualCard label="ヒストグラム" index={3}><Histogram data={histogram} accent={theme.accents[1]} /></VisualCard>
      <VisualCard label="散布図" index={4}><Scatter data={scatter} accent={theme.accents[4]} /></VisualCard>
      <VisualCard label="数式" index={5}><FormulaPreview /></VisualCard>
    </div>
  );
};

const SlideTwo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 20,
        opacity: interpolate(frame, [0, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing }),
        translate: interpolate(frame, [0, 0.8 * fps], ["0px 46px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.easing }),
      }}
    >
      <VisualCard label="2関数の間" index={0}><PlotPreview data={betweenCurves} accent={theme.accents[0]} /></VisualCard>
      <VisualCard label="回転体" index={1}><PlotPreview data={solidOfRevolution} accent={theme.accents[1]} /></VisualCard>
      <VisualCard label="立体の見取り図" index={2}><FigurePreview data={cuboid} accent={theme.accents[2]} /></VisualCard>
      <VisualCard label="ベクトルの和" index={3}><FigurePreview data={vectorSum} accent={theme.accents[3]} /></VisualCard>
      <VisualCard label="媒介変数曲線" index={4}><PlotPreview data={ellipse} accent={theme.accents[4]} /></VisualCard>
      <VisualCard label="三角関数" index={5}><PlotPreview data={trigonometry} accent={theme.accents[0]} /></VisualCard>
    </div>
  );
};

export const AnimationScene: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  return (
    <SceneLayout title="多彩なアニメーション" narration={scene.narration} durationInFrames={scene.durationInFrames}>
      <div style={{ height: "100%", position: "relative" }}>
        <SlideOne />
        {/* 次のカード群を local frame で始め、図そのものの描画アニメーションもめくりの後に再生する。 */}
        <Sequence from={Math.round(6.1 * fps)} durationInFrames={scene.durationInFrames - Math.round(6.1 * fps)} layout="none">
          <SlideTwo />
        </Sequence>
      </div>
    </SceneLayout>
  );
};
