import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme, withAlpha } from "../theme";

/** 句点は全角ピリオドと読点の混在があるため、終止記号をまとめて区切りに使う。 */
const SENTENCE = /[^．。！？]+[．。！？]?/g;

const splitSentences = (text: string) =>
  (text.match(SENTENCE) ?? []).map((sentence) => sentence.trim()).filter(Boolean);

/**
 * 文ごとの表示区間を文字数で按分する。TTS の発話速度はほぼ一定なので、尺の比は
 * 文字数の比に近い。録音を入れたら caption の実時間へ置き換える。
 */
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

export const IntroCaptions: React.FC<{ text: string; durationInFrames: number }> = ({
  text,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  const windows = windowsOf(sentences, durationInFrames);
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
