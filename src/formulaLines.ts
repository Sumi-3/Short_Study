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
  | "carry" | "box" | "underline" | "circle" | "highlight" | "strike" | "bracket" | "plain";

/**
 * Accept one type marker, one decoration and one substitution, in any order.
 * The substitution label ends at ], so it cannot consume brackets in the
 * equation body. Labels use plain prose; nested brackets belong in the maths.
 * Unknown or
 * repeated prefixes are left as body text, so ordinary bracketed LaTeX is
 * not eaten. An empty marked line retains the old error-tolerant fallback.
 */
export const parseFormulaLine = (line: string): {
  latex: string;
  annotation: FormulaAnnotation | null;
  text: boolean;
  substitution?: string;
} => {
  let body = line;
  let text = false;
  let annotation: FormulaAnnotation | null = null;
  let substitution: string | undefined;
  for (let i = 0; i < 3; i++) {
    const step = /^\s*\[substitute:\s*([^\[\]\r\n]+)\]\s*([\s\S]*)$/.exec(body);
    if (step) {
      if (substitution !== undefined || !step[1].trim()) break;
      substitution = step[1].trim();
      body = step[2];
      continue;
    }
    const match = /^\s*\[(text|carry|box|underline|circle|highlight|strike|bracket|plain)\]\s*([\s\S]*)$/.exec(body);
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
  // An incoming arrow belongs to a new equation, never a prose row or a
  // carried premise. Preserve invalid input rather than silently losing it.
  if (substitution && (text || annotation === "carry")) {
    return { latex: line, annotation: null, text: false };
  }
  return body.trim()
    ? { latex: text || annotation || substitution ? body.trim() : line, annotation, text,
      ...(substitution ? { substitution } : {}) }
    : { latex: line, annotation: null, text: false };
};

/**
 * Use an explicit [carry] copy, rather than inferring continuity from a blank
 * heading: the latter also means applying the same theorem to another object.
 * Spending one of the six/two rows preserves the measured height budget and
 * needs no twentieth structured-output field. Validate new scripts only, so
 * legacy manifests keep their previous meaning. The model decides whether the
 * derivation continues; matching the preceding equation guards copying errors.
 * A boxed answer or struck-out candidate ends that chain, not a new premise.
 */
export const assertFormulaCarry = (scenes: readonly {
  visual_kind: string;
  visual_type: string;
  visual_content: string;
  visual_items: string[];
}[]) => {
  const supportsLines = (kind: string) => ["formula", "figure", "plot"].includes(kind);
  for (const [index, scene] of scenes.entries()) {
    if (!supportsLines(scene.visual_kind)) continue;
    const lines = scene.visual_items.filter((line) => line.trim()).map(parseFormulaLine);
    const carries = lines.filter((line) => line.annotation === "carry");
    if (!carries.length) continue;
    const previous = scenes[index - 1];
    const previousLimit = previous?.visual_kind === "formula" ? FORMULA_MAX_LINES : COMPANION_MAX_LINES;
    // Compare the equation actually displayed after normalizeVisual's row cap.
    const previousLines = previous && supportsLines(previous.visual_kind)
      ? previous.visual_items.filter((line) => line.trim()).slice(0, previousLimit).map(parseFormulaLine) : [];
    const autoBoxed = previous?.visual_kind === "formula" && previousLines.length > 1 &&
      previousLines.every((line) => !line.text && line.annotation === null && !line.substitution);
    const lastEquation = previousLines.filter((line) => !line.text).at(-1);
    const first = lines[0];
    const limit = scene.visual_kind === "formula" ? FORMULA_MAX_LINES : COMPANION_MAX_LINES;
    /*
     * Eleven separate mistakes used to raise one sentence, which named none of
     * them. The generation is already lost by the time this throws — there is
     * no retry — so the message is the only thing the author gets to act on.
     * Checks are lazy because the later ones read `lastEquation`.
     */
    const failure = ([
      [() => carries.length !== 1, "[carry]は1シーンに1行だけ書けます"],
      [() => first.annotation !== "carry", "[carry]はそのシーンの先頭行に置いてください"],
      [() => first.text, "[carry]に[text]は重ねられません"],
      [() => lines.length > limit, `このシーンの行数が上限${limit}行を超えています`],
      [() => !lines.slice(1).some((line) => !line.text),
        "[carry]の後に、続きとなる数式行を必ず置いてください"],
      [() => scene.visual_type !== "point", "[carry]が使えるのはpointのシーンだけです"],
      [() => previous?.visual_type !== "point", "直前のシーンがpointではありません"],
      [() => Boolean(scene.visual_content.trim()),
        "続きのシーンなのでvisual_contentは空文字にしてください"],
      [() => !lastEquation, "直前のシーンに写せる数式がありません"],
      [() => autoBoxed, "直前のシーンの最終式は自動で囲まれた答えなので、式変形は続いていません"],
      // Guarded rather than `!`-asserted: every predicate runs, so these two
      // cannot lean on the `!lastEquation` check above having stopped first.
      [() => Boolean(lastEquation) && ["box", "strike", "carry"].includes(lastEquation!.annotation ?? ""),
        "直前の最終式は[box]/[strike]/[carry]で確定済みなので、式変形は続いていません"],
      [() => Boolean(lastEquation) && first.latex.trim() !== lastEquation!.latex.trim(),
        `[carry]の式が直前の最終式と一致しません（直前: ${lastEquation?.latex.trim()}／写し: ${first.latex.trim()}）`],
    ] as const).filter(([failed]) => failed()).map(([, reason]) => reason);
    if (failure.length) {
      // Every reason, not just the first: several usually hold at once, and
      // fixing one only to be told about the next wastes another generation.
      throw new Error(`シーン${index + 1}の[carry]: ${failure.join("／")}。前のpointの未確定の最終数式を、継続シーンの先頭にそのまま写してください。`);
    }
  }
};
