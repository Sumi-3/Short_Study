import { Fragment } from "react";
import katex from "katex";
// LibraryCard can load MathText without Formula, so the fonts belong here too.
import "katex/dist/katex.min.css";
import { Fraction } from "./Fraction";

/** Leading, so an author who writes `\textstyle` themselves still overrides it. */
const DISPLAY_STYLE = "\\displaystyle ";

/**
 * Only the author can locate a formula in prose without changing its meaning.
 * Doubled/escaped dollars are literal, and ambiguous or unfinished delimiters
 * stay visible rather than swallowing part of the question.
 */
export const MathText: React.FC<{ text: string }> = ({ text }) => {
  if (!text.includes("$")) return <LegacyMathText text={text} />;

  const delimiters = [...text.matchAll(/\\[\s\S]|\$+/g)]
    .filter((match) => match[0].startsWith("$"));
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < delimiters.length - 1; i++) {
    const open = delimiters[i];
    const close = delimiters[i + 1];
    if (open[0] !== "$" || close[0] !== "$") continue;
    const tex = text.slice(open.index + 1, close.index);
    i++;
    if (!tex.trim()) continue;

    parts.push(text.slice(cursor, open.index));
    try {
      const html = katex.renderToString(DISPLAY_STYLE + tex, {
        // Inline, so the formula sits in the sentence rather than breaking it
        // into its own centred block. `displayMode` also picks the *style*
        // though, and text style is what puts a limit's condition beside `lim`
        // instead of under it, and sets fractions small. `\displaystyle` asks
        // for the style without the block, which is how the worked solution
        // beside it is already set.
        displayMode: false,
        throwOnError: false,
        output: "html",
      });
      parts.push(<span key={open.index} dangerouslySetInnerHTML={{ __html: html }} />);
    } catch {
      // Unexpected renderer failures must retain the source as escaped prose.
      parts.push(text.slice(open.index, close.index + 1));
    }
    cursor = close.index + 1;
  }
  parts.push(text.slice(cursor));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
};

// The hand-positioned branches below are a fallback for existing data without
// $ delimiters. Keeping their metrics preserves already-generated videos.

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
const SCRIPT_VALUE = "\\{[^}]{1,12}\\}|[-+]?\\d+|[A-Za-zΑ-ω∞]";
const SCRIPT = new RegExp(`([_^])(${SCRIPT_VALUE})`, "g");

/** `lim` and the condition that belongs under it, taken as one unit. */
const LIMIT = new RegExp(`lim_(${SCRIPT_VALUE})`, "g");

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
 * The operators a typesetter draws taller than the text around them. At a
 * body-text 1em an `∫` is a thin stroke barely above x-height, which is not
 * what the same symbol looks like in the worked solution beside it — KaTeX
 * gives it its own display-size glyph.
 */
const OPERATORS = "∫∬∭∮∑Σ∏";
const LARGE_OPERATOR = new RegExp(`[${OPERATORS}]`, "g");

/**
 * 1.5em is as large as the glyph can be drawn without paying for it in layout.
 *
 * An inline box contributes `font-size × line-height` to the line, so the 0.68
 * here keeps this span's contribution at 1.02em — inside the line-height the
 * problem card and the library card already run at, which is why enlarging the
 * operator does not push the lines apart the way a stacked fraction does. The
 * offset then drops the taller glyph back onto the text's own baseline.
 */
const OPERATOR_STYLE: React.CSSProperties = {
  fontSize: "1.5em",
  lineHeight: 0.68,
  verticalAlign: "-0.16em",
  // The glyph's own side bearing is enlarged along with it, which opens a gap
  // wide enough to read as a space before the bounds — `∫ ₀^π` rather than the
  // bounds sitting against the operator. Taking back a tenth of the enlarged em
  // closes it without letting the two collide.
  marginRight: "-0.1em",
};

/**
 * `lim` with its condition underneath, the way it is typeset.
 *
 * This was first tried as an absolutely positioned subscript, so the line could
 * not grow: the condition landed 7.3px inside the `lim` glyphs and there was
 * nowhere to move it — at line-height 1.55 an 18px line leaves 3.6px of leading
 * under the glyph box while the 0.55em condition needs 9.9px. Painting outside
 * the line is what made it illegible, so it lays out in the flow instead and
 * the line grows to hold it. The card's fitter absorbs that, and formulas are
 * worth the room.
 */
const LIMIT_STYLE: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  verticalAlign: "middle",
  lineHeight: 1.04,
  margin: "0 0.14em",
};

/** Wide conditions like `n→∞` set the unit's width; `lim` centres over them. */
const LIMIT_CONDITION_STYLE: React.CSSProperties = {
  fontSize: "0.55em",
  lineHeight: 1.04,
  whiteSpace: "nowrap",
};

/**
 * Legacy question text accepted `\\frac`, making occasional LaTeX spillover
 * inevitable. Keep the few commands whose plain symbols fit
 * this renderer; for anything else remove only the slash, because deleting an
 * unknown command would silently discard part of the question while showing
 * the slash is worse than leaving its readable name as prose.
 */
const normaliseCommands = (text: string) =>
  text
    .replace(/\\sqrt\{([^{}]*)\}/g, "√$1")
    .replace(/\\(lim|sum|prod|int|to|infty|theta|pi|le|ge|times|cdot)/g, (_, command: string) => ({
      lim: "lim",
      sum: "∑",
      prod: "∏",
      int: "∫",
      to: "→",
      infty: "∞",
      theta: "θ",
      pi: "π",
      le: "≦",
      ge: "≧",
      times: "×",
      cdot: "・",
    })[command]!)
    .replace(/\\(?!frac(?:\{|$))/g, "");

const LegacyMathText: React.FC<{ text: string }> = ({ text }) => {
  const source = normaliseCommands(text);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  const marks = [
    ...source.matchAll(LIMIT),
    ...source.matchAll(SCRIPT),
    ...source.matchAll(FRACTION),
    ...source.matchAll(LARGE_OPERATOR),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const match of marks) {
    const at = match.index ?? 0;
    // Two patterns over one string can overlap; the earlier one wins.
    if (at < cursor) {
      continue;
    }
    if (at > cursor) {
      parts.push(source.slice(cursor, at));
    }
    if (match[0].startsWith("lim_")) {
      const condition = match[1];
      parts.push(
        <span key={at} style={LIMIT_STYLE}>
          <span>lim</span>
          <span style={LIMIT_CONDITION_STYLE}>
            {condition.startsWith("{") ? condition.slice(1, -1) : condition}
          </span>
        </span>,
      );
      cursor = at + match[0].length;
      continue;
    }
    if (OPERATORS.includes(match[0])) {
      parts.push(
        <span key={at} style={OPERATOR_STYLE}>
          {match[0]}
        </span>,
      );
      cursor = at + 1;
      continue;
    }
    if (match[0].startsWith("\\frac{")) {
      parts.push(
        <Fraction
          key={at}
          numerator={<LegacyMathText text={match[1]} />}
          denominator={<LegacyMathText text={match[2]} />}
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
  parts.push(source.slice(cursor));

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
};
