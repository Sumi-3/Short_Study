/**
 * 6 行あれば縦型ステージで理由付きの式を 3 本置け、補助行は図の余地を残すため 2 行にする。
 * これは高さの推定ではなく執筆上限であり、renderer は実際に組版したブロックを収める。
 * 型と強調を接頭辞に収めれば 20 個目の API シーンフィールドを避けられる。このプロジェクトでは
 * それが構造化出力の grammar 上限を超えていた。
 */
export const FORMULA_MAX_LINES = 6;
export const COMPANION_MAX_LINES = 2;

export type FormulaAnnotation =
  | "carry" | "box" | "underline" | "circle" | "highlight" | "strike" | "bracket" | "plain";

/**
 * 型マーカー、装飾、代入を各 1 つ、任意の順で受け付ける。代入ラベルは ] で終わるため、
 * 数式本文の角括弧を食べない。ラベルは通常の文章とし、入れ子の角括弧は数式側に属する。
 * 未知または重複の接頭辞は本文として残すので、普通の角括弧付き LaTeX を失わない。
 * マーカーだけの空行には、従来のエラー耐性のあるフォールバックを保つ。
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
  // 代入矢印は新しい式に属し、文章行や持ち越した前提には使えない。無効な入力を黙って失わず保つ。
  if (substitution && (text || annotation === "carry")) {
    return { latex: line, annotation: null, text: false };
  }
  return body.trim()
    ? { latex: text || annotation || substitution ? body.trim() : line, annotation, text,
      ...(substitution ? { substitution } : {}) }
    : { latex: line, annotation: null, text: false };
};

/**
 * 空の見出しから継続を推測せず、明示的に [carry] で写す。空見出しには同じ定理を別の対象へ
 * 適用する意味もあるためである。6 行または 2 行の 1 行を使えば測定済みの高さ予算を保て、
 * 20 個目の構造化出力フィールドも要らない。検証は新しい台本だけにし、旧 manifest の意味は
 * 変えない。式変形を続けるかはモデルが決め、直前の式との一致で写し間違いを防ぐ。
 * 囲んだ答えや取り消した候補は連鎖の終端であり、新しい前提ではない。
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
    // normalizeVisual の行数上限後に実際に表示される式と比較する。
    const previousLines = previous && supportsLines(previous.visual_kind)
      ? previous.visual_items.filter((line) => line.trim()).slice(0, previousLimit).map(parseFormulaLine) : [];
    const autoBoxed = previous?.visual_kind === "formula" && previousLines.length > 1 &&
      previousLines.every((line) => !line.text && line.annotation === null && !line.substitution);
    const lastEquation = previousLines.filter((line) => !line.text).at(-1);
    const first = lines[0];
    const limit = scene.visual_kind === "formula" ? FORMULA_MAX_LINES : COMPANION_MAX_LINES;
    /*
     * 以前は 11 種類の誤りが原因を示さない 1 文になっていた。ここで throw する時点では
     * 生成は既に失敗し再試行もないため、メッセージだけが作者が対処できる情報となる。
     * 後半の検査が `lastEquation` を読むため、検査は遅延評価にする。
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
      // `!` 断言ではなく guard する。全 predicate が走るため、この 2 つは上の
      // `!lastEquation` 検査が先に止めたことを前提にできない。
      [() => Boolean(lastEquation) && ["box", "strike", "carry"].includes(lastEquation!.annotation ?? ""),
        "直前の最終式は[box]/[strike]/[carry]で確定済みなので、式変形は続いていません"],
      [() => Boolean(lastEquation) && first.latex.trim() !== lastEquation!.latex.trim(),
        `[carry]の式が直前の最終式と一致しません（直前: ${lastEquation?.latex.trim()}／写し: ${first.latex.trim()}）`],
    ] as const).filter(([failed]) => failed()).map(([, reason]) => reason);
    if (failure.length) {
      // 最初の 1 件ではなく全理由を出す。複数が同時に起きがちで、1 件直して次を告げられると
      // もう 1 回の生成を無駄にするためである。
      throw new Error(`シーン${index + 1}の[carry]: ${failure.join("／")}。前のpointの未確定の最終数式を、継続シーンの先頭にそのまま写してください。`);
    }
  }
};
