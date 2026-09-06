import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useFitToStage } from "../useFitToStage";
import { MathText } from "../MathText";
import { parseFormulaLine } from "../../formulaLines";
export { parseFormulaLine } from "../../formulaLines";

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
  text: boolean;
  delay: number;
  color: string;
  fontSize: number;
  timing: number;
  measureRef: (el: HTMLDivElement | null) => void;
}> = ({ latex, text, delay, color, fontSize, timing, measureRef }) => {
  const frame = useCurrentFrame() / timing;
  const theme = useTheme();
  const html = useMemo(() => text ? "" : render(latex), [latex, text]);

  return (
    <div
      ref={measureRef}
      style={{
        color,
        fontSize,
        fontFamily: text ? theme.fontFamily : undefined,
        fontWeight: text ? 700 : undefined,
        lineHeight: text ? 1.45 : undefined,
        whiteSpace: text ? "nowrap" : undefined,
        textAlign: text ? "left" : "center",
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
      {...(text
        ? { children: <MathText text={latex} /> }
        : { dangerouslySetInnerHTML: { __html: html } })}
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

/**
 * Rough marks live outside CSS layout bounds. Measure their actual SVG paths,
 * including the circle's sqrt(2) expansion and seeded wobble, instead of
 * estimating a tall fraction's enclosure from font size. getBBox includes the
 * complete path even while its stroke is being revealed. Screen matrices let
 * us compare it with the row, then undo Player/stage/fit scales; the padding
 * must be in the same unscaled pixels as the height fitter's measurement.
 */
/** Generous next to the 4px stroke and 14-20px padding an annotation uses. */
const ROOM_CAP = 160;

const Row: React.FC<{
  derivation: boolean;
  text: boolean;
  gap: number;
  textOffsetX: number;
  children: React.ReactNode;
}> = ({ derivation, text, gap, textOffsetX, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scaleX = rect.width / element.offsetWidth;
      const scaleY = rect.height / element.offsetHeight;
      /*
       * Undoing the applied scale converts screen pixels back into the layout
       * pixels the height fitter works in — but it divides the measurement
       * error by that same number, and this padding is one of the fitter's
       * own inputs. Below roughly a tenth the loop stops being stable: a
       * shrunk block measures a larger overflow, the overflow grows the row,
       * the taller row shrinks the block again. WebKit rode that loop to a
       * 21-million-pixel row and scaled the formula to nothing; Blink
       * happened to settle. Keep the last good reading instead of feeding a
       * degenerate one back in.
       */
      if (!(scaleX > 0.1) || !(scaleY > 0.1)) return;
      let x = 0;
      let y = 0;
      for (const svg of Array.from(element.querySelectorAll("svg"))) {
        // KaTeX radicals deliberately draw a huge SVG behind a clipped span;
        // it is the rough annotation's overflow that belongs in the padding.
        if (svg.closest(".katex")) continue;
        if (!svg.querySelector("path")) continue;
        /*
         * The drawn box in screen pixels, straight from layout.
         *
         * This was `getBBox()` mapped through `getScreenCTM()`, which is the
         * textbook way to ask where a path landed — but the two engines do
         * not agree on the matrix for an absolutely positioned annotation
         * overlay, and WebKit's answer put the mark hundreds of pixels
         * outside its own row. A client rect needs no matrix, already
         * includes the stroke, and is measured the same way as `rect` just
         * above, so the subtraction below compares like with like.
         */
        const markRect = svg.getBoundingClientRect();
        if (!markRect.width || !markRect.height) continue;
        // Eight extra pixels cover stroke joins and DOM rounding. Symmetric
        // padding keeps the equation centred even when the hand-drawn mark
        // is asymmetric.
        x = Math.max(
          x,
          (rect.left - markRect.left) / scaleX + 8,
          (markRect.right - rect.right) / scaleX + 8,
        );
        y = Math.max(
          y,
          (rect.top - markRect.top) / scaleY + 8,
          (markRect.bottom - rect.bottom) / scaleY + 8,
        );
      }
      // A rough annotation is drawn one stroke plus a little padding outside
      // the row. Anything past this is a measurement artefact rather than
      // ink, and letting it through is what turns a bad reading into a row
      // taller than the frame.
      x = Math.min(Math.ceil(x - 0.001), ROOM_CAP);
      y = Math.min(Math.ceil(y - 0.001), ROOM_CAP);
      setRoom((old) => old.x === x && old.y === y ? old : { x, y });
    };
    const resize = new ResizeObserver(measure);
    // Annotation paths arrive in a child layout effect and change after a
    // font swap. Observing both catches them before the delayed render ends.
    const mutation = new MutationObserver(measure);
    resize.observe(element);
    mutation.observe(element, { childList: true, subtree: true, attributes: true });
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);
  return (
    <div
      data-formula-measure
      style={{
        alignSelf: text ? "flex-start" : "center",
        paddingBlock: Math.max(derivation ? 0 : 22, room.y),
        paddingInline: room.x,
        // Scaling the full placement box around its centre keeps equations
        // centred. Offset only prose before that transform so its rendered
        // left edge remains the stage's content edge after a width fit.
        transform: text ? `translateX(${textOffsetX}px)` : undefined,
      }}
    >
      <div ref={ref} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
        {children}
      </div>
    </div>
  );
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
  durationInFrames?: number;
}> = ({ lines, caption, accent, compact = false, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // Limits belong to authoring/validation. Rendering never hides a row to fit.
  const shown = lines.map(parseFormulaLine);
  const derivation = !compact && shown.every(
    (line) => line.annotation === null && !line.text,
  );
  // Six rows need longer to arrive than three. Short narration must still
  // show the last answer/annotation before SceneShell's seven-frame exit.
  // Long scenes retain the existing cadence; only the entrance is compressed.
  const naturalEnd = (0.8 + Math.max(0, shown.length - 1) * 0.9) * fps + 45;
  const timing = durationInFrames === undefined
    ? 1
    : Math.min(1, Math.max(1, durationInFrames - 7 - fps * 0.5) / naturalEnd);
  const revealFrame = frame / timing;
  const lastDelay = (0.8 + Math.max(0, shown.length - 1) * 0.9) * fps;
  const dense = shown.length >= 3;
  // Keep the legacy 1–3-row sizes; four rows and five/six rows step down
  // before height fitting, so the extra prose uses space rather than crowding.
  const baseFontSize = compact ? 52
    : shown.length >= 5 ? 48 : shown.length === 4 ? 54 : dense ? 58 : 66;
  const gap = compact ? 24
    : shown.length >= 5 ? 12 : shown.length === 4 ? 18 : dense ? 26 : 36;
  const arrowSize = shown.length >= 4 ? 36 : dense ? 48 : 56;
  const { viewportRef, contentRef, scale, height, width } = useFitToStage(compact);
  // Compact companions are explanatory labels beside a diagram, not captions:
  // sharing the stage edge makes those short lines scan naturally with normal
  // statements while formulas still retain their centred visual anchor.
  const contentInset = 40;
  const textOffsetX = scale === 0
    ? 0
    : (contentInset - (1 - scale) * width / 2) / scale - contentInset;

  // Circle's outside ellipse reaches further than a rectangular box. Reserve
  // that room before fitting, rather than clipping the annotation at the edge.
  const hasCircle = shown.some((line) => line.annotation === "circle");
  const { register, fit } = useFitToWidth(
    (layout.width - layout.safeX * 2 - (derivation ? 56 : 96)) /
      (hasCircle ? Math.SQRT2 : 1),
  );
  const fontSize = baseFontSize * fit;

  return (
    <div
      ref={viewportRef}
      data-formula-viewport
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: compact ? height * scale : "100%",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        ref={contentRef}
        data-formula-content
        className={derivation ? undefined : "formula-statements"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap,
          // The 24px outer reserve also contains the line's 20px entrance
          // motion. Scaling this natural block includes every fixed-size gap.
          padding: "24px 40px",
          flexShrink: 0,
          // This is the placement box, rather than the width-fit measurement
          // box: text rows can start at its left edge while maths is centred.
          width: "100%",
          scale: String(scale),
          transformOrigin: "center",
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
        {shown.map(({ latex, annotation, text }, index) => {
          const delay = (0.8 + index * 0.9) * fps;
          const isLast = index === shown.length - 1;
          const kind = annotation ??
            (derivation && isLast && shown.length > 1 ? "box" : "plain");
          const Mark = kind === "plain" ? null : annotations[kind];
          const line = (
            <Line
              latex={latex}
              text={text}
              delay={delay}
              color={theme.ink}
              fontSize={text ? fontSize * 0.72 : fontSize}
              timing={timing}
              measureRef={register(index)}
            />
          );

          return (
            <Row
              key={index}
              derivation={derivation}
              text={text}
              gap={gap}
              textOffsetX={textOffsetX}
            >
              {derivation && index > 0 ? (
                <div
                  style={{
                    fontSize: arrowSize,
                    lineHeight: 1,
                    color: accent,
                    opacity: clamped(revealFrame, [delay - 8, delay], [0, 1]),
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
                  progress={clamped(revealFrame, [delay + 18, delay + 45], [0, 1])}
                >
                  {line}
                </Mark>
              ) : line}
            </Row>
          );
        })}

        {caption ? (
          <div
            ref={register(shown.length)}
            data-formula-measure
            style={{
              marginTop: compact ? 8 : dense ? 24 : 32,
              fontFamily: theme.fontFamily,
              fontWeight: 700,
              fontSize: (compact ? 30 : dense ? 38 : 42) * fit,
              width: "max-content",
              color: accent,
              textShadow: shadowOf(theme),
              opacity: clamped(revealFrame, [lastDelay + 20, lastDelay + 40], [0, 1]),
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
};
