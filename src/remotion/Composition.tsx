import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { Audio } from "@remotion/media";
import { assetSrc } from "./assetSrc";
import { Background } from "./Background";
import { Captions } from "./Captions";
import { SceneText } from "./SceneText";
import { SceneDiagram } from "./SceneDiagram";
import { ThemeProvider, accentFor, layout, themes } from "./theme";
import type { Manifest, ManifestScene } from "../types";

export type StudyShortProps = {
  /** Path relative to `public/`, e.g. `projects/mock/manifest.json`. */
  manifestSrc: string;
  /** Filled in by `calculateMetadata`; never passed by hand. */
  manifest: Manifest | null;
};

const ProgressBar: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start" }}>
      <div
        style={{
          height: 10,
          width: `${Math.min(100, (frame / durationInFrames) * 100)}%`,
          backgroundColor: accent,
        }}
      />
    </AbsoluteFill>
  );
};

const SceneRenderer: React.FC<{
  scene: ManifestScene;
  pointIndex: number;
  accent: string;
  problem?: { text: string; label: string; unit: string };
}> = ({ scene, pointIndex, accent, problem }) => {
  const { visual } = scene;

  if (
    visual &&
    (visual.kind === "flow" ||
      visual.kind === "bars" ||
      visual.kind === "formula" ||
      visual.kind === "plot" ||
      visual.kind === "figure" ||
      visual.kind === "table" ||
      visual.kind === "tree" ||
      visual.kind === "venn" ||
      visual.kind === "histogram" ||
      visual.kind === "box" ||
      visual.kind === "scatter" ||
      visual.kind === "dot")
  ) {
    return (
      <SceneDiagram
        scene={{ ...scene, visual }}
        pointIndex={pointIndex}
        accent={accent}
      />
    );
  }

  return (
    <SceneText
      scene={scene}
      pointIndex={pointIndex}
      accent={accent}
      problem={problem}
    />
  );
};

export const StudyShort: React.FC<StudyShortProps> = ({ manifest }) => {
  // Everything below reads its palette, typeface and easing from here, so the
  // whole video changes character with the subject the script declared.
  const theme = themes[manifest?.subject ?? "general"];

  if (!manifest) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: theme.bgDeep,
          color: theme.ink,
          fontFamily: theme.fontFamily,
          fontSize: 48,
          justifyContent: "center",
          alignItems: "center",
          padding: layout.safeX,
          textAlign: "center",
        }}
      >
        manifest.json が読み込めませんでした
      </AbsoluteFill>
    );
  }

  let elapsedFrames = 0;
  let pointIndex = 0;

  return (
    <ThemeProvider value={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <Background />

      {manifest.scenes.map((scene, index) => {
        const from = elapsedFrames;
        elapsedFrames += scene.durationInFrames;
        if (scene.visual_type === "point") {
          pointIndex += 1;
        }
        const accent = accentFor(theme, index);

        return (
          <Sequence
            key={scene.scene_id}
            from={from}
            durationInFrames={scene.durationInFrames}
            name={`Scene ${scene.scene_id} (${scene.visual_type})`}
          >
            <Audio
              src={assetSrc(scene.audioSrc)}
              durationInFrames={Math.ceil(
                scene.audioDurationInSeconds * manifest.fps,
              )}
            />
            <SceneRenderer
              scene={scene}
              pointIndex={pointIndex}
              accent={accent}
              problem={
                scene.visual_type === "hook"
                  ? {
                      text: manifest.topic,
                      unit: manifest.unit ?? "",
                      // Anything but a worked problem is a subject, not a
                      // question, and calling it 問題 would read oddly.
                      label: manifest.course === "math" ? "問題" : "テーマ",
                    }
                  : undefined
              }
            />
            <Captions captions={scene.captions} accent={accent} />
          </Sequence>
        );
      })}

      <ProgressBar accent={theme.accents[0]} />
    </AbsoluteFill>
    </ThemeProvider>
  );
};

export const calculateStudyShortMetadata: CalculateMetadataFunction<
  StudyShortProps
> = async ({ props, abortSignal }) => {
  const response = await fetch(assetSrc(props.manifestSrc), {
    signal: abortSignal,
  });
  if (!response.ok) {
    throw new Error(`Could not load ${props.manifestSrc} (${response.status})`);
  }
  const manifest = (await response.json()) as Manifest;

  return {
    durationInFrames: manifest.scenes.reduce(
      (sum, scene) => sum + scene.durationInFrames,
      0,
    ),
    fps: manifest.fps,
    width: manifest.width,
    height: manifest.height,
    defaultOutName: manifest.slug,
    props: { ...props, manifest },
  };
};
