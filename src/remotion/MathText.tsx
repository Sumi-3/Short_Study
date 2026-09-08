import { Fragment } from "react";
import { Fraction } from "./Fraction";

/**
 * `^` or `_` followed by a braced group, a signed number, or a single letter.
 *
 * The unbraced forms follow what people actually type: `x^2` and `a_n` both
 * mean what they look like, while `x^2y` stops at the 2 — the same reading
 * LaTeX gives it. A subscript needs the braces as often as not, because a
 * sequence's index is usually an expression: `a_{n+1}`, `S_{2n}`.
 *
 * "Letter" has to include Greek and ∞, because the bounds of an integral are
 * where this is most needed: `∫_0^π` was setting its lower bound and leaving
 * `^π` sitting in the line as two literal characters.
 */
const SCRIPT = /([_^])(\{[^}]{1,12}\}|[-+]?\d+|[A-Za-z\u0391-\u03c9\u221e])/g;

/**
 * An intentionally small fraction syntax. Plain text cannot reveal whether
 * `3√19/4` means `(3√19)/4` or `3√(19/4)`, and it may not be maths at all
 * (`9/8に公開`). The generator therefore marks the two bounds explicitly.
 *
 * Braces inside either half, including nested fractions, stay literal. That is
 * the same shallow trade-off as `SCRIPT`, and keeps this prose renderer from
 * becoming a partial LaTeX parser.
 */
const FRACTION = /\\frac\{([^{}]*)\}\{([^{}]*)\}/g;

/**
 * Plain text with fractions, exponents and indices set as mathematical text.
 *
 * The question shown at the top of a video is the user's own sentence, typed
 * into a web form — so it arrives as `x^3 - 3x^2` or `a_{n+1} = a_n + 3` while
 * every formula inside the video goes through KaTeX and is properly typeset.
 * Reading `a_n` in the question and `aₙ` in the working makes them look like
 * different problems.
 *
 * This is deliberately not a LaTeX renderer: the string is prose with a little
 * maths in it, and prose is what most of it has to stay.
 */
export const MathText: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  const marks = [...text.matchAll(SCRIPT), ...text.matchAll(FRACTION)].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );

  for (const match of marks) {
    const at = match.index ?? 0;
    // Two patterns over one string can overlap; the earlier one wins.
    if (at < cursor) {
      continue;
    }
    if (at > cursor) {
      parts.push(text.slice(cursor, at));
    }
    if (match[0].startsWith("\\frac{")) {
      parts.push(
        <Fraction
          key={at}
          numerator={<MathText text={match[1]} />}
          denominator={<MathText text={match[2]} />}
        />,
      );
      cursor = at + match[0].length;
      continue;
    }
    const [whole, marker, raw] = match;
    const Tag = marker === "_" ? "sub" : "sup";
    parts.push(
      <Tag
        key={at}
        style={{
          fontSize: "0.62em",
          lineHeight: 1,
          verticalAlign: marker === "_" ? "sub" : "super",
        }}
      >
        {raw.startsWith("{") ? raw.slice(1, -1) : raw}
      </Tag>,
    );
    cursor = at + whole.length;
  }
  parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
};
