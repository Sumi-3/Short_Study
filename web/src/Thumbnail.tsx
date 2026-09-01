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
/**
 * How big the question can be and still fit the card.
 *
 * A fixed size cannot work: these questions run from 「微分積分の基本を教えて」 to a
 * six-line exam problem, and one size either wastes the card or overflows it.
 *
 * The rule is area, not length. Halving the type quadruples what fits, so the
 * size that just fills a fixed box goes as 1/√(characters); the constants are
 * this card's proportions, measured. A hard line break costs extra because it
 * throws away the rest of the line it ends.
 *
 * The band is narrow on purpose. Sizing purely to fit put a 22-character
 * question at 28px next to a 178-character one at 11px, and a grid of cards
 * that disagree that much about type size reads as broken rather than as
 * adaptive. Past the floor the question is truncated instead — the same trade
 * the video's problem card makes, which never goes below 32 of its 50.
 */
const questionSize = (text: string) => {
  const weight = text.length + (text.split("\n").length - 1) * 10;
  const cqi = Math.min(17, Math.max(11, 85 / Math.sqrt(weight)));
  return {
    // `cqi` scales with the card; the px bounds keep it readable in the grid
    // and stop it ballooning on the full-screen poster.
    fontSize: `clamp(11px, ${cqi.toFixed(1)}cqi, 44px)`,
    // Lines that fit the space the smaller type frees up.
    WebkitLineClamp: Math.min(10, Math.max(4, Math.ceil(83 / cqi))),
  };
};

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

      <p className="thumb__question" style={questionSize(short.topic)}>
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
