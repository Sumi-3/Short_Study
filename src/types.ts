import { FORMULA_MAX_LINES, COMPANION_MAX_LINES } from "./formulaLines.js";
import { z } from "zod/v4";
import type { Caption } from "@remotion/captions";
import { COURSE_IDS, type CourseId } from "./courses.js";

/**
 * 色用フィールドを足さず emphasis を再利用する。ネストしたプロパティでも、既に
 * 余裕のない構造化出力の文法を膨らませるためである。API には整数型を一つだけ渡し、
 * SDK 側では範囲を説明へ移して Zod で 0–5 をローカル検証する。
 * Boolean との互換性はローカルの manifest スキーマだけに置くので、API 文法へ
 * union を増やさない。文法に余裕があると確認できるまで、角と円は既存の印を保つ。
 */
const figureEmphasisSchema = z.number().int().min(0).max(5);

/**
 * より豊かな視覚データは任意にする。基本スキーマで必須の `visual_content` には常に
 * 同じ内容のプレーンテキストがあるため、`visual` のないシーンも描画でき、
 * アニメーション付きテキストへフォールバックするだけで済む。
 */
export const sceneVisualSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bullets"),
    items: z.array(z.string()).min(1).max(4),
  }),
  z.object({
    kind: z.literal("flow"),
    steps: z.array(z.string()).min(2).max(4),
  }),
  z.object({
    kind: z.literal("bars"),
    unit: z.string(),
    data: z.array(z.object({ label: z.string(), value: z.number() })).min(2).max(5),
  }),
  z.object({
    kind: z.literal("formula"),
    /** LaTeX または [text] の文章。どちらにも強調用の接頭辞を付けられる。 */
    lines: z.array(z.string()).min(1).max(FORMULA_MAX_LINES),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("table"),
    /** 行優先。先頭行と先頭列を見出しとして読む。 */
    rows: z.array(z.array(z.string()).min(1).max(8)).min(2).max(6),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("tree"),
    /** 1 行を根から葉への経路とし、共通の接頭辞は共通の枝にする。 */
    paths: z.array(z.array(z.string()).min(1).max(5)).min(2).max(12),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("venn"),
    sets: z.array(z.string()).min(2).max(3),
    /**
     * 領域の個数は固定順序で渡す。
     * 2 集合: A のみ、共通、B のみ、どちらでもない。
     * 3 集合: A、B、C、AB、BC、AC、ABC、どれでもない。
     */
    counts: z.array(z.number()),
    /** 着色する領域 id: "A" "B" "C" "AB" "BC" "AC" "ABC" "none"。 */
    highlight: z.array(z.string()),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("histogram"),
    /** 隣接する階級。ある階級の `to` は次の階級の `from` と一致する。 */
    bins: z
      .array(z.object({ from: z.number(), to: z.number(), count: z.number() }))
      .min(2)
      .max(12),
    unit: z.string(),
    caption: z.string(),
    /** 基準線 — 平均値、中央値、最頻値。 */
    marks: z.array(z.object({ value: z.number(), label: z.string() })),
  }),
  z.object({
    kind: z.literal("box"),
    boxes: z
      .array(
        z.object({
          label: z.string(),
          min: z.number(),
          q1: z.number(),
          median: z.number(),
          q3: z.number(),
          max: z.number(),
        }),
      )
      .min(1)
      .max(3),
    unit: z.string(),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("scatter"),
    xRange: z.tuple([z.number(), z.number()]),
    yRange: z.tuple([z.number(), z.number()]),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3).max(40),
    xLabel: z.string(),
    yLabel: z.string(),
    /** x の式で表す傾向線。線がなければ null。 */
    trend: z.string().nullable(),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("dot"),
    values: z.array(z.number()).min(2).max(40),
    unit: z.string(),
    caption: z.string(),
    marks: z.array(z.object({ value: z.number(), label: z.string() })),
  }),
  z.object({
    kind: z.literal("figure"),
    /**
     * ローカル manifest 専用のフィールド。API では遊休の `visual_items` /
     * `visual_caption` チャネルを再利用する。短い 2 行に留めれば縦型ステージでも
     * 図を読める。旧 manifest も移行なしで解析・再生できるよう任意にする
     * （player も JSON を直接読む）。
     */
    lines: z.array(z.string()).max(COMPANION_MAX_LINES).optional(),
    caption: z.string().optional(),
    /** `label` は他の要素が参照する id も兼ねる。 */
    points: z.array(
      z.object({ x: z.number(), y: z.number(), label: z.string() }),
    ).min(2).max(8),
    segments: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string(),
        /** 立体を投影したときの隠線。 */
        dashed: z.boolean(),
        /** 0 は通常、1–5 は固定パレットの役割。旧 Boolean の見た目も維持する。 */
        emphasis: z.union([figureEmphasisSchema, z.boolean()]),
        /** 等しい個数の印を持つ線分は等長であることを示す。 */
        ticks: z.number(),
        /** `to` に矢印を描き、この線分をベクトルとして示す。 */
        arrow: z.boolean(),
      }),
    ).max(10),
    angles: z.array(
      z.object({
        at: z.string(),
        from: z.string(),
        to: z.string(),
        label: z.string(),
        /** 同じ個数の弧印を持つ角は等しいことを示す。 */
        ticks: z.number(),
      }),
    ).max(3),
    circles: z.array(
      z.object({
        /** 中心の点 id。線分からも同じ点を参照できるようにする。 */
        center: z.string(),
        radius: z.number().positive(),
        label: z.string(),
        dashed: z.boolean(),
        /**
         * 正の x 軸から反時計回りの度数。同値なら円全体を、異なればその間の弧を描く。
         */
        fromAngle: z.number(),
        toAngle: z.number(),
        /** 弧から中心までを塗り、扇形にする。 */
        sector: z.boolean(),
      }),
    ).max(3),
    /** 着色する面または領域の点 id。 */
    highlight: z.array(z.string()),
    /** 原点を通る座標軸を描く。 */
    axes: z.boolean(),
  }),
  z.object({
    kind: z.literal("plot"),
    /** figure と同じ補助の途中式。API のシーンフィールドではない。 */
    lines: z.array(z.string()).max(COMPANION_MAX_LINES).optional(),
    caption: z.string().optional(),
    xRange: z.tuple([z.number(), z.number()]),
    yRange: z.tuple([z.number(), z.number()]),
    curves: z
      .array(
        z.object({
          expr: z.string(),
          /**
           * null でなければ曲線を媒介変数表示にする。`expr` は x(t)、ここは
           * y(t) となる。円・楕円・サイクロイドはいずれも x の関数ではないため、
           * グラフに描くにはこれが必要になる。
           */
          exprY: z.string().nullable(),
          label: z.string(),
          /** 網掛けする領域がこの曲線のどちら側にあるか。 */
          region: z.enum(["above", "below"]).nullable(),
        }),
      )
      .min(1)
      .max(3),
    /** 媒介変数曲線のパラメータ区間。既定値は 1 周分。 */
    tRange: z.tuple([z.number(), z.number()]).nullable(),
    /** 積分用に、最初の曲線の下を塗る範囲。 */
    shade: z.tuple([z.number(), z.number()]).nullable(),
    /** 接点・交点・解など、印を付ける点。 */
    points: z.array(
      z.object({ x: z.number(), y: z.number(), label: z.string() }),
    ),
  }),
]);

export const sceneSchema = z.object({
  scene_id: z.number(),
  narration: z.string(),
  visual_type: z.enum(["hook", "point", "summary"]),
  visual_content: z.string(),
  visual: sceneVisualSchema.optional(),
});

export const SUBJECTS = [
  "history",
  "math",
  "science",
  "language",
  "general",
] as const;
export type Subject = (typeof SUBJECTS)[number];

// `design` を持つ旧台本も読み込めるよう、未知キーの除去を維持する。
export const scriptSchema = z.object({
  topic: z.string(),
  /** ライブラリカード用に箇条書きにした問題文。 */
  outline: z.array(z.string()).default([]),
  /** カリキュラムの中分類。例: "数A 図形の性質"。問題の上に表示する。 */
  unit: z.string().default(""),
  /**
   * 中分類の下の小分類。例: "円周角の定理"。表示はせず、ホーム画面でバナーより
   * 1 段細かく絞り込むためにだけ持つ。
   */
  subunit: z.string().default(""),
  /** これを書いた system prompt。モデルには尋ねず、ユーザーが選ぶ。 */
  course: z.enum(COURSE_IDS).default("math"),
  /** 教科別のナレーションと字幕表記に使う。 */
  subject: z.enum(SUBJECTS).default("general"),
  scenes: z.array(sceneSchema).min(2),
});

export type SceneVisual = z.infer<typeof sceneVisualSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;

/**
 * モデルに実際に要求する形。構造化出力は平坦で全項目必須のスキーマが最も安定するため、
 * 未使用フィールドも省略せず空で送り、`normalizeVisual()` で上の discriminated union
 * に戻す。
 */
export const apiScriptSchema = z.object({
  topic: z.string(),
  /**
   * ここでは自由文にし、後でコースの一覧と照合する。enum なら有効な名前を保証できたが、
   * シーンスキーマに 33 通りを加えると compiled grammar が構造化出力の許容範囲を超えた。
   * ときどきラベルを捨てることより、シーン自体を生成できないことの方が悪い。
   */
  /**
   * カリキュラムの 2 階層を `中分類｜小分類` の 1 文字列に収め、`generateScript` が分割する。
   * 別フィールドにすると compiled grammar が構造化出力の許容範囲を超えたため一緒に届く。
   * enum ではなく自由文にしたのと同じ上限である。
   */
  unit: z.string(),
  subject: z.enum(SUBJECTS),
  scenes: z.array(
    z.object({
      scene_id: z.number(),
      narration: z.string(),
      visual_type: z.enum(["hook", "point", "summary"]),
      visual_content: z.string(),
      visual_kind: z.enum([
        "bullets",
        "flow",
        "bars",
        "formula",
        "plot",
        "figure",
        "table",
        "tree",
        "venn",
        "histogram",
        "box",
        "scatter",
        "dot",
        "none",
      ]),
      /**
       * `bullets` の項目、`flow` の手順、最大 6 行の混在した `formula`、または
       * `figure` / `plot` の数式・文章の補助 2 行。型と注釈のマーカーも文字列内に置くので、
       * API のシーンは必須 19 フィールドのままになり、20 個目を足して compiled grammar の
       * 上限に当てない。データチャート種別ではこのチャネルの既存の意味を保つ。
       */
      visual_items: z.array(z.string()),
      /** `bars` 用。それ以外では空。 */
      visual_bars: z.array(z.object({ label: z.string(), value: z.number() })),
      /** データチャートの単位。`figure` は座標軸を求める "axes" をここで再利用する。 */
      visual_unit: z.string(),
      /** figure と plot を含む数式・データ視覚要素用の短い補足。 */
      visual_caption: z.string(),
      /** `plot` と `scatter` 用。それ以外では空。 */
      visual_curves: z.array(
        z.object({
          expr: z.string(),
          /** `plot` の媒介変数曲線用 y(t)。y = f(x) なら空。 */
          expr_y: z.string(),
          label: z.string(),
          /** `plot` でその側を塗る "above" / "below"。それ以外では空。 */
          region: z.string(),
        }),
      ),
      /**
       * `plot`: [xMin, xMax, yMin, yMax]。媒介変数曲線では任意で [tMin, tMax] を続ける。
       * `histogram`: 階級が覆う範囲。
       */
      visual_range: z.array(z.number()),
      /** `plot` 用。最初の曲線の下を塗る [from, to]。 */
      visual_shade: z.array(z.number()),
      /**
       * `plot`: 接点など、印を付ける点。
       * `figure`: 頂点。`label` は id も兼ねる。
       */
      visual_points: z.array(
        z.object({ x: z.number(), y: z.number(), label: z.string() }),
      ),
      /** `figure` 用。それ以外では空。 */
      visual_segments: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: z.string(),
          dashed: z.boolean(),
          emphasis: figureEmphasisSchema,
          /** 等長を示す印の数。なしなら 0。 */
          ticks: z.number(),
          /** ベクトル用に `to` へ付ける矢印。 */
          arrow: z.boolean(),
        }),
      ),
      /** `figure` 用。それ以外では空。 */
      visual_angles: z.array(
        z.object({
          at: z.string(),
          from: z.string(),
          to: z.string(),
          label: z.string(),
          /** 等角を示す弧印の数。単なる弧 1 本なら 0。 */
          ticks: z.number(),
        }),
      ),
      /** `figure` 用。それ以外では空。 */
      visual_circles: z.array(
        z.object({
          center: z.string(),
          radius: z.number(),
          label: z.string(),
          dashed: z.boolean(),
          /** +x から反時計回りの度数。同値は円全体を表す。 */
          from_angle: z.number(),
          to_angle: z.number(),
          /** 中心まで塗り、扇形にする。 */
          sector: z.boolean(),
        }),
      ),
      /** `figure` 用の、面を着色する点 id。それ以外では空。 */
      visual_highlight: z.array(z.string()),
      /**
       * データチャートの数値。意味は種別ごとに異なる。`histogram` は階級度数、
       * `box` は 5 数要約を 5 個ずつ、`dot` は生データ。それ以外では空。
       *
       * データチャートはフィールドを各々追加せず、意図して `visual_range`、
       * `visual_items`、`visual_points`、`visual_curves` を再利用する。全台本の
       * 全シーンがこのスキーマの全フィールドを持つため、約 20 個を超えると構造化出力の
       * compiled grammar が大きすぎるとして拒否される。
       */
      visual_values: z.array(z.number()),
      /** `table` 用のセル。行ごとに格納する。それ以外では空。 */
      visual_table: z.array(z.array(z.string())),
    }),
  ),
});

export type ApiScript = z.infer<typeof apiScriptSchema>;

/** 基準線は `visual_points` で渡し、x を値として使う。 */
const markLines = (scene: ApiScript["scenes"][number]) =>
  scene.visual_points
    .filter((point) => Number.isFinite(point.x))
    .slice(0, 3)
    .map((point) => ({ value: point.x, label: point.label }));

export const normalizeVisual = (
  scene: ApiScript["scenes"][number],
): SceneVisual | undefined => {
  switch (scene.visual_kind) {
    case "bullets": {
      const items = scene.visual_items.filter(Boolean).slice(0, 4);
      return items.length ? { kind: "bullets", items } : undefined;
    }
    case "flow": {
      const steps = scene.visual_items.filter(Boolean).slice(0, 4);
      return steps.length >= 2 ? { kind: "flow", steps } : undefined;
    }
    case "bars": {
      const data = scene.visual_bars.slice(0, 5);
      return data.length >= 2
        ? { kind: "bars", unit: scene.visual_unit, data }
        : undefined;
    }
    case "formula": {
      const lines = scene.visual_items.filter((line) => line.trim()).slice(0, FORMULA_MAX_LINES);
      return lines.length
        ? { kind: "formula", lines, caption: scene.visual_caption }
        : undefined;
    }
    case "tree": {
      const paths = scene.visual_table
        .map((path) => path.filter(Boolean).slice(0, 5))
        .filter((path) => path.length > 0)
        .slice(0, 12);
      return paths.length >= 2
        ? { kind: "tree", paths, caption: scene.visual_caption }
        : undefined;
    }
    case "venn": {
      const sets = scene.visual_items.filter(Boolean).slice(0, 3);
      if (sets.length < 2) {
        return undefined;
      }
      return {
        kind: "venn",
        sets,
        counts: scene.visual_values.slice(0, sets.length === 2 ? 4 : 8),
        highlight: scene.visual_highlight,
        caption: scene.visual_caption,
      };
    }
    case "table": {
      const rows = scene.visual_table
        .map((row) => row.slice(0, 8))
        .filter((row) => row.length > 0)
        .slice(0, 6);
      return rows.length >= 2
        ? { kind: "table", rows, caption: scene.visual_caption }
        : undefined;
    }
    case "histogram": {
      // 構成上、階級幅は等しい。range は全階級の範囲、各値は 1 階級の度数である。
      const counts = scene.visual_values.filter(Number.isFinite).slice(0, 12);
      const [start, end] = scene.visual_range;
      if (counts.length < 2 || !Number.isFinite(start) || !(end > start)) {
        return undefined;
      }
      const width = (end - start) / counts.length;
      return {
        kind: "histogram",
        bins: counts.map((count, index) => ({
          from: start + index * width,
          to: start + (index + 1) * width,
          count,
        })),
        unit: scene.visual_unit,
        caption: scene.visual_caption,
        marks: markLines(scene),
      };
    }
    case "box": {
      // 1 箱につき 5 数: min、q1、median、q3、max。
      const groups = Math.floor(scene.visual_values.length / 5);
      const boxes = Array.from({ length: Math.min(groups, 3) }, (_, index) => {
        const [min, q1, median, q3, max] = scene.visual_values.slice(
          index * 5,
          index * 5 + 5,
        );
        return { label: scene.visual_items[index] ?? "", min, q1, median, q3, max };
      }).filter(
        // 四分位数の順序が逆なら箱ひげ図が裏返る。
        (box) =>
          box.min <= box.q1 &&
          box.q1 <= box.median &&
          box.median <= box.q3 &&
          box.q3 <= box.max,
      );
      return boxes.length
        ? {
            kind: "box",
            boxes,
            unit: scene.visual_unit,
            caption: scene.visual_caption,
          }
        : undefined;
    }
    case "scatter": {
      const points = scene.visual_points
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, 40);
      const [xMin, xMax, yMin, yMax] = scene.visual_range;
      if (points.length < 3 || ![xMin, xMax, yMin, yMax].every(Number.isFinite)) {
        return undefined;
      }
      const [xLabel = "", yLabel = ""] = scene.visual_items;
      return {
        kind: "scatter",
        xRange: [xMin, xMax],
        yRange: [yMin, yMax],
        points: points.map((p) => ({ x: p.x, y: p.y })),
        xLabel,
        yLabel,
        trend: scene.visual_curves[0]?.expr || null,
        caption: scene.visual_caption,
      };
    }
    case "dot": {
      const values = scene.visual_values.filter(Number.isFinite).slice(0, 40);
      return values.length >= 2
        ? {
            kind: "dot",
            values,
            unit: scene.visual_unit,
            caption: scene.visual_caption,
            marks: markLines(scene),
          }
        : undefined;
    }
    case "figure": {
      const points = scene.visual_points.filter((p) => p.label).slice(0, 8);
      const known = new Set(points.map((p) => p.label));
      // 存在しない点を指す線分は何も描けないため捨て、図の残りを保つ。
      const segments = scene.visual_segments
        .filter((s) => known.has(s.from) && known.has(s.to))
        .slice(0, 10);
      const circles = scene.visual_circles
        .filter((c) => known.has(c.center) && c.radius > 0)
        .slice(0, 3);
      // 中心を持つ円だけでも完全な図形なので、他に描くものがないときだけ線分を必須にする。
      if (points.length < 2 || (segments.length === 0 && circles.length === 0)) {
        return undefined;
      }
      return {
        kind: "figure",
        lines: scene.visual_items.filter((line) => line.trim()).slice(0, COMPANION_MAX_LINES),
        caption: scene.visual_caption,
        points,
        segments: segments.map((segment) => ({
          ...segment,
          ticks: Math.max(0, Math.min(3, Math.round(segment.ticks))),
        })),
        angles: scene.visual_angles
          .filter(
            (a) => known.has(a.at) && known.has(a.from) && known.has(a.to),
          )
          .slice(0, 3)
          .map((angle) => ({
            ...angle,
            ticks: Math.max(0, Math.min(3, Math.round(angle.ticks))),
          })),
        circles: circles.map((circle) => ({
          center: circle.center,
          radius: circle.radius,
          label: circle.label,
          dashed: circle.dashed,
          fromAngle: circle.from_angle,
          toAngle: circle.to_angle,
          sector: circle.sector,
        })),
        highlight: scene.visual_highlight.filter((id) => known.has(id)),
        // `visual_unit` は figure では他に意味を持たず、専用 Boolean を足すと全台本の
        // 全シーンで 20 個目のフィールドになる。そこが構造化出力の compiled grammar を
        // 受理しなくなる境目である。
        axes: scene.visual_unit.trim() === "axes",
      };
    }
    case "plot": {
      const curves = scene.visual_curves
        .filter((curve) => curve.expr)
        .slice(0, 3)
        .map((curve) => ({
          expr: curve.expr,
          exprY: curve.expr_y || null,
          label: curve.label,
          region: ((): "above" | "below" | null =>
            curve.region === "above" || curve.region === "below"
              ? curve.region
              : null)(),
        }));
      const [xMin, xMax, yMin, yMax, tMin, tMax] = scene.visual_range;
      if (curves.length === 0 || ![xMin, xMax, yMin, yMax].every(Number.isFinite)) {
        return undefined;
      }
      const shade = scene.visual_shade;
      return {
        kind: "plot",
        lines: scene.visual_items.filter((line) => line.trim()).slice(0, COMPANION_MAX_LINES),
        caption: scene.visual_caption,
        xRange: [xMin, xMax],
        yRange: [yMin, yMax],
        curves,
        tRange:
          Number.isFinite(tMin) && Number.isFinite(tMax) ? [tMin, tMax] : null,
        shade: shade.length === 2 ? [shade[0], shade[1]] : null,
        points: scene.visual_points.slice(0, 3),
      };
    }
    default:
      return undefined;
  }
};

/**
 * パイプラインが Remotion へ渡す形。プロジェクトごとに
 * `public/projects/<slug>/manifest.json` を 1 つ置くため、composition は 1 回の
 * fetch だけで済み、非同期のメディア調査が不要になる。
 */
export type ManifestScene = Scene & {
  /** `staticFile()` で包む、`public/` からの相対パス。 */
  audioSrc: string;
  audioDurationInSeconds: number;
  durationInFrames: number;
  /** 動画全体ではなく、このシーンの開始からのタイムスタンプ。 */
  captions: Caption[];
};

export type Manifest = {
  topic: string;
  /** 箇条書きにした問題文。導入前に作った short には存在しない。 */
  outline?: string[];
  unit: string;
  subunit: string;
  course: CourseId;
  subject: Subject;
  slug: string;
  fps: number;
  width: number;
  height: number;
  createdAt: string;
  scenes: ManifestScene[];
};
