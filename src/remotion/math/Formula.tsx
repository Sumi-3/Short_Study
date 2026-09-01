import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Box } from "@remotion/rough-notation";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, shadowOf, useTheme } from "../theme";
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
        opacity: interpolate(frame, [delay, delay + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
        translate: interpolate(frame, [delay, delay + 16], ["0px 20px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * One to three LaTeX lines, revealed in order with an arrow between them.
 *
 * This is the stand-in for a manim-style morph: rather than one expression
 * physically turning into the next, the steps stack up and the result is boxed.
 * On a 60-second vertical short that reads faster anyway — the viewer can see
 * both sides at once instead of having to catch the transition.
 */
export const Formula: React.FC<{
  lines: string[];
  caption: string;
  accent: string;
}> = ({ lines, caption, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const shown = lines.slice(0, 3);
  const lastDelay = (0.8 + (shown.length - 1) * 0.9) * fps;
  // Three lines plus two arrows plus the box and caption only clear the
  // caption band at reduced sizing.
  const dense = shown.length >= 3;
  const baseFontSize = dense ? 58 : 66;
  const gap = dense ? 26 : 36;
  const arrowSize = dense ? 48 : 56;

  // The stage's inner width, less the room the box around the last line
  // draws into.
  const { register, fit } = useFitToWidth(layout.width - layout.safeX * 2 - 56);

  const fontSize = baseFontSize * fit;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
        height: "100%",
      }}
    >
      {shown.map((latex, index) => {
        const delay = (0.8 + index * 0.9) * fps;
        const isLast = index === shown.length - 1;

        return (
          <div key={latex} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
            {index > 0 ? (
              <div
                style={{
                  fontSize: arrowSize,
                  lineHeight: 1,
                  color: accent,
                  opacity: interpolate(frame, [delay - 8, delay], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                ↓
              </div>
            ) : null}

            {isLast && shown.length > 1 ? (
              <Box
                color={accent}
                strokeWidth={4}
                padding={{ top: 14, right: 20, bottom: 14, left: 20 }}
                progress={interpolate(frame, [lastDelay + 18, lastDelay + 45], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
              >
                <Line
                  latex={latex}
                  delay={delay}
                  color={theme.ink}
                  fontSize={fontSize}
                  measureRef={register(index)}
                />
              </Box>
            ) : (
              <Line
                latex={latex}
                delay={delay}
                color={theme.ink}
                fontSize={fontSize}
                measureRef={register(index)}
              />
            )}
          </div>
        );
      })}

      {caption ? (
        <div
          style={{
            marginTop: dense ? 24 : 32,
            fontFamily: theme.fontFamily,
            fontWeight: 700,
            fontSize: dense ? 38 : 42,
            color: accent,
            textShadow: shadowOf(theme),
            opacity: interpolate(frame, [lastDelay + 20, lastDelay + 40], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};
