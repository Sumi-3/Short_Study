import { Thumbnail as StillFrame } from "@remotion/player";
import {
  POSTER_DURATION,
  POSTER_SIZE,
  Poster,
  posterFrame,
} from "../../src/remotion/Poster";
import { themeOf, withAlpha } from "../../src/remotion/theme";
import type { ShortSummary } from "./api";

/**
 * What a short looks like when it is not the one playing: its own opening
 * frame, held still.
 *
 * The card used to be a separate design — a chip, the question, an accent rule,
 * the hook line — sized by a formula that guessed how much text would fit. Two
 * typesettings of one question is one too many, and the guess is what kept
 * going wrong. `<Thumbnail>` renders the real composition at a frame instead,
 * so the card is the video rather than a picture about it.
 *
 * The trade is size: the composition is laid out for a 1080px stage, so on a
 * card a fifth of that width its 44px question paints at about 8px.
 */
export const Thumbnail: React.FC<{ short: ShortSummary }> = ({ short }) => {
  const theme = themeOf(short.design, short.subject);

  return (
  <div className="thumb">
    <StillFrame
      component={Poster}
      inputProps={{
        topic: short.topic,
        outline: short.outline ?? [],
        unit: short.unit,
        design: short.design,
        subject: short.subject,
        // Anything but a worked problem is a subject, not a question — the
        // rule the composition follows.
        label: short.course === "math" ? "問題" : "テーマ",
      }}
      compositionWidth={POSTER_SIZE.width}
      compositionHeight={POSTER_SIZE.height}
      durationInFrames={POSTER_DURATION}
      fps={short.fps}
      frameToDisplay={posterFrame(short.fps)}
      style={{ width: "100%", height: "100%" }}
    />

    {/* The two things the library needs that the video never shows: which
        corner of the syllabus this is, and how long it runs. They sit in the
        band the captions occupy during playback, which is empty at the hook. */}
    <div
      className="thumb__meta"
      style={{
        color: theme.ink,
        // Built from the frame's own deepest colour, so it darkens a chalk
        // board and lightens a whiteboard instead of painting black on white.
        background: `linear-gradient(to top, ${withAlpha(
          theme.bgDeep,
          0.82,
        )} 0%, ${withAlpha(theme.bgDeep, 0.5)} 55%, ${withAlpha(
          theme.bgDeep,
          0,
        )} 100%)`,
      }}
    >
      {short.subunit ? <span>{short.subunit}</span> : null}
      <span>{Math.round(short.durationInFrames / short.fps)}秒</span>
    </div>
  </div>
  );
};
