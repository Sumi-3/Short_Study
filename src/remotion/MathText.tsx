import { Fragment } from "react";

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
 * Plain text with exponents and indices set as exponents and indices.
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

  for (const match of text.matchAll(SCRIPT)) {
    const at = match.index ?? 0;
    if (at > cursor) {
      parts.push(text.slice(cursor, at));
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
