import { COURSES } from "../../src/courses";
import { themes } from "../../src/remotion/theme";
import { MathText } from "../../src/remotion/MathText";
import type { ShortSummary } from "./api";

/**
 * What a short looks like when it is not the one playing.
 *
 * Built from the manifest rather than rendered as an image: the pipeline never
 * runs Remotion (the browser plays the composition live), so producing a real
 * poster frame would mean bundling the composition on every generation for one
 * PNG. The hook's headline and the subject palette are the two things that
 * actually make a thumbnail readable, and both are already in the manifest.
 */
export const Thumbnail: React.FC<{ short: ShortSummary }> = ({ short }) => {
  const theme = themes[short.subject] ?? themes.general;
  const accent = theme.accents[0];
  const seconds = Math.round(short.durationInFrames / short.fps);

  return (
    <div
      className="thumb"
      style={{
        background: `linear-gradient(165deg, ${theme.bg} 0%, ${theme.bgDeep} 100%)`,
        fontFamily: theme.fontFamily,
        color: theme.ink,
      }}
    >
      <span
        className="thumb__course"
        style={{
          background: accent,
          color: theme.bgDeep,
          borderRadius: Math.min(theme.radius, 20),
        }}
      >
        {COURSES[short.course].label}
      </span>

      <p className="thumb__headline">
        <MathText text={short.headline} />
      </p>
      <div className="thumb__rule" style={{ background: accent }} />

      {/* The prompt the user typed, small — the headline is the fast read. */}
      <p className="thumb__topic" style={{ color: theme.inkDim }}>
        <MathText text={short.topic} />
      </p>

      <p className="thumb__meta" style={{ color: theme.inkDim }}>
        {seconds}秒
      </p>
    </div>
  );
};
