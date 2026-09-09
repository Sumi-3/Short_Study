import type { Caption } from "@remotion/captions";

/** 日本語の文で実際に読む人へ停止を促す位置。 */
const HARD = /[。！？]/;
const SOFT = /[、，]/;

/** 句読点は間であり、字幕に表示すべきものではない。 */
const DROPPED = /[\s。、，！？・]/g;

/**
 * 字幕 token を元になった narration と再び対応付ける。
 *
 * synthesiser の word boundary は単語でないものをすべて落とす。`です` の直後に次文の最初の語が
 * 続き、`3√19/4` はスラッシュを失った `3` `√` `19` `4` として戻る。narration には全て残り、
 * token はその単語を順に並べたものなので、両者を一緒にたどれば復元できる。文末は page break にし、
 * 落ちた記号は後続 token に戻す。
 */
export const markPhraseBreaks = (
  narration: string,
  captions: Caption[],
): Caption[] => {
  let cursor = 0;

  return captions.map((caption, index) => {
    const at = narration.indexOf(caption.text, cursor);
    if (at < 0) {
      // 本文と同期していない。paging は文字数予算に委ねる。
      return caption;
    }
    cursor = at + caption.text.length;

    const next = captions[index + 1];
    if (!next) {
      return caption;
    }

    const nextAt = narration.indexOf(next.text, cursor);
    const between = nextAt < 0 ? "" : narration.slice(cursor, nextAt);

    // 句読点を除いて残るものは tokeniser が食べた記号である。
    const carried = between.replace(DROPPED, "");
    const breaks = HARD.test(between) || SOFT.test(between);

    if (!carried && !breaks) {
      return caption;
    }
    return {
      ...caption,
      text: caption.text + carried,
      ...(breaks ? { pageBreakAfter: true } : {}),
    };
  });
};
