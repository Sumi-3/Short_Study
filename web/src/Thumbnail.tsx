import { designs, themes } from "../../src/remotion/theme";
import { isDesignId } from "../../src/designs";
import { MathText } from "../../src/remotion/MathText";
import type { ShortSummary } from "./api";

/**
 * What a short looks like when it is not the one playing.
 *
 * Built from the manifest rather than rendered as an image: the pipeline never
 * runs Remotion (the browser plays the composition live), so producing a real
 * poster frame would mean bundling the composition on every generation for one
 * PNG.
 *
 * The question itself is the largest thing on the card. Browsing a library of
 * shorts means looking for a problem, and only the problem identifies it — the
 * hook is a punchline, which reads well once you already know which video you
 * are looking at. So the hook stays, small, under the rule.
 */
export const Thumbnail: React.FC<{ short: ShortSummary }> = ({ short }) => {
  // Same fallback the composition uses, so a card and its video never disagree.
  const theme = isDesignId(short.design)
    ? designs[short.design]
    : themes[short.subject] ?? themes.general;
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
      {/* The curriculum unit, not the course: every short here is maths. */}
      <span
        className="thumb__unit"
        style={{
          background: accent,
          color: theme.bgDeep,
          borderRadius: Math.min(theme.radius, 20),
        }}
      >
        {short.unit || "数学"}
      </span>

      {/* Shorts made before the small category was recorded simply have none. */}
      {short.subunit ? (
        <p className="thumb__subunit" style={{ color: accent }}>
          {short.subunit}
        </p>
      ) : null}

      <p className="thumb__question">
        <MathText text={short.topic} />
      </p>

      <div className="thumb__rule" style={{ background: accent }} />

      <p className="thumb__hook" style={{ color: theme.inkDim }}>
        <MathText text={short.headline} />
      </p>

      <p className="thumb__meta" style={{ color: theme.inkDim }}>
        {seconds}秒
      </p>
    </div>
  );
};
