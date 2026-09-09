import katex from "katex";
import { splitMathText, texAtoms } from "./mathText";

export type RenderedMathPart = { text: string; html?: string; block?: boolean };

export const renderMathParts = (
  text: string, display = true, formula = false,
): RenderedMathPart[] => {
  const parts = splitMathText(text, formula);
  const block = formula && parts.length === 1;
  const render = (tex: string, block: boolean) => katex.renderToString(
    (display && !block ? "\\displaystyle " : "") + tex,
    {
      displayMode: block,
      throwOnError: true,
      output: "html",
      // trust:false でも禁止命令を赤字にする場合があるので、同じ本文フォールバックへ送る。
      trust: () => { throw new Error("この命令は本文として表示します"); },
    },
  );
  return parts.flatMap((part): RenderedMathPart[] => {
    if (!part.math) return [{ text: part.text }];
    try { return [{ text: part.text, html: render(part.text, block), block }]; }
    catch {
      const result: RenderedMathPart[] = [];
      let valid = "";
      const flush = () => {
        if (valid) result.push({ text: valid, html: render(valid, false) });
        valid = "";
      };
      for (const atom of texAtoms(part.text)) {
        try { render(valid + atom, false); valid += atom; }
        catch {
          flush();
          try { render(atom, false); valid = atom; }
          catch { result.push({ text: atom }); }
        }
      }
      flush();
      return result;
    }
  });
};
