import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Box,
  Bracket,
  Circle,
  Highlight,
  StrikeThrough,
  Underline,
} from "@remotion/rough-notation";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "../clamped";
import { layout, shadowOf, useTheme, withAlpha } from "../theme";
import { useFitToWidth } from "../useFitToWidth";

const render = (latex: string) => {
  try {
    return katex.renderToString(latex, {
      displayMode: true,
      // A malformed expression should show as red source text, not crash the
      // whole video.
      throwOnError: false,
      output: "html",
    });
  } catch {
    return latex;
  }
};

const Line: React.FC<{
  latex: string;
  delay: number;
  color: string;
  fontSize: number;
  measureRef: (el: HTMLDivElement | null) => void;
}> = ({ latex, delay, color, fontSize, measureRef }) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const html = useMemo(() => render(latex), [latex]);

  return (
    <div
      ref={measureRef}
      style={{
        color,
        fontSize,
        // `.katex-display` is a block and would report the container's width.
        // Shrink-wrapping it makes the measured width the formula's own.
        width: "max-content",
        textShadow: shadowOf(theme),
        opacity: clamped(frame, [delay, delay + 12], [0, 1], theme.easing),
        translate: clamped(
          frame,
          [delay, delay + 16],
          ["0px 20px", "0px 0px"],
          theme.easing,
        ),
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * A deliberately small, line-level language, outside LaTeX rather than custom
 * commands inside it. A prefix cannot split a fraction, a nested brace or an
 * aligned environment, and needs no new field in the API's 19-field scene.
 * Only a known marker with a nonempty body is consumed; ordinary LaTeX and
 * unrecognised input still go through the existing error-tolerant renderer.
 */
const annotations = {
  box: Box,
  underline: Underline,
  circle: Circle,
  highlight: Highlight,
  strike: StrikeThrough,
  bracket: Bracket,
} as const;

type Annotation = keyof typeof annotations | "plain";

export const parseFormulaLine = (line: string): {
  latex: string;
  annotation: Annotation | null;
} => {
  const match =
    /^\s*\[(box|underline|circle|highlight|strike|bracket|plain)\]\s*([\s\S]+)$/.exec(line);
  return match && match[2].trim()
    ? { latex: match[2].trim(), annotation: match[1] as Annotation }
    : { latex: line, annotation: null };
};

/**
 * Unmarked standalone formulas keep the old derivation: arrows and a final
 * box. Steps stay visible rather than morphing away, so someone following a
 * short can still compare the substitution with the formula that justified it.
 * Any explicit marker opts the whole block into annotated statements;
 * inserting a derivation arrow between a rejected candidate and a condition
 * would assert a mathematical implication that the author did not mean.
 * Companion lines use that same statement layout even without markers, since
 * their reference is the diagram above, not necessarily the preceding line.
 */
export const Formula: React.FC<{
  lines: string[];
  caption: string;
  accent: string;
  compact?: boolean;
}> = ({ lines, caption, accent, compact = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const shown = lines.slice(0, compact ? 2 : 3).map(parseFormulaLine);
  const derivation = !compact && shown.every((line) => line.annotation === null);
  const lastDelay = (0.8 + Math.max(0, shown.length - 1) * 0.9) * fps;
  const dense = shown.length >= 3;
  const baseFontSize = compact ? 52 : dense ? 58 : 66;
  const gap = compact ? 24 : dense ? 26 : 36;
  const arrowSize = dense ? 48 : 56;

  // Circle's outside ellipse reaches further than a rectangular box. Reserve
  // that room before fitting, rather than clipping the annotation at the edge.
  const hasCircle = shown.some((line) => line.annotation === "circle");
  const { register, fit } = useFitToWidth(
    (layout.width - layout.safeX * 2 - (derivation ? 56 : 80)) /
      (hasCircle ? 1.42 : 1),
  );
  const fontSize = baseFontSize * fit;

  return (
    <div
      className={derivation ? undefined : "formula-statements"}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
        // The grid gives the remaining height to the SVG. Two compact lines
        // own only their natural height, so a single equation frees more room
        // for the figure instead of leaving half an empty equation panel.
        height: compact ? "auto" : "100%",
        padding: compact ? "24px 40px" : undefined,
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      {/* Display math normally adds an em of margin on each side vertically.
          Keep that old spacing for derivations, but annotate the actual math
          in statement mode: circling those margins would circle empty space
          and take height away from the companion diagram. */}
      {!derivation ? (
        <style>{`.formula-statements .katex-display { margin: 0; }`}</style>
      ) : null}
      {shown.map(({ latex, annotation }, index) => {
        const delay = (0.8 + index * 0.9) * fps;
        const isLast = index === shown.length - 1;
        const kind = annotation ??
          (derivation && isLast && shown.length > 1 ? "box" : "plain");
        const Mark = kind === "plain" ? null : annotations[kind];
        const line = (
          <Line
            latex={latex}
            delay={delay}
            color={theme.ink}
            fontSize={fontSize}
            measureRef={register(index)}
          />
        );

        return (
          <div
            key={index}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap,
              // Rough annotations draw outside layout bounds. Reserve their
              // vertical reach as well as fitting their width, especially the
              // ellipse around a value, so it cannot meet the neighbouring row.
              paddingBlock: derivation ? 0 : kind === "circle" ? fontSize * 0.8 : 14,
            }}
          >
            {derivation && index > 0 ? (
              <div
                style={{
                  fontSize: arrowSize,
                  lineHeight: 1,
                  color: accent,
                  opacity: clamped(frame, [delay - 8, delay], [0, 1]),
                }}
              >
                ↓
              </div>
            ) : null}

            {Mark ? (
              <Mark
                color={kind === "highlight" ? withAlpha(accent, 0.28) : accent}
                strokeWidth={4}
                padding={{ top: 14, right: 20, bottom: 14, left: 20 }}
                {...(kind === "bracket" ? { bracketLeft: true, bracketRight: true } : {})}
                {...(kind === "circle" ? { box: "around" as const } : {})}
                progress={clamped(frame, [delay + 18, delay + 45], [0, 1])}
              >
                {line}
              </Mark>
            ) : line}
          </div>
        );
      })}

      {caption ? (
        <div
          ref={register(shown.length)}
          style={{
            marginTop: compact ? 8 : dense ? 24 : 32,
            fontFamily: theme.fontFamily,
            fontWeight: 700,
            fontSize: (compact ? 30 : dense ? 38 : 42) * fit,
            width: "max-content",
            color: accent,
            textShadow: shadowOf(theme),
            opacity: clamped(frame, [lastDelay + 20, lastDelay + 40], [0, 1]),
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};
