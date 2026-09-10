import { isStepScene, type ManifestScene } from "../types";

/**
 * 連続する formula の step シーンを、ひとつの舞台にまとめる単位。
 *
 * シーンの切れ目は音声の切れ目でしかない。`buildManifest.ts` はナレーション 1 本の実長から
 * `durationInFrames` を出すので、「音声 1 を読み終えたら描画 2 に進む」時刻は manifest に
 * すでに入っている。足りないのは、その境界で舞台を消さないという選択だけだった。
 *
 * 既存 15 本では、同じ式変形が 3 シーンに割れている箇所が 6 つ、5 シーンのものが 1 つある。
 * 境界のたびに舞台を落として出し直すと、前後 15 フレーム（0.5 秒）は画面のインクが 4% から
 * 0.09% まで消え、続きの式であることが見て取れなかった。run は音声と字幕をシーンのまま残し、
 * 描画の器だけを複数シーンにまたがらせる。
 *
 * まとめるのは formula の step だけである。hook と summary は独立した節で、figure / plot の
 * 併記は図の下に置く別の layout を持ち、bullets や flow は行を積む形ではない。1 シーンだけの
 * run は従来どおり描くので、既存の動画の見た目は run が生じる区間以外で変わらない。
 */
export type SceneRun = {
  /** `manifest.scenes` 上の先頭の添字。 */
  first: number;
  count: number;
  /** 動画先頭からの frame。 */
  from: number;
  durationInFrames: number;
};

export const isRunnable = (scene: Pick<ManifestScene, "visual_type" | "visual">) =>
  isStepScene(scene.visual_type) && scene.visual?.kind === "formula";

export const sceneRuns = (
  scenes: readonly Pick<ManifestScene, "visual_type" | "visual" | "durationInFrames">[],
): SceneRun[] => {
  const runs: SceneRun[] = [];
  let from = 0;
  for (const [index, scene] of scenes.entries()) {
    const previous = runs.at(-1);
    if (previous && isRunnable(scene) && isRunnable(scenes[index - 1])) {
      previous.count += 1;
      previous.durationInFrames += scene.durationInFrames;
    } else {
      runs.push({ first: index, count: 1, from, durationInFrames: scene.durationInFrames });
    }
    from += scene.durationInFrames;
  }
  return runs;
};
