import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { layout, shadowOf, stageBottom, useTheme, withAlpha } from "./theme";
import { MathText } from "./MathText";
import { Formula } from "./math/Formula";
import type { Scene } from "../types";
import { parseProblemOutline } from "../problemOutline";
import { useFitToStage } from "./useFitToStage";

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
const UnitBanner: React.FC<{
  unit: string;
  accent: string;
  fontSize: number;
  top: number;
  inset: number;
}> = ({ unit, accent, fontSize, top, inset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const appear = clamped(frame, [0, 0.4 * fps], [0, 1], theme.easing);

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: inset,
        right: inset,
        opacity: appear,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize,
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

/** The question box's own frame, shared by the video and the poster. */
const CARD_PADDING_Y = 26;
const CARD_PADDING_X = 30;
const CARD_BORDER = 3;
const CARD_LINE_HEIGHT = 1.55;

/** 62px reads as 10px on a two-up card; the unit is what the library is
 *  browsed by, so on a poster it is set larger. */
const UNIT_SIZE = 62;
const POSTER_UNIT_SIZE = 84;

/**
 * A poster runs to the edges of the frame.
 *
 * The video's margins exist so nothing important lands where a phone's UI or a
 * platform's own furniture sits over the picture. A still card has none of
 * that on top of it, and every pixel it gives back to the margin is a pixel
 * the question is not using, so the box is pulled out to `POSTER_SAFE_X` and
 * the banner is pulled up with it.
 */
const POSTER_SAFE_X = 32;
const POSTER_SAFE_TOP = 56;
/** Clear of the unit banner: 84px of type over a rule, hung at the top inset. */
const POSTER_TOP = 200;
/** Room for the subunit-and-running-time strip the home screen draws on top. */
const POSTER_FOOT = 180;
/**
 * The question box on a poster is not sized by its text — it spans everything
 * between the banner and that strip, so a one-line question is as full a card
 * as a six-line one.
 */
const POSTER_BOX_OUTER = layout.height - POSTER_TOP - POSTER_FOOT;
/** Inside its padding and border. */
const POSTER_BOX_HEIGHT = POSTER_BOX_OUTER - CARD_PADDING_Y * 2 - CARD_BORDER * 2;
/** Inside the box: the frame less the safe margins, the padding and the border. */
const POSTER_BOX_WIDTH =
  layout.width - POSTER_SAFE_X * 2 - CARD_PADDING_X * 2 - CARD_BORDER * 2;
/** How much of a row real text actually reaches before it has to break. */
const PACKING = 0.92;
/** Numbered questions need a hanging indent; conditions use the full width. */
const QUESTION_GUTTER = 1.8;

/**
 * Roughly how wide a string sets, in ems.
 *
 * Japanese is square — one character, one em — and the latin and digits mixed
 * through a maths question are a little over half that. The cut is at latin-1
 * rather than at the CJK block, because 「、」「：」「△」 all set full width in a
 * Japanese face however low their code points are. Close enough to count lines
 * with, which is all it is for.
 */
const emsOf = (text: string) => {
  let ems = 0;
  for (const character of text) {
    ems += character.charCodeAt(0) < 0x0100 ? 0.6 : 1;
  }
  return ems;
};

/**
 * The largest size at which the whole question still fits the poster's box.
 *
 * Not a formula over the character count, because the question keeps its own
 * line breaks: a break ends a line wherever it falls, so 「…求めよ。」 followed
 * by three short lines costs four rows however few characters it holds. The
 * only honest way to count the rows is to lay each segment out, so this walks
 * the sizes down until they fit.
 *
 * There is no readability floor: losing a condition changes the problem, so
 * unusually long questions must get smaller rather than lose their ending.
 * DOM fitting covers the dividers, question gaps and actual font metrics that
 * this estimate cannot count, including overflow at the last positive size.
 * The ceiling is what a short question gets: 「∫_0^π …を求めよ。」 is 28 characters, and left to fill
 * the box it came out in letters a fifth of the frame tall — a slogan rather
 * than a question. Past 130 the box is better left with air in it.
 */
const posterFontSize = (segments: string[], outlined: boolean) => {
  for (let size = 130; size > 2; size -= 2) {
    // Whole characters, and not quite the full width: a row breaks at a word
    // or a kinsoku boundary, never mid-character and rarely at the last em
    // that would have fitted. Rounding down matters most at the large sizes,
    // where a row is only four or five characters wide to begin with.
    const emsPerRow = Math.floor(
      (POSTER_BOX_WIDTH / size) * PACKING - (outlined ? QUESTION_GUTTER : 0),
    );
    const rows = segments.flatMap((segment) => segment.split("\n")).reduce(
      (total, segment) => total + Math.max(1, Math.ceil(emsOf(segment) / emsPerRow)),
      0,
    );
    if (rows * CARD_LINE_HEIGHT * size <= POSTER_BOX_HEIGHT) {
      return size;
    }
  }

  return 2;
};

const ProblemCard: React.FC<{
  text: string;
  /** The question as its parts. Falls back to `text` when a short has none. */
  points: string[];
  label: string;
  accent: string;
  /** A still card: no captions are coming, so the question takes the frame. */
  poster?: boolean;
}> = ({ text, points, label, accent, poster }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const { conditions, questions } = parseProblemOutline(points);
  const outlined = conditions.length + questions.length > 0;
  const lines = outlined
    ? [...conditions, ...questions.map((question) => question.text)]
    : text.split("\n");
  const measured = lines.join("\n");
  // The opening can spend its vertical space on complete sentences. Start
  // larger even for long questions, then fit the actual wrapped block instead
  // of silently dropping the thirteenth line (often the second question).
  // Posters estimate up to 130px, with no readability floor: the library has
  // no caption band, but even its longer questions must keep every condition.
  const fontSize = poster
    ? posterFontSize(lines, outlined)
    : measured.length > 200 ? 44 : measured.length > 130 ? 48
      : measured.length > 88 ? 52 : 56;
  const { viewportRef, contentRef, scale } = useFitToStage(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        opacity: clamped(frame, [0, 0.35 * fps], [0, 1], theme.easing),
        translate: clamped(frame, [0, 0.5 * fps], ["0px -24px", "0px 0px"], theme.easing),
      }}
    >
      {poster ? null : (
        <div
          style={{
            alignSelf: "flex-start",
            backgroundColor: accent,
            color: theme.bgDeep,
            fontFamily: theme.fontFamily,
            fontWeight: 900,
            // A section label must remain legible at phone playback size,
            // independently of the problem's character-count tier.
            fontSize: 36,
            lineHeight: 1.3,
            letterSpacing: 2,
            padding: "8px 22px",
            borderRadius: theme.radius,
            marginBottom: 16,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          /*
           * The box that knows how much room there is, not the box that gets
           * painted. Those were one element, which meant the plate always
           * stood as tall as the stage: a four-line question sat in the
           * middle of twelve lines of empty border. The fitter still needs a
           * definite height to measure against, so this keeps `flex: 1` and
           * the visible plate below hugs the text instead.
           */
          flex: 1,
          minHeight: 0,
          fontFamily: theme.fontFamily,
          fontWeight: 700,
          fontSize,
          lineHeight: CARD_LINE_HEIGHT,
          color: theme.ink,
          textShadow: shadowOf(theme),
        }}
      >
        {/* A bounded viewport lets the shared fitter count labels, dividers,
            wrapped questions and webfont metrics together. Full text takes
            priority over the nominal size only when that measured block spills. */}
        {/* On a poster the available space is known. A percentage inside the
            flex-sized parent can be indefinite and grow with its content;
            measuring that as the budget would approve the very overflow we
            need to shrink. Use composition pixels, unaffected by Thumbnail's
            display scale, and leave the video's measurement path unchanged. */}
        <div ref={viewportRef} style={{ height: poster ? POSTER_BOX_OUTER : "100%", minHeight: 0, display: "flex", alignItems: "center" }}>
          <div
            ref={contentRef}
            style={{
              width: "100%",
              flexShrink: 0,
              whiteSpace: "pre-line",
              overflowWrap: "anywhere",
              scale: String(scale),
              backgroundColor: withAlpha(theme.bgDeep, 0.72),
              border: `${CARD_BORDER}px solid ${withAlpha(accent, 0.55)}`,
              borderRadius: theme.radius === 999 ? 24 : theme.radius,
              padding: `${CARD_PADDING_Y}px ${CARD_PADDING_X}px`,
              boxSizing: "border-box",
            }}
          >
            {outlined ? (
              <>
                {conditions.length > 0 && !poster ? (
                  // A fixed label size avoids the old 0.48em heading shrinking
                  // to 15px precisely when a long question needs orientation.
                  <div style={{ color: theme.inkDim, fontWeight: 900, fontSize: 36, letterSpacing: "0.14em", lineHeight: 1.2, marginBottom: 16 }}>
                    条件
                  </div>
                ) : null}
                {conditions.map((condition, index) => (
                  <div key={index}><MathText text={condition} /></div>
                ))}
                <div style={conditions.length ? { marginTop: "0.35em", paddingTop: "0.35em", borderTop: `2px solid ${withAlpha(accent, 0.5)}` } : undefined}>
                  {questions.map((question, index) => (
                    <div key={index} style={{ display: "flex", alignItems: "baseline", gap: "0.25em", marginTop: index ? "0.25em" : 0 }}>
                      {/* Numbers stay as large as the question so each answer
                          later in the video has an unmistakable reference. */}
                      <span style={{ color: accent, fontWeight: 900, flexShrink: 0, minWidth: `${QUESTION_GUTTER - 0.25}em` }}>
                        {question.number === null ? "問" : `(${question.number})`}
                      </span>
                      <span style={{ minWidth: 0 }}><MathText text={question.text} /></span>
                    </div>
                  ))}
                </div>
              </>
            ) : <MathText text={text} />}
          </div>
        </div>
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
  problem?: { text: string; points: string[]; label: string; unit: string };
  /**
   * Drawn as a still card rather than played. No captions arrive, so the stage
   * runs from the banner to the foot of the frame and the question is set to
   * fill it — on a two-up home screen the video's own 44px is under 8px.
   */
  poster?: boolean;
  children?: React.ReactNode;
}> = ({ scene, durationInFrames, accent, problem, poster, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const isHook = scene.visual_type === "hook";
  /*
   * The question is set to the same width whether it is a card or the opening
   * of the video, so tapping the one and getting the other is the same frame
   * carrying on rather than a reflow. The margin the other scenes keep is
   * there for the phone's own furniture; nothing but the question is under it
   * here, and the question would rather have the width.
   */
  const inset = poster || problem ? POSTER_SAFE_X : layout.safeX;
  const label = labelFor(scene);
  // A step that continues the one before it says so by leaving its heading
  // empty; then the stage is only the working, and nothing announces a new
  // section over the top of it.
  const heading = problem ? "" : scene.visual_content;
  // With no diagram to sit under it, the headline owns the whole stage —
  // unless the problem card is already using it.
  const centered = !scene.visual && !problem;
  const companion =
    scene.visual?.kind === "figure" || scene.visual?.kind === "plot"
      ? scene.visual
      : undefined;
  const hasCompanion = Boolean(companion?.lines?.length || companion?.caption);

  /*
   * The stage arrives and leaves; the background, unit banner and captions do
   * not. Scenes are separate `<Sequence>`s with no overlap, so nothing can
   * literally survive a cut — but fading each stage out as the next fades in
   * turns the hard cut into a hand-over, which is the part of a PowerPoint
   * morph that carries across a hard boundary. See the note in
   * math/Formula.tsx for why the formulas themselves stack rather than morph.
   */
  const arrival = clamped(frame, [0, ENTER], [0, 1], theme.easing);
  const departure = clamped(
    frame,
    [durationInFrames - LEAVE, durationInFrames],
    [1, 0]);

  return (
    <AbsoluteFill
      style={{
        opacity: arrival * departure,
        // Scale rather than a slide: a slide would fight the entrance each
        // headline and formula line already runs.
        scale: `${clamped(frame, [0, ENTER], [0.985, 1], theme.easing)}`,
        paddingLeft: inset,
        paddingRight: inset,
        // The poster's question box is tall enough to reach the unit banner,
        // which is positioned absolutely and would be painted over.
        // The complete problem now uses the available height, so explicitly
        // reserve the banner (74.4 + 18 + 5px) and 32px below its rule.
        paddingTop: poster ? POSTER_TOP : problem?.unit
          ? layout.safeTop + UNIT_SIZE * 1.2 + 18 + 5 + 32 : layout.safeTop,
        // Stop the stage before the caption band so the two never collide. The
        // poster has no captions — only the library's own strip along the foot.
        paddingBottom: poster ? POSTER_FOOT : layout.height - stageBottom,
        // The question and the line that answers it belong together, so they
        // are centred as one group rather than pushed to opposite ends.
        justifyContent: problem ? "center" : "flex-start",
      }}
    >
      {problem?.unit ? (
        <UnitBanner
          unit={problem.unit}
          accent={accent}
          fontSize={poster ? POSTER_UNIT_SIZE : UNIT_SIZE}
          top={poster ? POSTER_SAFE_TOP : layout.safeTop}
          inset={inset}
        />
      ) : null}

      {problem ? (
        <ProblemCard
          text={problem.text}
          points={problem.points}
          label={problem.label}
          accent={accent}
          poster={poster}
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
          opacity: clamped(frame, [0, 0.3 * fps], [0, 1], theme.easing),
          translate: clamped(
            frame,
            [0, 0.4 * fps],
            ["-40px 0px", "0px 0px"], theme.easing),
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
          opacity: clamped(
            frame,
            [0.15 * fps, 0.6 * fps],
            [0, 1],
            theme.easing,
          ),
          translate: clamped(
            frame,
            [0.15 * fps, 0.7 * fps],
            ["0px 44px", "0px 0px"], theme.easing),
        }}
      >
        {/* The headline carries the same `a_n`/`x^2` notation the question
            does, so it is typeset the same way. */}
        <MathText text={heading} />
      </div>

      {/* Accent rule that wipes in under the headline. */}
      <div
        style={{
          marginTop: 28,
          height: 12,
          borderRadius: 6,
          backgroundColor: accent,
          width: clamped(frame, [0.4 * fps, 1.1 * fps], [0, 260], theme.easing),
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
          flexGrow: !problem && scene.visual ? 1 : 0,
          marginTop: !problem && scene.visual ? 56 : 0,
          minHeight: 0,
          overflow: "hidden",
          // Only combined scenes need a grid. Giving the existing SVG its own
          // shrinking row preserves its aspect ratio; side-by-side columns
          // would halve the width of both the labels and the working on 9:16.
          // No companion fields means the old rendering path, including old
          // manifests whose JSON never went through the new Zod schema.
          ...(hasCompanion ? {
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
            gap: 20,
            flexBasis: 0,
          } : {}),
        }}
      >
        {hasCompanion ? (
          <>
            <div style={{ minHeight: 0 }}>{children}</div>
            <Formula
              lines={companion?.lines ?? []}
              caption={companion?.caption ?? ""}
              accent={accent}
              compact
              durationInFrames={durationInFrames}
            />
          </>
        ) : children}
      </div>
    </AbsoluteFill>
  );
};
