import { AbsoluteFill } from "remotion";
import { Background } from "./Background";
import { SceneShell } from "./SceneShell";
import { ThemeProvider, accentFor, designs, layout, themes } from "./theme";
import { isDesignId } from "../designs";
import type { Scene, Subject } from "../types";

/**
 * The video's opening frame, standing still.
 *
 * The home screen used to draw its own card — a chip, the question, a rule, the
 * hook — and it drifted from the video it stood for: the same question was
 * typeset one way on the card and another way once you tapped it. This renders
 * the real opening instead, out of the same `SceneShell` the composition uses,
 * so a card cannot disagree with its video.
 *
 * It takes the summary rather than the manifest on purpose. The opening needs
 * the question, the unit and the palette, and all three are already on the
 * summary the home screen has — fetching a manifest per card would make
 * scrolling the library wait on the network.
 */
export type PosterProps = {
  topic: string;
  /** The question as bullet points; empty falls back to the question itself. */
  outline: string[];
  unit: string;
  design: string;
  subject: Subject;
  /** 問題 for a worked problem, テーマ otherwise — the composition's own rule. */
  label: string;
};

/**
 * A scene with no headline and no visual: the question is the whole scene.
 * `SceneShell` drops the headline of its own accord once it is given a problem.
 */
const HOOK: Scene = {
  scene_id: 1,
  narration: "",
  visual_type: "hook",
  visual_content: "",
};

/**
 * Long enough that the frame shown is nowhere near `SceneShell`'s exit fade,
 * which starts seven frames before the end.
 */
export const POSTER_DURATION = 300;

/**
 * The moment the opening has finished arriving: the question fades in over
 * 0.35s and slides for 0.5s, the unit banner takes 0.4s, and the stage itself
 * 8 frames. Everything has settled by 0.8s, and nothing has moved on yet.
 */
export const posterFrame = (fps: number) => Math.round(fps * 0.8);

/**
 * The palette a short is drawn in.
 *
 * The same fallback the composition makes, so a card and its video are the
 * same colour even for a short made before designs existed. Exported because
 * the library's own chrome sits on top of the frame and has to read against
 * it — white text over the whiteboard design is nothing at all.
 */
export const themeOf = (design: string, subject: Subject) =>
  isDesignId(design) ? designs[design] : themes[subject] ?? themes.general;

export const Poster: React.FC<PosterProps> = ({
  topic,
  outline,
  unit,
  design,
  subject,
  label,
}) => {
  const theme = themeOf(design, subject);

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
        <Background />
        {/* `SceneShell` directly rather than through `SceneText`: the hook
            never has bullets, and this is the shell the video draws too, so a
            card cannot drift from the frame it stands for. */}
        <SceneShell
          scene={HOOK}
          durationInFrames={POSTER_DURATION}
          accent={accentFor(theme, 0)}
          problem={{ text: topic, points: outline, unit, label }}
          poster
        />
      </AbsoluteFill>
    </ThemeProvider>
  );
};

export const POSTER_SIZE = { width: layout.width, height: layout.height };
