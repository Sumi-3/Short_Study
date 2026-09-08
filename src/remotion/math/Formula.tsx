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
  carried?: boolean;
  measureRef: (el: HTMLDivElement | null) => void;
}> = ({ latex, text, delay, color, fontSize, timing, carried = false, measureRef }) => {
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
        opacity: carried ? 0.68 : clamped(frame, [delay, delay + 12], [0, 1], theme.easing),
        translate: carried ? "0px 0px" : clamped(
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

/** Generous next to the 4px stroke and 14-20px padding an annotation uses. */
const ROOM_CAP = 160;

/**
 * A row, plus the room its rough mark needs outside CSS layout bounds.
 *
 * The mark is measured rather than estimated from font size, because the
 * circle's sqrt(2) expansion and the seeded wobble are not derivable from the
 * type — and a tall fraction's enclosure even less so. The padding has to come
 * back in the unscaled pixels the height fitter works in, which is what the
 * division by the applied scale below is for, and also what makes that
 * division dangerous; see the guard inside.
 */

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
 * A [substitute: reason] explicitly connects only its incoming edge, even in
 * statement mode; restoring all arrows would also connect unrelated rows.
 * It still opts out of automatic boxing, so authors mark the actual answer.
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
    (line) => line.annotation === null && !line.text && !line.substitution,
  );
  // Six rows need longer to arrive than three. Short narration must still
  // show the last answer/annotation before SceneShell's seven-frame exit.
  // Long scenes retain the existing cadence; only the entrance is compressed.
  const newLineCount = shown.filter((line) => line.annotation !== "carry").length;
  const naturalEnd = (0.8 + Math.max(0, newLineCount - 1) * 0.9) * fps + 45;
  const timing = durationInFrames === undefined
    ? 1
    : Math.min(1, Math.max(1, durationInFrames - 7 - fps * 0.5) / naturalEnd);
  const revealFrame = frame / timing;
  const lastDelay = (0.8 + Math.max(0, newLineCount - 1) * 0.9) * fps;
  const dense = shown.length >= 3;
  // New scripts use 3–4 rows so larger maths and 86%-size reasons can stay
  // readable. Keep six-row legacy scripts complete at a more modest 60px;
  // useFitToStage still fits fractions, marks and captions as one block.
  // Spending less height on display-math margins below avoids immediately
  // undoing this increase with the height fitter. Completeness wins only
  // when the actual block is too tall/wide, rather than hiding a later answer.
  const baseFontSize = compact ? 58
    : shown.length >= 5 ? 60 : shown.length === 4 ? 64 : dense ? 70 : 76;
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
        className={derivation ? "formula-derivation" : "formula-statements"}
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
        {/* Default 1em margins would spend 720px on empty space at six
            60px rows, forcing even short equations back down in size. A
            quarter em plus the existing gaps/arrows keeps derivations clear;
            statement marks still enclose only the actual mathematical ink. */}
        <style>{`.formula-derivation .katex-display { margin: 0.25em 0; }
          .formula-statements .katex-display { margin: 0; }`}</style>
        {shown.map(({ latex, annotation, text, substitution }, index) => {
          const carried = annotation === "carry";
          const newIndex = index - (shown[0]?.annotation === "carry" ? 1 : 0);
          const delay = (0.8 + Math.max(0, newIndex) * 0.9) * fps;
          const isLast = index === shown.length - 1;
          const kind = annotation ??
            (derivation && isLast && shown.length > 1 ? "box" : "plain");
          const Mark = kind === "plain" || kind === "carry" ? null : annotations[kind];
          const line = (
            <Line
              latex={latex}
              text={text}
              delay={delay}
              color={theme.ink}
              fontSize={text ? fontSize * 0.86 : fontSize}
              timing={timing}
              carried={carried}
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
              {carried ? (
                // A stable label and muted ink make the repeated premise distinct
                // from a newly revealed step without shrinking its mathematical ink.
                <div data-formula-carry style={{
                  fontFamily: theme.fontFamily, fontSize: fontSize * 0.62,
                  lineHeight: 1, color: theme.ink, opacity: 0.68,
                }}>前の式</div>
              ) : null}
              {substitution && index > 0 && !shown[index - 1].text ? (
                // Keep the arrow on the equations' centreline and the reason
                // beside it. A bounded prose column wraps long labels without
                // truncation; its full height and the gap are inside Row so
                // useFitToStage reserves them, including in diagram companions.
                // This width is independent of the fitted result: no measured
                // scale is divided back into a layout input.
                <div data-formula-substitution style={{
                  display: "grid", gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center", columnGap: 16,
                  width: compact ? 620 : 720,
                  opacity: clamped(revealFrame, [delay - 8, delay], [0, 1]),
                }}>
                  <span style={{ gridColumn: 2, color: accent, fontSize: arrowSize, lineHeight: 1 }}>↓</span>
                  <span style={{
                    gridColumn: 3, minWidth: 0, fontFamily: theme.fontFamily,
                    fontWeight: 700, fontSize: fontSize * 0.7, lineHeight: 1.35,
                    color: theme.ink, overflowWrap: "anywhere", whiteSpace: "normal",
                  }}><MathText text={substitution} /></span>
                </div>
              ) : derivation && index > 0 ? (
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
              // Recover most of the added text height from the old empty margin.
              // Both width fit and stage fit still include the caption and marks;
              // 5–6 rows and diagram companions start lower to avoid always shrinking.
              marginTop: compact ? 0 : dense ? 8 : 16,
              fontFamily: theme.fontFamily,
              fontWeight: 700,
              fontSize: (compact ? 46 : shown.length >= 5 ? 48 : shown.length === 4 ? 52 : dense ? 56 : 60) * fit,
              lineHeight: 1.3,
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
