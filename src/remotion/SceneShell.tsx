import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { layout, shadowOf, stageBottom, useTheme, withAlpha } from "./theme";
import { MathText } from "./MathText";
import type { Scene } from "../types";

/**
 * The question, shown from the very first frame of the hook.
 *
 * These shorts are meant to be rewatched, so the opening has to say what is
 * being solved before the narration gets there — otherwise the first ten
 * seconds are a voice over an empty screen, and a viewer scrubbing back has
 * nothing to land on.
 */
/**
 * The curriculum unit, across the top of the frame.
 *
 * On a feed this is the line that decides whether the viewer stops: "数I 図形と
 * 計量" tells them what they are about to practise before they have read a word
 * of the question, so it gets the top of the screen and a size to match.
 */
const UnitBanner: React.FC<{ unit: string; accent: string }> = ({
  unit,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const appear = interpolate(frame, [0, 0.4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: theme.easing,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: layout.safeTop,
        left: layout.safeX,
        right: layout.safeX,
        opacity: appear,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 62,
          letterSpacing: 2,
          lineHeight: 1.2,
          color: accent,
          textShadow: shadowOf(theme),
        }}
      >
        {unit}
      </div>
      <div
        style={{
          marginTop: 18,
          height: 5,
          borderRadius: 3,
          backgroundColor: withAlpha(accent, 0.45),
          transformOrigin: "left center",
          scale: `${appear} 1`,
        }}
      />
    </div>
  );
};

const ProblemCard: React.FC<{
  text: string;
  label: string;
  accent: string;
}> = ({ text, label, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  /*
   * Long questions step down rather than overflowing the card.
   *
   * The extra tier is for the exam-style questions that carry their own
   * sub-questions and displayed formulas — those run past 200 characters and
   * over ten lines once the line breaks are honoured.
   */
  const fontSize =
    text.length > 200 ? 32 : text.length > 130 ? 38 : text.length > 88 ? 44 : 50;

  return (
    <div
      style={{
        opacity: interpolate(frame, [0, 0.35 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
        translate: interpolate(frame, [0, 0.5 * fps], ["0px -24px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
      }}
    >
      <div
        style={{
          alignSelf: "flex-start",
          display: "inline-block",
          backgroundColor: accent,
          color: theme.bgDeep,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 30,
          letterSpacing: 2,
          padding: "8px 22px",
          borderRadius: theme.radius,
          marginBottom: 16,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 700,
          fontSize,
          lineHeight: 1.55,
          color: theme.ink,
          backgroundColor: withAlpha(theme.bgDeep, 0.72),
          border: `3px solid ${withAlpha(accent, 0.55)}`,
          borderRadius: theme.radius === 999 ? 24 : theme.radius,
          padding: "26px 30px",
          textShadow: shadowOf(theme),
          // The question may arrive with its sub-questions and displayed
          // formulas on their own lines; a long one is unreadable as a wall.
          whiteSpace: "pre-line",
          display: "-webkit-box",
          /* 12 lines at 32px is 645px of card, and the stage between the unit
             banner and the caption band has around twice that. */
          WebkitLineClamp: 12,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        <MathText text={text} />
      </div>
    </div>
  );
};

/*
 * Only the two scenes that are genuinely a section of their own get a chip.
 *
 * Every step used to be stamped "POINT 1", "POINT 2" — which asserted that each
 * one raises a new point. Often it does not: a step carries on the working the
 * one before it started, and numbering that as a fresh point tells the viewer
 * to look for something new when there is nothing new to look for.
 */
const labelFor = (scene: Scene) => {
  if (scene.visual_type === "hook") {
    return "問題";
  }
  if (scene.visual_type === "summary") {
    return "まとめ";
  }
  return null;
};

/**
 * The chrome every scene shares: the section chip and the on-screen headline
 * (`visual_content`). Children render into the stage area below it.
 */
/** Frames the stage takes to arrive, and to leave again. */
const ENTER = 8;
const LEAVE = 7;

export const SceneShell: React.FC<{
  scene: Scene;
  /** This scene's own length. `useVideoConfig()` reports the whole video's. */
  durationInFrames: number;
  accent: string;
  /** The question this video answers. Only the hook is given one. */
  problem?: { text: string; label: string; unit: string };
  children?: React.ReactNode;
}> = ({ scene, durationInFrames, accent, problem, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const isHook = scene.visual_type === "hook";
  const label = labelFor(scene);
  // A step that continues the one before it says so by leaving its heading
  // empty; then the stage is only the working, and nothing announces a new
  // section over the top of it.
  const heading = problem ? "" : scene.visual_content;
  // With no diagram to sit under it, the headline owns the whole stage —
  // unless the problem card is already using it.
  const centered = !scene.visual && !problem;

  /*
   * The stage arrives and leaves; the background, unit banner and captions do
   * not. Scenes are separate `<Sequence>`s with no overlap, so nothing can
   * literally survive a cut — but fading each stage out as the next fades in
   * turns the hard cut into a hand-over, which is the part of a PowerPoint
   * morph that carries across a hard boundary. See the note in
   * math/Formula.tsx for why the formulas themselves stack rather than morph.
   */
  const arrival = interpolate(frame, [0, ENTER], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: theme.easing,
  });
  const departure = interpolate(
    frame,
    [durationInFrames - LEAVE, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        opacity: arrival * departure,
        // Scale rather than a slide: a slide would fight the entrance each
        // headline and formula line already runs.
        scale: `${interpolate(frame, [0, ENTER], [0.985, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        })}`,
        paddingLeft: layout.safeX,
        paddingRight: layout.safeX,
        paddingTop: layout.safeTop,
        // Stop the stage before the caption band so the two never collide.
        paddingBottom: layout.height - stageBottom,
        // The question and the line that answers it belong together, so they
        // are centred as one group rather than pushed to opposite ends.
        justifyContent: problem ? "center" : "flex-start",
      }}
    >
      {problem?.unit ? (
        <UnitBanner unit={problem.unit} accent={accent} />
      ) : null}

      {problem ? (
        <ProblemCard
          text={problem.text}
          label={problem.label}
          accent={accent}
        />
      ) : null}

      {/* The question is the whole opening. A restatement under it competes
          with the thing the viewer came to read. */}
      {problem || (!label && !heading) ? null : (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flexGrow: centered ? 1 : 0,
          justifyContent: "center",
        }}
      >
      {label ? (
      <div
        style={{
          alignSelf: "flex-start",
          backgroundColor: accent,
          color: theme.bgDeep,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: 2,
          padding: "12px 28px",
          borderRadius: theme.radius,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
          translate: interpolate(
            frame,
            [0, 0.4 * fps],
            ["-40px 0px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: theme.easing,
            },
          ),
        }}
      >
        {label}
      </div>
      ) : null}

      {heading ? (
      <>
      <div
        style={{
          marginTop: label ? (isHook ? 88 : 56) : 0,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: isHook ? 132 : 96,
          lineHeight: 1.18,
          color: theme.ink,
          textShadow: shadowOf(theme),
          opacity: interpolate(frame, [0.15 * fps, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
          translate: interpolate(
            frame,
            [0.15 * fps, 0.7 * fps],
            ["0px 44px", "0px 0px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: theme.easing,
            },
          ),
        }}
      >
        {heading}
      </div>

      {/* Accent rule that wipes in under the headline. */}
      <div
        style={{
          marginTop: 28,
          height: 12,
          borderRadius: 6,
          backgroundColor: accent,
          width: interpolate(frame, [0.4 * fps, 1.1 * fps], [0, 260], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: theme.easing,
          }),
        }}
      />
      </>
      ) : null}

      </div>
      )}

      <div
        style={{
          // Only a real diagram claims the leftover space. An empty stage that
          // grows would push the headline back to the top of the frame.
          flexGrow: scene.visual ? 1 : 0,
          marginTop: scene.visual ? 56 : 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
