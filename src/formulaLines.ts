/**
 * Six rows allow three equations with their reasons on a portrait stage;
 * companions stay at two so the figure still has room. These are authoring
 * limits, not a height estimate: the renderer fits the actual typeset block.
 * Keeping type and emphasis in prefixes avoids a twentieth API scene field,
 * which exceeded the structured-output grammar limit in this project.
 */
export const FORMULA_MAX_LINES = 6;
export const COMPANION_MAX_LINES = 2;

export type FormulaAnnotation =
  | "box" | "underline" | "circle" | "highlight" | "strike" | "bracket" | "plain";

/**
 * Accept one type marker and one decoration, in either order. Unknown or
 * repeated prefixes are left as body text, so ordinary bracketed LaTeX is
 * not eaten. An empty marked line retains the old error-tolerant fallback.
 */
export const parseFormulaLine = (line: string): {
  latex: string;
  annotation: FormulaAnnotation | null;
  text: boolean;
} => {
  let body = line;
  let text = false;
  let annotation: FormulaAnnotation | null = null;
  for (let i = 0; i < 2; i++) {
    const match = /^\s*\[(text|box|underline|circle|highlight|strike|bracket|plain)\]\s*([\s\S]*)$/.exec(body);
    if (!match) break;
    if (match[1] === "text") {
      if (text) break;
      text = true;
    } else {
      if (annotation !== null) break;
      annotation = match[1] as FormulaAnnotation;
    }
    body = match[2];
  }
  return body.trim()
    ? { latex: text || annotation ? body.trim() : line, annotation, text }
    : { latex: line, annotation: null, text: false };
};
