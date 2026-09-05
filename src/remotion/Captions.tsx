import { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  createTikTokStyleCaptions,
  type Caption,
  type TikTokPage,
} from "@remotion/captions";
import { layout, plateOf, shadowOf, useTheme } from "./theme";

/**
 * Japanese tokens arrive back-to-back with only a few milliseconds between
 * them, so time alone never breaks a page — the character budget below is what
 * actually splits the narration. This stays high enough not to fight it: at
 * the measured 4.45 characters a second a full page is read in about five, and
 * a window shorter than that would cut a page in half and leave the remainder
 * on a line of its own.
 */
const SWITCH_CAPTIONS_EVERY_MS = 6000;

/**
 * Inner width is 1080 − 2×88 (safe area) − 2×32 (plate padding) = 840px, and a
 * full-width Japanese glyph is about 1em, so 11 chars at 66px fill one line.
 *
 * Two lines are allowed, which is what the band was always sized for: 2 × 66 ×
 * 1.3 plus the plate's 40px is the 212 of `captionBandHeight`. Holding it to
 * one line broke phrases that read as one — 「1回目に赤球が出たとき」 arrived as
 * three pages — and each page then held the screen for barely a second.
 */
const MAX_CHARS_PER_PAGE = 22;

/** A pause this long reads as a phrase boundary. */
const PHRASE_GAP_MS = 420;

/**
 * `createTikTokStyleCaptions()` groups purely by time, which for Japanese would
 * put a whole sentence on one page. Marking `pageBreakAfter` gives it the
 * phrase boundaries it cannot infer.
 */
const withPageBreaks = (captions: Caption[]): Caption[] => {
  const result: Caption[] = [];
  let charsOnPage = 0;

  for (const [index, caption] of captions.entries()) {
    const next = captions[index + 1];
    charsOnPage += caption.text.trim().length;

    const pageIsFull =
      next && charsOnPage + next.text.trim().length > MAX_CHARS_PER_PAGE;
    const phraseEnded = next && next.startMs - caption.endMs > PHRASE_GAP_MS;

    // A break the pipeline marked is a sentence boundary in the narration
    // itself, which beats anything inferable from timing here.
    const pageBreakAfter = Boolean(
      caption.pageBreakAfter || pageIsFull || phraseEnded,
    );
    if (pageBreakAfter) {
      charsOnPage = 0;
    }
    result.push({ ...caption, pageBreakAfter });
  }

  return result;
};

const nextStartMs = (page: TikTokPage, index: number) =>
  page.tokens[index + 1]?.fromMs ?? null;

const CaptionPage: React.FC<{ page: TikTokPage; accent: string }> = ({
  page,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const absoluteTimeMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill
      style={{
        top: layout.height - layout.captionBottom - layout.captionBandHeight,
        height: layout.captionBandHeight,
        paddingLeft: layout.safeX,
        paddingRight: layout.safeX,
        // Packed to the end, so a rare third line grows up into the gap above
        // instead of pushing the text off the bottom of the frame.
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 66,
          lineHeight: 1.3,
          textAlign: "center",
          color: theme.ink,
          textShadow: shadowOf(theme),
          // One plate behind the whole block: per-token plates leave seams.
          backgroundColor: plateOf(theme),
          borderRadius: 24,
          padding: "20px 32px",
          // Japanese has no inter-word spaces, so tokens are joined directly.
          whiteSpace: "pre-wrap",
          scale: interpolate(frame, [0, 4], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
        }}
      >
        {page.tokens.map((token, tokenIndex) => {
          // The last token that has started, rather than one strictly inside
          // its own window — otherwise the highlight blinks off in the gaps
          // between tokens.
          const isActive =
            token.fromMs <= absoluteTimeMs &&
            (nextStartMs(page, tokenIndex) ?? Infinity) > absoluteTimeMs;

          return (
            <span
              key={`${token.fromMs}-${tokenIndex}`}
              style={{
                color: isActive ? accent : theme.ink,
                // Scaling the active token would reflow the line, so the
                // highlight is colour plus a glow only.
                textShadow: isActive
                  ? `0 0 28px ${accent}, ${shadowOf(theme)}`
                  : shadowOf(theme),
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Captions: React.FC<{
  captions: Caption[];
  accent: string;
}> = ({ captions, accent }) => {
  const { fps } = useVideoConfig();

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: withPageBreaks(captions),
        combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
      }),
    [captions],
  );

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (page.durationMs / 1000) * fps + 0.4 * fps,
        );
        const durationInFrames = endFrame - startFrame;

        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={durationInFrames}
            name={`Caption ${index + 1}`}
          >
            <CaptionPage page={page} accent={accent} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
