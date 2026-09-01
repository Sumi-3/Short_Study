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
 * The question as one flowing paragraph.
 *
 * `topic` carries line breaks, and they are placed for the video: a 1080px
 * stage where a break separates the setup from its sub-questions and costs
 * nothing. The card is a fifth of that width and has room for about nine
 * lines, so there every break also throws away the rest of the line it ends.
 * Honouring them shows less of the question, not more — one pasted from a
 * rendered web page arrives with a break after every symbol and fills the card
 * with eight one-character lines.
 */
const oneParagraph = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");

/**
 * How big the question can be, and how many of its lines the card can hold.
 *
 * A fixed size cannot work: these questions run from 「微分積分の基本を教えて」 to a
 * six-line exam problem, and one size either wastes the card or overflows it.
 *
 * Both numbers come from the card's own geometry, measured in `cqi` — hundredths
 * of the card's content width, which is also what one CJK character measures at
 * a font size of `1cqi`. So a line holds `100 / size` characters, and the space
 * left for the question between the labels and the running time is 137 of those
 * units tall, or `94 / size` lines. Multiply: the card holds `9400 / size²`
 * characters, so the size that just fills it goes as 1/√(characters). The 82 is
 * that ideal with a margin, because the estimate assumes perfect packing and
 * real text breaks around punctuation and latin words.
 *
 * Past the floor the question is truncated instead of shrinking further — the
 * same trade the video's problem card makes, which never goes below 32 of its
 * 50.
 */
const questionSize = (text: string) => {
  const cqi = Math.min(17, Math.max(8.5, 82 / Math.sqrt(text.length)));
  return {
    // `cqi` scales with the card; the px bounds keep it readable in the grid
    // and stop it ballooning on the full-screen poster.
    fontSize: `clamp(11px, ${cqi.toFixed(1)}cqi, 44px)`,
    // `floor`, not `ceil`: a line that only half fits is a line cut through
    // the middle.
    WebkitLineClamp: Math.min(12, Math.max(3, Math.floor(94 / cqi))),
  };
};

export const Thumbnail: React.FC<{ short: ShortSummary }> = ({ short }) => {
  // Same fallback the composition uses, so a card and its video never disagree.
  const theme = isDesignId(short.design)
    ? designs[short.design]
    : themes[short.subject] ?? themes.general;
  const accent = theme.accents[0];
  const question = oneParagraph(short.topic);
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

      <p className="thumb__question" style={questionSize(question)}>
        <MathText text={question} />
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
