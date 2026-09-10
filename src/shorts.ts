import { courseOf, type CourseId } from "./courses.js";
import type { Manifest, Subject } from "./types.js";

/** feed 内の 1 枚の card。 */
export type ShortSummary = {
  slug: string;
  topic: string;
  /**
   * ライブラリ card に出す、箇条書きの問題文。記録導入前に作った short では空で、card は
   * `topic` へフォールバックする。
   */
  outline: string[];
  /** thumbnail の先頭に出す hook scene の画面文言。 */
  headline: string;
  course: CourseId;
  subject: Subject;
  /** カリキュラムの単元。例: "数II 微分・積分の考え"。分類できなければ空。 */
  unit: string;
  /** その単元の小分類。記録導入前に作った short では空。 */
  subunit: string;
  /** 5 段階の難易度。0 は未判定で、記録導入前に作った short がこれになる。 */
  difficulty: number;
  createdAt: string;
  manifestSrc: string;
  durationInFrames: number;
  fps: number;
};

export const summarize = (
  manifest: Manifest,
  slug: string,
  manifestSrc: string,
): ShortSummary => {
  const hook =
    manifest.scenes.find((scene) => scene.visual_type === "hook") ??
    manifest.scenes[0];

  return {
    slug,
    topic: manifest.topic,
    outline: manifest.outline ?? [],
    // hook の画面文言は一目で読めるよう書かれており、thumbnail が必要とするものに一致する。
    // 生の topic はユーザーの prompt 全文である。
    headline: hook?.visual_content ?? manifest.topic,
    course: courseOf(manifest),
    subject: manifest.subject ?? "general",
    unit: manifest.unit ?? "",
    subunit: manifest.subunit ?? "",
    difficulty: manifest.difficulty ?? 0,
    createdAt: manifest.createdAt,
    manifestSrc,
    durationInFrames: manifest.scenes.reduce(
      (sum, scene) => sum + scene.durationInFrames,
      0,
    ),
    fps: manifest.fps,
  };
};

export const newestFirst = (shorts: ShortSummary[]) =>
  [...shorts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
