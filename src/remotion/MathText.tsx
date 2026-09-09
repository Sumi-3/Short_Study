import { Fragment, useMemo } from "react";
import { renderMathParts } from "../renderMath";
// LibraryCard は Formula なしで読み込まれるため、フォントの依存もここに置く。
import "katex/dist/katex.min.css";

/** 保存時の正規化に漏れた式も救い、本文と不正な TeX は React にエスケープさせる。 */
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
