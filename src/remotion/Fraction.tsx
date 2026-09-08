/**
 * A stacked fraction, sized to sit inside a line of running text.
 *
 * PROTOTYPE — under investigation, not wired into anything permanently.
 *
 * The halves are set at 0.52em so the whole stack is about 1.15em tall, which
 * fits the 1.3 line-height the captions and the problem card already use. Any
 * larger and the stack grows out of its line box: the caption band is 212px,
 * which is exactly two 66px lines plus the plate's padding, with no slack.
 */
export const Fraction: React.FC<{ numerator: string; denominator: string }> = ({
  numerator,
  denominator,
}) => (
  <span
    style={{
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      // The bar, rather than the baseline of either half, is what should line
      // up with the surrounding text.
      verticalAlign: "middle",
      fontSize: "0.58em",
      lineHeight: 1.08,
      // Against the 1em text on either side the stack reads as one glyph, so
      // it needs the sidebearing a glyph would have.
      margin: "0 0.12em",
    }}
  >
    <span>{numerator}</span>
    <span
      style={{
        // A border rather than a character: it has to span whichever half is
        // wider, which no glyph can do.
        borderTop: "0.09em solid currentColor",
        width: "100%",
      }}
    >
      {denominator}
    </span>
  </span>
);

/** Exactly the shape `applyDisplaySpelling` emits: whole unsigned integers. */
export const WHOLE_FRACTION = /^([1-9][0-9]*)\/(0|[1-9][0-9]*)$/;
