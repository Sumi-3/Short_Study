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
import { ThemeProvider, accentFor, layout, themeOf } from "./theme";
import type { Manifest, ManifestScene } from "../types";

export type StudyShortProps = {
  /** Path relative to `public/`, e.g. `projects/mock/manifest.json`. */
  manifestSrc: string;
  /** Filled in by `calculateMetadata`; never passed by hand. */
  manifest: Manifest | null;
};

/**
 * Lets the narration through when it is served from blob storage.
 *
 * `<Audio>` falls back to an HTML5 element wherever its own decoder is
 * unavailable, which is what a phone tends to get, and Remotion routes that
 * element through Web Audio to apply volume. A cross-origin element without
 * `crossOrigin` taints the graph, and a tainted source node outputs silence —
 * the video plays and the narration simply is not there. Same-origin playback
 * does not need it and is unaffected.
 *
 * Module-level so the object identity never changes: a fresh one each render is
 * read as new props, and re-scheduling the audio is what makes words stutter.
 */
const FALLBACK_AUDIO = {
  crossOrigin: "anonymous",
  // Hold the playhead until the narration is ready. The default lets the
  // timeline run on while the clip is still arriving, which over a network
  // reads as a short that plays with no sound at all.
  pauseWhenBuffering: true,
} as const;

// Remotion's preservePitch prop covers the standard property; older Safari
// needs the prefixed one too. Keep the ref stable so frames do not detach and
// reattach it, and let Html5Audio reuse the Player's gesture-unlocked tag pool.
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
  // This hook is internal in Remotion 4.0.518, not a public API: recheck it on
  // upgrades. Reading the Player context avoids changing inputProps identity,
  // which would re-schedule narration and repeat syllables.
  const { playbackRate } = Internals.usePlaybackRate();
  const environment = useRemotionEnvironment();
  // Keep frame-accurate decoding at 1x. Only the Player trades it for the
  // browser's pitch-preserving time stretch; exports always keep the old path.
  const usePitchPreservingAudio =
    environment.isPlayer && !environment.isRendering && playbackRate !== 1;
  // Everything below reads its palette, typeface and easing from here, so the
  // whole video changes character with the design it was made with.
  const theme = themeOf(manifest?.design, manifest?.subject ?? "general");

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

  return (
    <ThemeProvider value={theme}>
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <Background />

      {manifest.scenes.map((scene, index) => {
        const from = elapsedFrames;
        elapsedFrames += scene.durationInFrames;
        const accent = accentFor(theme, index);

        return (
          <Sequence
            key={scene.scene_id}
            from={from}
            durationInFrames={scene.durationInFrames}
            name={`Scene ${scene.scene_id} (${scene.visual_type})`}
          >
            {usePitchPreservingAudio ? (
              // Html5Audio lacks Audio's timing props, so give it the same
              // local timeline in a Sequence. Do not pass playbackRate again:
              // Html5Audio already multiplies by the Player's context rate.
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
                  // Preserve CORS and buffering behavior when reusing the
                  // shared tags. Buffering holds the frame during a route swap
                  // instead of letting the explanation run ahead of the voice.
                  {...FALLBACK_AUDIO}
                />
              </Sequence>
            ) : (
              <Audio
                src={assetSrc(scene.audioSrc)}
                durationInFrames={Math.ceil(
                  scene.audioDurationInSeconds * manifest.fps,
                )}
                // Every scene is its own mp3, so without this each one only
                // starts downloading as its sequence begins — fine from disk,
                // a race against the playhead over a network. Mounting two
                // seconds early gives the fetch somewhere to happen.
                premountFor={Math.round(manifest.fps * 2)}
                fallbackHtml5AudioProps={FALLBACK_AUDIO}
              />
            )}
            <SceneRenderer
              scene={scene}
              accent={accent}
              problem={
                scene.visual_type === "hook"
                  ? {
                      text: manifest.topic,
                      // Bullets when the short has them; the question itself
                      // for one made before the outline existed.
                      points: manifest.outline ?? [],
                      unit: manifest.unit ?? "",
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
