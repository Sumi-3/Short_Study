import { Fragment, useMemo } from "react";
import katex from "katex";
// LibraryCard は Formula なしで MathText を読み込めるため、font もここで読み込む。
import "katex/dist/katex.min.css";

/** 先頭に付けるので、作者が自分で `\textstyle` と書けばそちらが上書きできる。 */
const DISPLAY_STYLE = "\\displaystyle ";

/**
 * 本文中の数式。`$...$` で囲まれた範囲だけを KaTeX で組み、外は文字どおりに出す。
 *
 * 意味を変えず本文中の数式位置を決められるのは作者だけである。以前は `$` のない文字列から
 * `x^2` や `a/b` を推測して上付きや分数にする手置きの renderer があったが、`9/8に公開` を分数に
 * し、`3√19/4` の分子の範囲を当てられないなど、境界の推測はどこまでも間違え得る。境界は
 * プロンプトで作者（モデル）に書かせ、ここは推測しない。重ねた／escape した dollar は
 * 文字どおりに扱い、曖昧または閉じていない delimiter は問題文の一部を飲み込ませず表示に残す。
 *
 * `display` は数式の style。既定の displaystyle は分数を大きく、極限の条件を `lim` の下に置く。
 * 字幕のように行の高さに余裕がない場所は false にして text style で組む。
 */
export const MathText: React.FC<{ text: string; display?: boolean }> = ({
  text,
  display = true,
}) => {
  // 字幕は frame ごとに描き直すので、同じ文字列を毎 frame KaTeX に通さない。
  const parts = useMemo(() => render(text, display), [text, display]);
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
};

const render = (text: string, display: boolean): React.ReactNode[] => {
  if (!text.includes("$")) return [text];

  const delimiters = [...text.matchAll(/\\[\s\S]|\$+/g)]
    .filter((match) => match[0].startsWith("$"));
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < delimiters.length - 1; i++) {
    const open = delimiters[i];
    const close = delimiters[i + 1];
    if (open[0] !== "$" || close[0] !== "$") continue;
    const tex = text.slice(open.index + 1, close.index);
    i++;
    if (!tex.trim()) continue;

    parts.push(text.slice(cursor, open.index));
    try {
      const html = katex.renderToString((display ? DISPLAY_STYLE : "") + tex, {
        // inline にして、数式を独立した中央揃え block にせず文中へ置く。`displayMode` は
        // *style* も選び、text style では極限の条件が `lim` の下でなく横に来て分数も小さくなる。
        // `\displaystyle` なら block を作らずにその style を要求でき、横の解答と同じ組版になる。
        displayMode: false,
        throwOnError: false,
        output: "html",
      });
      parts.push(<span key={open.index} dangerouslySetInnerHTML={{ __html: html }} />);
    } catch {
      // 想定外の renderer 失敗時も、source は escape した本文として残さなければならない。
      parts.push(text.slice(open.index, close.index + 1));
    }
    cursor = close.index + 1;
  }
  parts.push(text.slice(cursor));
  return parts;
};
