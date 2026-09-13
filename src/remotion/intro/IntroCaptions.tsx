import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "../theme";
import { introNarrationForText, type IntroWordBoundary } from "./script";

/** 句点は全角ピリオドと読点の混在があるため、終止記号をまとめて区切りに使う。 */
const SENTENCE = /[^．。！？]+[．。！？]?/g;

const splitSentences = (text: string) =>
  (text.match(SENTENCE) ?? []).map((sentence) => sentence.trim()).filter(Boolean);

/** JSON がない間も Studio を開けるよう、従来の文字数按分を残す。 */
const windowsOf = (sentences: string[], durationInFrames: number) => {
  const totalChars = sentences.reduce((count, sentence) => count + sentence.length, 0);
  let start = 0;

  return sentences.map((text) => {
    const span = (text.length / totalChars) * durationInFrames;
    const window = { text, start, end: start + span };
    start = window.end;
    return window;
  });
};

const spokenLength = (text: string) =>
  text.replace(/[\s　．。！？、，,.!]/g, "").length;

const windowsFromWordBoundaries = (
  sentences: string[],
  boundaries: readonly IntroWordBoundary[],
  fps: number,
) => {
  let boundaryIndex = 0;
  const windows: { text: string; start: number; end: number }[] = [];

  for (const text of sentences) {
    const targetLength = spokenLength(text);
    let spoken = 0;
    let first: IntroWordBoundary | null = null;
    let last: IntroWordBoundary | null = null;

    while (boundaryIndex < boundaries.length && spoken < targetLength) {
      const boundary = boundaries[boundaryIndex++];
      const length = spokenLength(boundary.text);
      if (length === 0) continue;
      if (!first) first = boundary;
      last = boundary;
      spoken += length;
    }

    if (
      !first ||
      !last ||
      spoken < targetLength ||
      !Number.isFinite(first.fromMs) ||
      !Number.isFinite(last.toMs)
    ) {
      return null;
    }
    windows.push({ text, start: (first.fromMs / 1000) * fps, end: (last.toMs / 1000) * fps });
  }

  return windows;
};

export const IntroCaptions: React.FC<{ text: string; durationInFrames: number }> = ({
  text,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  const boundaries = introNarrationForText(text)?.wordBoundaries;
  const windows = boundaries
    ? windowsFromWordBoundaries(sentences, boundaries, fps) ?? windowsOf(sentences, durationInFrames)
    : windowsOf(sentences, durationInFrames);
  // 端数で最後の区間を1 frame 超えることがあるため、溢れたら末尾に留める。
  const active = windows.find((window) => frame < window.end) ?? windows[windows.length - 1];

  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        bottom: 26,
        padding: "13px 32px",
        borderRadius: theme.radius,
        backgroundColor: theme.plate,
        border: `2px solid ${withAlpha(theme.ink, 0.12)}`,
        color: theme.ink,
        fontFamily: theme.fontFamily,
        fontSize: 31,
        fontWeight: 700,
        lineHeight: 1.45,
        textAlign: "center",
        boxShadow: `0 10px 32px ${withAlpha(theme.ink, 0.12)}`,
        // 差し替わった瞬間に前の文が残像として読まれないよう、文ごとに立ち上げ直す。
        opacity: interpolate(frame, [active.start, active.start + fps * 0.2], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: theme.easing,
        }),
      }}
    >
      {active.text}
    </div>
  );
};
