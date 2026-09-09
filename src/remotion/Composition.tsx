import {
  AbsoluteFill,
  Html5Audio,
  Internals,
  Sequence,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { Audio } from "@remotion/media";
import { assetSrc } from "./assetSrc";
import { Background } from "./Background";
import { Captions } from "./Captions";
import { SceneText } from "./SceneText";
import { SceneDiagram } from "./SceneDiagram";
import { FormulaRun } from "./FormulaRun";
import { sceneRuns } from "./sceneRuns";
import { ThemeProvider, accentFor, layout, themeOf } from "./theme";
import type { Manifest, ManifestScene } from "../types";

export type StudyShortProps = {
  /** `public/` 相対の path。例: `projects/mock/manifest.json`。 */
  manifestSrc: string;
  /** `calculateMetadata` が設定する値で、手渡しはしない。 */
  manifest: Manifest | null;
};

/**
 * blob storage から配信した場合にも narration を通す。
 *
 * `<Audio>` は独自 decoder を使えない環境、主に phone で HTML5 element へ fallback し、Remotion は
 * volume 適用のためその element を Web Audio に通す。`crossOrigin` のない cross-origin element は
 * graph を taint し、taint された source node は無音を出力する。動画は再生されても narration がない。
 * same-origin の再生には不要で、影響もない。
 *
 * object identity を変えないよう module-level に置く。render ごとに新しくすると新しい props と
 * 解釈され、audio を schedule し直すため単語が途切れる。
 */
const FALLBACK_AUDIO = {
  crossOrigin: "anonymous",
  // narration の準備完了まで playhead を止める。default は clip 到着中も timeline を進めるため、
  // network 越しでは完全に無音の short が再生されるように見える。
  pauseWhenBuffering: true,
} as const;

// Remotion の preservePitch prop は標準 property を扱うが、古い Safari には prefix 付きも必要である。
// frame が ref を detach/reattach しないよう安定させ、Html5Audio が Player の gesture-unlocked tag pool を
// 再利用できるようにする。
const preserveNarrationPitch = (element: HTMLAudioElement | null) => {
  if (!element) return;
  element.preservesPitch = true;
  if ("webkitPreservesPitch" in element) {
    (element as HTMLAudioElement & { webkitPreservesPitch: boolean })
      .webkitPreservesPitch = true;
  }
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
  accent: string;
  problem?: { text: string; points: string[]; unit: string };
}> = ({ scene, accent, problem }) => {
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
        durationInFrames={scene.durationInFrames}
        accent={accent}
      />
    );
  }

  return (
    <SceneText
      scene={scene}
      durationInFrames={scene.durationInFrames}
      accent={accent}
      problem={problem}
    />
  );
};

export const StudyShort: React.FC<StudyShortProps> = ({ manifest }) => {
  // この hook は Remotion 4.0.518 の内部実装で public API ではない。upgrade 時に再確認すること。
  // Player context を読むと inputProps identity を変えずに済み、それが変わると narration を再 schedule
  // して音節を繰り返してしまう。
  const { playbackRate } = Internals.usePlaybackRate();
  const environment = useRemotionEnvironment();
  // frame 正確な decoding は1xに保つ。browser の pitch-preserving time stretch と引き換えるのは Player
  // だけで、export は常に従来の path を使う。
  const usePitchPreservingAudio =
    environment.isPlayer && !environment.isRendering && playbackRate !== 1;
  const theme = themeOf();

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

  /*
   * 連続する formula の point は 1 つの run として、舞台だけを先に置く。音声・字幕・単独シーンの
   * 舞台は従来どおりシーンごとの `<Sequence>` に入れるので、時間軸は動かない。run の舞台を
   * シーン列より先に描くのは、字幕を舞台の上に重ねるためである。同じ時刻に run の舞台と単独
   * シーンの舞台が同時に立つことはないので、両者の前後関係は問題にならない。
   */
  const runs = sceneRuns(manifest.scenes);
  const runOf = manifest.scenes.map((_, index) =>
    runs.find((run) => index >= run.first && index < run.first + run.count)!,
  );
  let elapsedFrames = 0;

  return (
    <ThemeProvider value={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <Background />

      {runs.filter((run) => run.count > 1).map((run) => (
        <Sequence
          key={`run-${run.first}`}
          from={run.from}
          durationInFrames={run.durationInFrames}
          name={`Scenes ${manifest.scenes[run.first].scene_id}–${
            manifest.scenes[run.first + run.count - 1].scene_id
          } (formula run)`}
        >
          <FormulaRun
            scenes={manifest.scenes.slice(run.first, run.first + run.count)}
            // run は 1 つの舞台なので accent も 1 つ。先頭シーンのものを run 全体とその字幕に使う。
            accent={accentFor(theme, run.first)}
          />
        </Sequence>
      ))}

      {manifest.scenes.map((scene, index) => {
        const from = elapsedFrames;
        elapsedFrames += scene.durationInFrames;
        const run = runOf[index];
        const accent = accentFor(theme, run.first);

        return (
          <Sequence
            key={scene.scene_id}
            from={from}
            durationInFrames={scene.durationInFrames}
            name={`Scene ${scene.scene_id} (${scene.visual_type})`}
          >
            {usePitchPreservingAudio ? (
              // Html5Audio には Audio の timing props がないため、Sequence で同じ local timeline を与える。
              // playbackRate は重ねて渡さない。Html5Audio はすでに Player の context rate を掛けている。
              <Sequence
                layout="absolute-fill"
                durationInFrames={Math.ceil(
                  scene.audioDurationInSeconds * manifest.fps,
                )}
                premountFor={Math.round(manifest.fps * 2)}
              >
                <Html5Audio
                  src={assetSrc(scene.audioSrc)}
                  ref={preserveNarrationPitch}
                  preservePitch
                  // shared tag を再利用しても CORS と buffering の挙動を保つ。buffering では route swap 中の
                  // frame を保持し、説明だけが voice より先へ進むのを防ぐ。
                  {...FALLBACK_AUDIO}
                />
              </Sequence>
            ) : (
              <Audio
                src={assetSrc(scene.audioSrc)}
                durationInFrames={Math.ceil(
                  scene.audioDurationInSeconds * manifest.fps,
                )}
                // 各 scene は個別の mp3 なので、これがなければ Sequence 開始時に初めて download が始まる。
                // disk なら問題ないが、network では playhead との競争になる。2秒早く mount して fetch の
                // 時間を与える。
                premountFor={Math.round(manifest.fps * 2)}
                fallbackHtml5AudioProps={FALLBACK_AUDIO}
              />
            )}
            {/* run に入ったシーンの舞台は上の FormulaRun が描いている。 */}
            {run.count === 1 ? (
            <SceneRenderer
              scene={scene}
              accent={accent}
              problem={
                scene.visual_type === "hook"
                  ? {
                      text: manifest.topic,
                      // short に bullet があればそれを使い、outline 導入前に作ったものでは question 自体を使う。
                      points: manifest.outline ?? [],
                      unit: manifest.unit ?? "",
                    }
                  : undefined
              }
            />
            ) : null}
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
