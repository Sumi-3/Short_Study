import { Fragment } from "react";

/**
 * `^` followed by a braced group, a signed number, or a single letter.
 *
 * The unbraced forms follow what people actually type: `x^2` and `2^10` both
 * mean what they look like, while `x^2y` stops at the 2 — the same reading
 * LaTeX gives it.
 */
const SUPERSCRIPT = /\^(\{[^}]{1,12}\}|[-+]?\d+|[a-zA-Z])/g;

/**
 * Plain text with exponents set as exponents.
 *
 * The question shown at the top of a video is the user's own sentence, typed
 * into a web form — so it arrives as `x^3 - 3x^2` while every formula inside
 * the video goes through KaTeX and is properly typeset. Reading `x^2` in the
 * question and `x²` in the working makes them look like different problems.
 *
 * This is deliberately not a LaTeX renderer: the string is prose with a little
 * maths in it, and prose is what most of it has to stay.
 */
export const MathText: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SUPERSCRIPT)) {
    const at = match.index ?? 0;
    if (at > cursor) {
      parts.push(text.slice(cursor, at));
    }
    const raw = match[1];
    parts.push(
      <sup
        key={at}
        style={{ fontSize: "0.62em", lineHeight: 1, verticalAlign: "super" }}
      >
        {raw.startsWith("{") ? raw.slice(1, -1) : raw}
      </sup>,
    );
    cursor = at + match[0].length;
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
