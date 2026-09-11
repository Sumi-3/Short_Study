import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { clamped } from "./clamped";
import { shadowOf, useTheme, withAlpha } from "./theme";
import { SceneShell } from "./SceneShell";
import { MathText } from "./MathText";
import { Formula } from "./math/Formula";
import { Plot } from "./math/Plot";
import { Figure } from "./math/Figure";
import { Table } from "./Table";
import { Tree } from "./Tree";
import { Venn } from "./Venn";
import { Histogram } from "./chart/Histogram";
import { BoxPlot } from "./chart/BoxPlot";
import { Scatter } from "./chart/Scatter";
import { DotPlot } from "./chart/DotPlot";
import type { Scene, SceneVisual } from "../types";

/** arrow で結んだ step を、1つずつ表示する。 */
const Flow: React.FC<{ steps: string[]; accent: string }> = ({
  steps,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  // 4 step と3 arrow は、サイズを下げて初めて stage に収まる。
  const compact = steps.length >= 4;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 10 : 20,
        height: "100%",
      }}
    >
      {steps.map((step, index) => {
        const start = (0.9 + index * 0.6) * fps;
        return (
          <div
            key={step}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: compact ? 10 : 20,
              opacity: clamped(
                frame,
                [start, start + 0.35 * fps],
                [0, 1],
                theme.easing,
              ),
              scale: interpolate(frame, [start, start + 0.5 * fps], [0.85, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: theme.easing,
                output: "perceptual-scale",
              }),
            }}
          >
            {index > 0 ? (
              <div
                style={{
                  fontSize: compact ? 40 : 54,
                  lineHeight: 1,
                  color: accent,
                  fontWeight: 900,
                }}
              >
                ↓
              </div>
            ) : null}
            <div
              style={{
                fontFamily: theme.fontFamily,
                fontWeight: 900,
                fontSize: compact ? 56 : 66,
                color: theme.bgDeep,
                backgroundColor: accent,
                padding: compact ? "18px 44px" : "24px 56px",
                borderRadius: theme.radius,
                boxShadow: `0 16px 48px ${withAlpha(theme.ink, 0.14)}`,
              }}
            >
              <MathText text={step} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 横 bar。実際の quantity を比較するときだけ使う。 */
const Bars: React.FC<{
  data: { label: string; value: number }[];
  unit: string;
  accent: string;
}> = ({ data, unit, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 40,
        justifyContent: "center",
        height: "100%",
      }}
    >
      {data.map((datum, index) => {
        const start = (0.9 + index * 0.35) * fps;
        const grow = clamped(
          frame,
          [start, start + 0.9 * fps],
          [0, 1],
          theme.easing,
        );

        return (
          <div key={datum.label} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontFamily: theme.fontFamily,
                fontWeight: 700,
                fontSize: 46,
                color: theme.ink,
                textShadow: shadowOf(theme),
              }}
            >
              <span><MathText text={datum.label} /></span>
              <span style={{ color: accent, fontWeight: 900 }}>
                {Math.round(datum.value * grow).toLocaleString("ja-JP")}
                {unit ? (
                  <span style={{ fontSize: 34, marginLeft: 6 }}>{unit}</span>
                ) : null}
              </span>
            </div>
            <div
              style={{
                height: 34,
                borderRadius: 17,
                // bar の未充填 groove。明るい board では白地に白は見えないため、ink に合わせて見えるようにする。
                backgroundColor: withAlpha(theme.ink, 0.14),
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 17,
                  backgroundColor: accent,
                  width: `${(datum.value / max) * 100 * grow}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** text 以外の visual。flow chart、bar 比較、formula、plot。 */
export const SceneDiagram: React.FC<{
  scene: Scene & {
    visual: Extract<
      SceneVisual,
      {
        kind:
          | "flow"
          | "bars"
          | "formula"
          | "plot"
          | "figure"
          | "table"
          | "tree"
          | "venn"
          | "histogram"
          | "box"
          | "scatter"
          | "dot";
      }
    >;
  };
  durationInFrames: number;
  accent: string;
  animateHookEntrance: boolean;
}> = ({ scene, durationInFrames, accent, animateHookEntrance }) => {
  const { visual } = scene;

  return (
    <SceneShell
      scene={scene}
      durationInFrames={durationInFrames}
      accent={accent}
      animateHookEntrance={animateHookEntrance}
    >
      {visual.kind === "flow" ? (
        <Flow steps={visual.steps} accent={accent} />
      ) : null}
      {visual.kind === "bars" ? (
        <Bars data={visual.data} unit={visual.unit} accent={accent} />
      ) : null}
      {visual.kind === "formula" ? (
        <Formula
          lines={visual.lines}
          caption={visual.caption}
          accent={accent}
          durationInFrames={durationInFrames}
        />
      ) : null}
      {visual.kind === "plot" ? <Plot data={visual} accent={accent} /> : null}
      {visual.kind === "figure" ? (
        <Figure data={visual} accent={accent} />
      ) : null}
      {visual.kind === "table" ? <Table data={visual} accent={accent} /> : null}
      {visual.kind === "tree" ? <Tree data={visual} accent={accent} /> : null}
      {visual.kind === "venn" ? <Venn data={visual} accent={accent} /> : null}
      {visual.kind === "histogram" ? (
        <Histogram data={visual} accent={accent} />
      ) : null}
      {visual.kind === "box" ? <BoxPlot data={visual} accent={accent} /> : null}
      {visual.kind === "scatter" ? (
        <Scatter data={visual} accent={accent} />
      ) : null}
      {visual.kind === "dot" ? <DotPlot data={visual} accent={accent} /> : null}
    </SceneShell>
  );
};
