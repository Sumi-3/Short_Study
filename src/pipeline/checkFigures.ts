import type { Script, SceneVisual } from "../types.js";

type Figure = Extract<SceneVisual, { kind: "figure" }>;

/** "110°" / "110度" / "110" — anything else is not a claim about a size. */
const DEGREES = /^(\d+(?:\.\d+)?)\s*(?:°|度)?$/;

const TOLERANCE = 3;

/**
 * Checks that the angles a figure labels are the angles it draws.
 *
 * The coordinates are computed by the model, and a figure whose marked angle
 * disagrees with its own geometry is worse than no figure: the viewer trusts
 * the picture, and a 70° angle labelled 110° teaches the wrong thing. Unlike a
 * side length — which is only meaningful up to the drawing's scale — a marked
 * angle is checkable outright, so it is.
 *
 * This warns rather than repairs. Moving the points to satisfy the label is a
 * constraint solve, and guessing which of the two the model meant would be
 * worse than saying they disagree.
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
