/**
 * A stacked fraction, sized to sit inside a line of running text.
 *
 * Caption text is 66px at line-height 1.3, so each of its two line boxes is
 * 85.8px and the 212px band has no spare vertical room. Two 0.58em halves at
 * 1.08 line-height make a 1.253em (82.7px) stack; increasing that size lets a
 * two-line caption expand upward into the explanation.
 */
export const Fraction: React.FC<{
  numerator: React.ReactNode;
  denominator: React.ReactNode;
}> = ({
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
      // Cards use 16px body text. A 0.58em fraction is only 9.28px there,
      // while the 11px floor leaves the 66px video captions unchanged.
      fontSize: "max(0.68em, 11px)",
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

/** Match the whole token merged from 「分の」; never infer bounds inside prose. */
export const WHOLE_FRACTION = /^((?:(?:0|[1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω])?√)?(?:0|[1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω]))\/([1-9][0-9]*|[A-Za-zΑ-ΡΣ-ω])$/;
