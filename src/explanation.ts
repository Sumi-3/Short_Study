import { parseFormulaLine, type FormulaAnnotation } from "./formulaLines.js";
import { splitNarration } from "./narration.js";
import { isStepScene, type Manifest, type ManifestScene } from "./types.js";

export type ExplanationFormulaBlock = {
  type: "formula";
  latex: string;
  annotation: FormulaAnnotation | null;
  substitution?: string;
};

export type ExplanationBlock =
  | { type: "prose"; text: string }
  | ExplanationFormulaBlock
  | { type: "bullets"; items: string[] }
  | { type: "caption"; text: string };

export type ExplanationSection = {
  heading: string;
  blocks: ExplanationBlock[];
  startFrame: number;
  sceneIndexes: number[];
};

/**
 * 不正な区切りで 1 本全体の reader を失わないよう、失敗時も区切り記号を除いた文章を返す。
 * 古い manifest は読み上げ用だけなので、正しい入力では splitNarration の reading がそのまま使われる。
 */
const narrationForExplanation = (narration: string) => {
  try {
    const { display, reading } = splitNarration(narration);
    return display ?? reading;
  } catch {
    return narration.replace(/<<<TTS_READING>>>/g, "\n").trim();
  }
};

const prose = (text: string): ExplanationBlock | null =>
  text.trim() ? { type: "prose", text: text.trim() } : null;

const formulaBlocks = (lines: readonly string[]): ExplanationBlock[] => lines.flatMap((line) => {
  const parsed = parseFormulaLine(line);
  // [carry] は前の節の式を動画上でつなぐための再掲で、reader では重複になる。
  if (parsed.annotation === "carry") return [];
  if (parsed.text) return prose(parsed.latex) ?? [];
  return parsed.latex.trim()
    ? [{
        type: "formula" as const,
        latex: parsed.latex,
        annotation: parsed.annotation,
        ...(parsed.substitution ? { substitution: parsed.substitution } : {}),
      }]
    : [];
});

const visualBlocks = (scene: ManifestScene): ExplanationBlock[] => {
  const visual = scene.visual;
  if (!visual) return [];
  switch (visual.kind) {
    case "formula":
      return [
        ...formulaBlocks(visual.lines),
        ...(visual.caption ? [{ type: "caption" as const, text: visual.caption }] : []),
      ];
    case "figure":
    case "plot":
      return [
        ...formulaBlocks(visual.lines ?? []),
        ...(visual.caption ? [{ type: "caption" as const, text: visual.caption }] : []),
      ];
    case "bullets":
      return visual.items.length ? [{ type: "bullets", items: visual.items }] : [];
    default:
      return "caption" in visual && visual.caption
        ? [{ type: "caption", text: visual.caption }]
        : [];
  }
};

const blocksFor = (scene: ManifestScene) => {
  const narration = prose(narrationForExplanation(scene.narration));
  return [...(narration ? [narration] : []), ...visualBlocks(scene)];
};

/**
 * manifest の scene を reader 用の節へ写す。連続する step の同じ見出しだけを束ねるので、
 * 方針の続きを重複表示せず、hook と summary は同名でも独立した入口として残る。
 */
export const explanationOf = (manifest: Manifest): ExplanationSection[] => {
  const sections: ExplanationSection[] = [];
  let frame = 0;

  for (const [index, scene] of manifest.scenes.entries()) {
    const previous = sections.at(-1);
    const continues = Boolean(
      previous &&
      isStepScene(scene.visual_type) &&
      previous.heading === scene.visual_content &&
      isStepScene(manifest.scenes[index - 1]?.visual_type ?? ""),
    );
    const blocks = blocksFor(scene);
    if (continues && previous) {
      previous.blocks.push(...blocks);
      previous.sceneIndexes.push(index);
    } else {
      sections.push({
        heading: scene.visual_content,
        blocks,
        startFrame: frame,
        sceneIndexes: [index],
      });
    }
    frame += scene.durationInFrames;
  }

  return sections;
};
