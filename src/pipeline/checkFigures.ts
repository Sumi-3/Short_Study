import type { Script, SceneVisual } from "../types.js";

type Figure = Extract<SceneVisual, { kind: "figure" }>;

/** "110°" / "110度" / "110"。それ以外は大きさについての主張ではない。 */
const DEGREES = /^(\d+(?:\.\d+)?)\s*(?:°|度)?$/;

const TOLERANCE = 3;

/**
 * figure が付けた角度ラベルと実際に描く角度の一致を検査する。
 *
 * 座標はモデルが計算する。印を付けた角が図の幾何と食い違う figure は、図がないより悪い。見る人は
 * 図を信じ、70° の角を 110° とラベル付けすれば誤ったことを教えるためである。描画の scale までしか
 * 意味を持たない辺の長さと違い、印付きの角度は直接検査できるので検査する。
 *
 * 修正せず警告する。ラベルに合わせて点を動かすには constraint solve が必要で、モデルがどちらを
 * 意図したか推測するのは、不一致を伝えるより悪いためである。
 */
export const checkFigures = (script: Script): string[] => {
  const warnings: string[] = [];

  for (const scene of script.scenes) {
    const visual = scene.visual;
    if (visual?.kind !== "figure") {
      continue;
    }
    const figure: Figure = visual;
    const at = new Map(figure.points.map((point) => [point.label, point]));

    for (const angle of figure.angles) {
      const claimed = DEGREES.exec(angle.label.trim());
      if (!claimed) {
        continue;
      }
      const vertex = at.get(angle.at);
      const first = at.get(angle.from);
      const second = at.get(angle.to);
      if (!vertex || !first || !second) {
        continue;
      }

      const u = { x: first.x - vertex.x, y: first.y - vertex.y };
      const v = { x: second.x - vertex.x, y: second.y - vertex.y };
      const lengths = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
      if (lengths === 0) {
        continue;
      }
      const cosine = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / lengths));
      const drawn = (Math.acos(cosine) * 180) / Math.PI;
      const expected = Number(claimed[1]);

      if (Math.abs(drawn - expected) > TOLERANCE) {
        warnings.push(
          `シーン${scene.scene_id}: ∠${angle.at} に "${angle.label}" とあるが、` +
            `座標から計算すると ${drawn.toFixed(1)}° に描かれている`,
        );
      }
    }
  }

  return warnings;
};
