import { Fragment, useMemo } from "react";
import { renderMathParts } from "../renderMath";
// LibraryCard は Formula なしで読み込まれるため、フォントの依存もここに置く。
import "katex/dist/katex.min.css";

/** 保存時の正規化に漏れた式も救い、本文と不正な TeX は React にエスケープさせる。 */
/**
 * 太字の文字の中に置く数式のための class。
 *
 * KaTeX は `.katex` に `font: normal …` の一括指定を持ち、親から継いだ太さを打ち消す。そのため
 * 太字で組んだ文の中で数式だけが 400 になり、同じ 1 行で太さが変わって見える。KaTeX_Main と
 * KaTeX_Math には実物の 700 フェイスがあるので、太さを指定すれば合成ボールドにならずに本物の
 * 太字が選ばれる（根号の記号は font ではなく SVG なので影響を受けない）。分数の横線は CSS の
 * 罫線であって字面ではないため、別に太くする。
 */
export const BOLD_MATH = "bold-math";

/** `BOLD_MATH` の規則。CSS ファイルを読まない Remotion の描画経路でも効くよう、その場に置く。 */
export const BoldMathStyle: React.FC = () => (
  <style>{`.${BOLD_MATH} .katex { font-weight: 700 }
    .${BOLD_MATH} .katex .frac-line { border-bottom-width: 0.08em }`}</style>
);

export const MathText: React.FC<{ text: string; display?: boolean; formula?: boolean }> = ({
  text, display = true, formula = false,
}) => {
  // 字幕は毎フレーム描き直すので、変わらない文字列を繰り返し解析しない。
  const parts = useMemo(() => renderMathParts(text, display, formula), [text, display, formula]);
  const content = parts.map((part, index) => part.html === undefined
    ? <Fragment key={index}>{part.text}</Fragment>
    : <span key={index} dangerouslySetInnerHTML={{ __html: part.html }} />);
  // 日本語や不正な断片を挟む式も一行に保つ。各断片を displayMode にすると縦に積まれてしまう。
  return formula && !parts.some((part) => part.block)
    ? <span className="katex-display" style={{ whiteSpace: "nowrap" }}>{content}</span>
    : <>{content}</>;
};
