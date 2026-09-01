/**
 * Tidies the question for display.
 *
 * `topic` is whatever the user typed into the form, and it is shown in three
 * places — the card in the library, the caption under the feed, and the 問題
 * card the video opens on. Typed maths arrives spelled every way at once:
 * `y=-x+2log x` beside `y = 2x+1`, `A,B,C` beside `AB = BC = 7`, full-width
 * characters from a Japanese IME mixed into half-width formulae.
 *
 * This normalises that spelling. It deliberately does not rewrite the sentence
 * — no trimming of 「〜を求めなさい」, no line breaking, no re-ordering — because
 * the question has to stay the question the user asked. Exponents are left as
 * `^2` for `MathText` to set as superscripts at render time.
 */

/*
 * Full-width letters, digits and operators to their ASCII equivalents.
 *
 * Deliberately not the whole `！`-`～` block. That range also holds `（）`,
 * `，` and `：`, which are Japanese punctuation rather than typing mistakes —
 * converting them turned 「1ヶ月間（7月危機）に」 into 「1ヶ月間(7月危機)に」,
 * which is not tidier, just wrong. Only the characters that mean the same thing
 * in either width are folded.
 */
const toHalfWidth = (text: string) =>
  text
    .replace(/[Ａ-Ｚａ-ｚ０-９＋－＝＜＞／＊％＾]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ");

/**
 * Relations get one space on each side; arithmetic operators are left alone.
 *
 * `+` and `-` are ambiguous — the `-` in `-x + 6` is a sign, not an operator —
 * and spacing them by rule produces `- x` as often as it fixes anything. A
 * relation is never unary, so it is always safe.
 */
const RELATIONS = /\s*([=≠≦≧≤≥<>≒])\s*/g;

/** Japanese punctuation carries its own trailing space in the glyph. */
const SPACE_BEFORE_JP = /\s+([、。，．）」』】])/g;
const SPACE_AFTER_JP = /([（「『【])\s+/g;

export const formatTopic = (raw: string): string => {
  if (!raw) {
    return "";
  }

  return (
    toHalfWidth(raw)
      // Written before the relations are spaced, so `<=` is one token and does
      // not come out as `< =`.
      .replace(/<=/g, "≦")
      .replace(/>=/g, "≧")
      .replace(/!=/g, "≠")
      .replace(RELATIONS, " $1 ")
      // `A,B,C` reads as a list and wants the space; `1,000` is one number and
      // does not, which is why the digit is excluded.
      .replace(/,(?=[^\s\d])/g, ", ")
      .replace(SPACE_BEFORE_JP, "$1")
      .replace(SPACE_AFTER_JP, "$1")
      // Last, so that spaces introduced above collapse with any already there.
      .replace(/\s+/g, " ")
      .trim()
  );
};
