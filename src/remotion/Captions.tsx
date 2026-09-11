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
import { BOLD_MATH, BoldMathStyle, MathText } from "./MathText";
import { layout, plateOf, shadowOf, useTheme } from "./theme";

/**
 * 日本語 token は数 milliseconds 間隔で連続して届くため、時間だけでは page が分かれない。実際に
 * narration を分けるのは以下の文字数予算である。これと競合しないよう十分大きく保つ。実測で毎秒
 * 4.45文字なら1 page を読むのに約5秒かかり、これより短い window では page が途中で切れ、残りが
 * 1行だけに残ってしまう。
 */
const SWITCH_CAPTIONS_EVERY_MS = 6000;

/**
 * 内幅は 1080 − 2×48（`captionSafeX`）− 2×32（plate padding）= 920px。全角日本語 glyph は約1emなので、
 * 66pxでは13文字強で1行が埋まる。
 *
 * 2行を許す。band は元からそのためのサイズで、2 × 66 × 1.3 に plate の40pxを加えたものが
 * `captionBandHeight` の212である。1行に縛ると、本来ひと続きに読む「1回目に赤球が出たとき」が
 * 3 page に分かれ、各 page はほぼ1秒しか画面に残らなかった。`captionBottom` を下げても同じ
 * band を移動するだけで、66px type と212px高は変わらない。
 *
 * この予算は内幅に連動する。840pxだった頃の22文字は2行を埋めきる値だったので、920pxへ広げた分だけ
 * 上げないと2行目が短いまま余る。1行13文字の2行で26文字だが、25に留める。1文字あたりの実測が
 * 毎秒4.45文字なので、26文字は5.8秒で `SWITCH_CAPTIONS_EVERY_MS` の6秒にほぼ接してしまう。
 */
const MAX_CHARS_PER_PAGE = 25;

/**
 * 字幕 1 page に載る文字数の見積もり。`$\frac{1}{2}$` は 13 文字だが画面では 1〜2 文字幅なので、
 * 数式は命令と括弧を除いた文字数を 0.6 倍して数える。生の長さで数えると分数を 1 つ含む page が
 * 半分で切れ、続きが 1 行だけ残る。
 */
const displayLength = (text: string) =>
  text.trim().replace(/\$([^$]+)\$/g, (_, tex: string) =>
    "＊".repeat(Math.max(1, Math.round(tex.replace(/\\[a-zA-Z]+|[{}^_]/g, "").length * 0.6))),
  ).length;

/** この長さの pause は句の境界として読める。 */
const PHRASE_GAP_MS = 420;

/**
 * `createTikTokStyleCaptions()` は時間だけで group 化するため、日本語では文全体を1 page に
 * 入れてしまう。`pageBreakAfter` を付け、推測できない句の境界を渡す。
 */
const withPageBreaks = (captions: Caption[]): Caption[] => {
  const result: Caption[] = [];
  let charsOnPage = 0;

  for (const [index, caption] of captions.entries()) {
    const next = captions[index + 1];
    charsOnPage += displayLength(caption.text);

    const pageIsFull =
      next && charsOnPage + displayLength(next.text) > MAX_CHARS_PER_PAGE;
    const phraseEnded = next && next.startMs - caption.endMs > PHRASE_GAP_MS;

    // pipeline が付けた break は字幕本文の句読点であり、ここで時間から推測するより確かである。
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
        paddingLeft: layout.captionSafeX,
        paddingRight: layout.captionSafeX,
        // 下端寄せにして、まれな3行目は text をフレーム下へ押し出さず上の gap へ伸ばす。
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {/* 字幕は 900 で組むので、数式もその近くの太さに合わせる（MathText.tsx の BOLD_MATH 参照）。 */}
      <BoldMathStyle />
      <div
        className={BOLD_MATH}
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontSize: 66,
          lineHeight: 1.3,
          textAlign: "center",
          color: theme.ink,
          textShadow: shadowOf(theme),
          // block 全体の背後に1枚の plate を置く。token ごとの plate では継ぎ目が残る。
          backgroundColor: plateOf(theme),
          borderRadius: 24,
          padding: "20px 32px",
          // 日本語には語間 space がないため、token は直接つなぐ。
          whiteSpace: "pre-wrap",
          scale: interpolate(frame, [0, 4], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
        }}
      >
        {page.tokens.map((token, tokenIndex) => {
          // 自身の window 内に厳密にある token でなく、開始済みの最後の token を選ぶ。そうしないと
          // token 間の gap で highlight が消滅して点滅する。
          const isActive =
            token.fromMs <= absoluteTimeMs &&
            (nextStartMs(page, tokenIndex) ?? Infinity) > absoluteTimeMs;

          return (
            <span
              key={`${token.fromMs}-${tokenIndex}`}
              style={{
                color: isActive ? accent : theme.ink,
                // active token を scale すると行が reflow するため、highlight は colour と glow だけにする。
                textShadow: isActive
                  ? `0 0 28px ${accent}, ${shadowOf(theme)}`
                  : shadowOf(theme),
              }}
            >
              {/* $…$ は発話区間全体を持つ1原子として対応付け済み。
                  text style で組み、2行の帯を分数で押し広げない。 */}
              <MathText text={token.text} display={false} />
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
