import { SceneShell } from "./SceneShell";
import { Formula, parseFormulaLine } from "./math/Formula";
import type { ManifestScene } from "../types";

/**
 * 複数の formula シーンを、ひとつの舞台で続けて描く。
 *
 * 各シーンの行は、そのシーンの音声が始まる frame から従来の cadence で現れる。音声と字幕は
 * `Composition` がシーンごとの `<Sequence>` に置いたままなので、時間軸はいっさい動かない。
 * 動くのは描画の器だけで、これが run の全長を持つため、舞台の入退場（`SceneShell` の
 * ENTER / LEAVE）は run の両端でしか起きず、内側の境界では前の式が残ったまま次の行が足される。
 *
 * 2 つ目以降のシーン先頭の `[carry]` は落とす。[carry] は「舞台が切れたので前の式を写し直す」
 * ための再掲で、切れていない舞台では同じ式が二度並ぶだけになる。
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
    const own = index === 0
      ? scene.visual.lines
      : scene.visual.lines.filter((line) => parseFormulaLine(line).annotation !== "carry");
    lines.push(...own);
    segments.push({ from, durationInFrames: scene.durationInFrames, count: own.length });
    if (scene.visual_content.trim()) {
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
