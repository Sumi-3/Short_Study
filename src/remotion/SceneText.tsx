import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { shadowOf, useTheme } from "./theme";
import { SceneShell, type Problem } from "./SceneShell";
import { MathText } from "./MathText";
import type { Scene } from "../types";
import { parsePlanStep, stepNumber } from "../solutionPlan";
import { useFitToStage } from "./useFitToStage";

const Bullet: React.FC<{
  text: string;
  index: number;
  accent: string;
}> = ({ text, index, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const step = parsePlanStep(text);
  // 方針は全体を先に読めるよう同時に出す。項目数が増えても後半が音声より遅れない。
  const start = (step ? 0.3 : 0.9 + index * 0.45) * fps;

  return (
    <div
      style={{
        display: "flex",
        alignItems: step ? "flex-start" : "center",
        gap: 28,
        opacity: clamped(
          frame,
          [start, start + 0.4 * fps],
          [0, 1],
          theme.easing,
        ),
        translate: clamped(
          frame,
          [start, start + 0.55 * fps],
          ["0px 36px", "0px 0px"], theme.easing),
      }}
    >
      {step ? (
        <div style={{
          flexShrink: 0, color: accent, fontFamily: theme.fontFamily,
          fontWeight: 700, fontSize: 60, lineHeight: 1.3,
        }}>{stepNumber(step.number)}</div>
      ) : <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          backgroundColor: accent,
          rotate: "45deg",
          flexShrink: 0,
        }}
      />}
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.3,
          color: theme.ink,
          textShadow: shadowOf(theme),
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {/* 箇条書きも問題文や見出しと同じ本文で、$…$ の数式や x^2 の指数が混じる。生の文字列のままだと
            $ が画面に出るので、同じ組版を通す。 */}
        <MathText text={step?.text ?? text} display={!step} />
      </div>
    </div>
  );
};

const BulletList: React.FC<{ items: string[]; accent: string }> = ({ items, accent }) => {
  // 番号・折り返し・項目間隔を含む実高で収め、項目を削らず字幕の領域も空ける。
  const { viewportRef, contentRef, scale } = useFitToStage(false);
  return (
    <div ref={viewportRef} style={{ height: "100%", width: "100%", display: "flex", alignItems: "center" }}>
      <div ref={contentRef} style={{
        display: "flex", flexDirection: "column", gap: 44, width: "100%", flexShrink: 0,
        scale: String(scale), transformOrigin: "center",
      }}>
        {items.map((item, index) => (
          <Bullet key={index} text={item} index={index} accent={accent} />
        ))}
      </div>
    </div>
  );
};

/**
 * hook、summary、bullet-list scene。visual が文字であるものを扱う。`visual` payload のない scene も
 * ここへ来て、headline だけを表示する。
 */
export const SceneText: React.FC<{
  scene: Scene;
  durationInFrames: number;
  accent: string;
  problem?: Problem;
}> = ({ scene, durationInFrames, accent, problem }) => {
  const items =
    scene.visual?.kind === "bullets" ? scene.visual.items : [];

  return (
    <SceneShell
      scene={scene}
      durationInFrames={durationInFrames}
      accent={accent}
      problem={problem}
    >
      {items.length ? <BulletList items={items} accent={accent} /> : null}
    </SceneShell>
  );
};
