import { SceneShell } from "./SceneShell";
import { Formula, parseFormulaLine } from "./math/Formula";
import { withoutCarry } from "../formulaLines";
import type { ManifestScene } from "../types";
import { parsePlanStep } from "../solutionPlan";

/**
 * 印なしの再掲を見つける。落とす `own` 側の添字と、舞台に残っている同じ式の行の添字、
 * そこへ移す装飾を返す。
 *
 * モデルは前シーンの最終式を、次のシーンの先頭へそのまま書き出すことがある（生成済み 37 本で
 * 7 箇所）。舞台は境界で消えないので、その行は同じ式の 2 行目として積まれてしまう。台本には
 * それと分かる印がないため、式の一致で判定する。
 *
 * 落とすのは式の行だけで、先に立つ `[text]` の前置きは残す。再掲は式が新しくないというだけで、
 * その文は次の変形を導く新しい説明である。
 */
const repeatOf = (lines: readonly string[], own: readonly string[]) => {
  let stage = -1;
  for (const [index, line] of lines.entries()) {
    if (!parseFormulaLine(line).text) stage = index;
  }
  const index = own.findIndex((line) => !parseFormulaLine(line).text);
  if (stage < 0 || index < 0) return null;
  const repeat = parseFormulaLine(own[index]);
  const carried = parseFormulaLine(lines[stage]);
  // 代入の理由を持つ行は、式が同じでも「何を代入したか」を語る別の主張である。
  if (repeat.substitution || repeat.latex.trim() !== carried.latex.trim()) return null;
  return { index, stage, mark: carried.annotation ? null : repeat.annotation };
};

/**
 * 複数の formula シーンを、ひとつの舞台で続けて描く。
 *
 * 各シーンの行は、そのシーンの音声が始まる frame から従来の cadence で現れる。音声と字幕は
 * `Composition` がシーンごとの `<Sequence>` に置いたままなので、時間軸はいっさい動かない。
 * 動くのは描画の器だけで、これが run の全長を持つため、舞台の入退場（`SceneShell` の
 * ENTER / LEAVE）は run の両端でしか起きず、内側の境界では前の式が残ったまま次の行が足される。
 *
 * 前の式をもう一度書いたシーンは、その行を `repeatOf` で落とす。舞台が切れていないので、
 * 再掲は同じ式が二度並ぶだけになる。
 *
 * caption は最後のシーンのものだけを、run 全体の最後の行が出たあとに見せる。途中の caption を
 * 切り替えると、caption は `useFitToWidth` が幅を測る対象なので文字数の違いで fit が変わり、
 * 数式全体の大きさが境界で跳ぶ。まとめの一言は変形の終わりに一度あれば足りる。
 *
 * 見出し（`visual_content`）はシーンごとに切り替える。空の見出しは「同じ見出しの続き」と読み、
 * 前の見出しをそのまま残す。
 */
export const FormulaRun: React.FC<{
  scenes: readonly ManifestScene[];
  accent: string;
}> = ({ scenes, accent }) => {
  const lines: string[] = [];
  const segments: { from: number; durationInFrames: number; count: number }[] = [];
  const headings: { text: string; from: number }[] = [];
  let from = 0;
  let caption = "";
  for (const [index, scene] of scenes.entries()) {
    if (scene.visual?.kind !== "formula") continue;
    // 旧 manifest の `[carry]` 行。淡い再掲はもう作らないので、run の先頭でも落とす。
    let own = withoutCarry(scene.visual.lines);
    const repeat = index === 0 ? null : repeatOf(lines, own);
    if (repeat) {
      // 素の式に装飾だけを足した再掲では、新しいのは行ではなく印なので、舞台に残る行へ印を移す。
      // 行ごと落とすと、答えを囲むためだけのシーンで囲みそのものが消えてしまう。印の出る時刻は
      // 移した先の segment に従うので、再掲のシーンではなく前のシーンで描かれる。
      if (repeat.mark) {
        lines[repeat.stage] = `[${repeat.mark}] ${lines[repeat.stage]}`;
      }
      own = own.filter((_, line) => line !== repeat.index);
    }
    lines.push(...own);
    segments.push({ from, durationInFrames: scene.durationInFrames, count: own.length });
    // 同じ方針項目の続きではタイトルを消して出し直さず、そのまま読み続けられるようにする。
    if (scene.visual_content.trim() &&
        (!parsePlanStep(scene.visual_content) || headings.at(-1)?.text !== scene.visual_content)) {
      headings.push({ text: scene.visual_content, from });
    }
    caption = scene.visual.caption;
    from += scene.durationInFrames;
  }

  return (
    <SceneShell
      scene={scenes[0]}
      durationInFrames={from}
      accent={accent}
      headings={headings}
    >
      <Formula
        lines={lines}
        caption={caption}
        accent={accent}
        durationInFrames={from}
        segments={segments}
      />
    </SceneShell>
  );
};
