import { DEFAULT_DESIGN } from "./designs.js";
import { z } from "zod/v4";
import type { Caption } from "@remotion/captions";
import { COURSE_IDS, type CourseId } from "./courses.js";

/**
 * Optional richer visual payload. `visual_content` (required by the base schema)
 * always holds a plain-text version of the same thing, so a scene without
 * `visual` still renders — it just falls back to animated text.
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
    /** LaTeX, one entry per line. Several lines read as a derivation. */
    lines: z.array(z.string()).min(1).max(3),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("table"),
    /** Row-major; the first row and first column read as headers. */
    rows: z.array(z.array(z.string()).min(1).max(8)).min(2).max(6),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("tree"),
    /** One root-to-leaf path per row; shared prefixes become shared branches. */
    paths: z.array(z.array(z.string()).min(1).max(5)).min(2).max(12),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("venn"),
    sets: z.array(z.string()).min(2).max(3),
    /**
     * Region counts in a fixed order.
     * Two sets: A only, both, B only, neither.
     * Three sets: A, B, C, AB, BC, AC, ABC, none.
     */
    counts: z.array(z.number()),
    /** Region ids to tint: "A" "B" "C" "AB" "BC" "AC" "ABC" "none". */
    highlight: z.array(z.string()),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("histogram"),
    /** Contiguous classes; `to` of one is `from` of the next. */
    bins: z
      .array(z.object({ from: z.number(), to: z.number(), count: z.number() }))
      .min(2)
      .max(12),
    unit: z.string(),
    caption: z.string(),
    /** Reference lines — mean, median, mode. */
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
    /** Trend line as an expression in x, or null for no line. */
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
    /** `label` doubles as the id everything else references. */
    points: z.array(
      z.object({ x: z.number(), y: z.number(), label: z.string() }),
    ).min(2).max(8),
    segments: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string(),
        /** A hidden edge in a solid's projection. */
        dashed: z.boolean(),
        /** The segment the scene is about — drawn in the accent colour. */
        emphasis: z.boolean(),
        /** Hash marks: segments carrying the same count are equal in length. */
        ticks: z.number(),
        /** Draws an arrowhead at `to`, making the segment a vector. */
        arrow: z.boolean(),
      }),
    ).max(10),
    angles: z.array(
      z.object({
        at: z.string(),
        from: z.string(),
        to: z.string(),
        label: z.string(),
        /** Arc count: angles marked the same number of times are equal. */
        ticks: z.number(),
      }),
    ).max(3),
    circles: z.array(
      z.object({
        /** Point id of the centre, so segments can reference it too. */
        center: z.string(),
        radius: z.number().positive(),
        label: z.string(),
        dashed: z.boolean(),
        /**
         * Degrees, anticlockwise from the positive x-axis. Equal values draw a
         * whole circle; otherwise the arc between them.
         */
        fromAngle: z.number(),
        toAngle: z.number(),
        /** Fills the arc back to the centre, making it a sector. */
        sector: z.boolean(),
      }),
    ).max(3),
    /** Point ids of a face or region to tint. */
    highlight: z.array(z.string()),
    /** Draws the coordinate axes through the origin. */
    axes: z.boolean(),
  }),
  z.object({
    kind: z.literal("plot"),
    xRange: z.tuple([z.number(), z.number()]),
    yRange: z.tuple([z.number(), z.number()]),
    curves: z
      .array(
        z.object({
          expr: z.string(),
          /**
           * Non-null makes the curve parametric: `expr` is x(t) and this is
           * y(t). That is what puts circles, ellipses and cycloids on a plot —
           * none of them is a function of x.
           */
          exprY: z.string().nullable(),
          label: z.string(),
          /** Which side of this curve the shaded region lies on. */
          region: z.enum(["above", "below"]).nullable(),
        }),
      )
      .min(1)
      .max(3),
    /** Parameter interval for the parametric curves; a full turn by default. */
    tRange: z.tuple([z.number(), z.number()]).nullable(),
    /** Area under the first curve, for integrals. */
    shade: z.tuple([z.number(), z.number()]).nullable(),
    /** Marked points — a tangency, an intersection, a solution. */
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

export const scriptSchema = z.object({
  topic: z.string(),
  /** Curriculum unit, e.g. "数A 図形の性質". Shown above the question. */
  unit: z.string().default(""),
  /**
   * The small category under that unit, e.g. "円周角の定理". Never shown — it
   * exists so the home screen can filter one level finer than the banner does.
   */
  subunit: z.string().default(""),
  /** Which system prompt wrote this. Not asked of the model — the user picks it. */
  course: z.enum(COURSE_IDS).default("math"),
  /** Picks the palette, typeface and motion style. */
  subject: z.enum(SUBJECTS).default("general"),
  /** The look chosen on the create screen. Not asked of the model. */
  design: z.string().default(DEFAULT_DESIGN),
  scenes: z.array(sceneSchema).min(2),
});

export type SceneVisual = z.infer<typeof sceneVisualSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;

/**
 * The shape actually requested from the model. Structured outputs are most
 * reliable with a flat, fully-required schema, so unused fields are sent as
 * empty rather than omitted, and `normalizeVisual()` folds them back into the
 * discriminated union above.
 */
export const apiScriptSchema = z.object({
  topic: z.string(),
  /**
   * Free text here, checked against the course's list afterwards. It was an
   * enum, which guaranteed a valid name, but 33 alternatives on top of the
   * scene schema pushed the compiled grammar past what structured outputs
   * accept — and a scene that cannot be generated is worse than a label that
   * occasionally has to be dropped.
   */
  /**
   * Both curriculum levels in one string, `中分類｜小分類`, split by
   * `generateScript`. They arrive together because a separate field pushed the
   * compiled grammar past what structured outputs accept — the same ceiling
   * that already forced this off an enum and onto free text.
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
      /** `bullets` items, `flow` steps, or `formula` LaTeX lines. */
      visual_items: z.array(z.string()),
      /** Used by `bars`; empty otherwise. */
      visual_bars: z.array(z.object({ label: z.string(), value: z.number() })),
      /** Used by `bars`; empty otherwise. */
      visual_unit: z.string(),
      /** Used by `formula` and `plot`; empty otherwise. */
      visual_caption: z.string(),
      /** Used by `plot` and `scatter`; empty otherwise. */
      visual_curves: z.array(
        z.object({
          expr: z.string(),
          /** `plot`: y(t) for a parametric curve. Empty for y = f(x). */
          expr_y: z.string(),
          label: z.string(),
          /** `plot`: "above" / "below" to shade that side. Empty otherwise. */
          region: z.string(),
        }),
      ),
      /**
       * `plot`: [xMin, xMax, yMin, yMax], optionally followed by [tMin, tMax]
       * for parametric curves. `histogram`: the span the classes cover.
       */
      visual_range: z.array(z.number()),
      /** Used by `plot`: [from, to] to shade under the first curve. */
      visual_shade: z.array(z.number()),
      /**
       * `plot`: points to mark, e.g. a tangency.
       * `figure`: the vertices, where `label` is also the id.
       */
      visual_points: z.array(
        z.object({ x: z.number(), y: z.number(), label: z.string() }),
      ),
      /** Used by `figure`; empty otherwise. */
      visual_segments: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: z.string(),
          dashed: z.boolean(),
          emphasis: z.boolean(),
          /** Equal-length hash marks; 0 for none. */
          ticks: z.number(),
          /** Arrowhead at `to`, for a vector. */
          arrow: z.boolean(),
        }),
      ),
      /** Used by `figure`; empty otherwise. */
      visual_angles: z.array(
        z.object({
          at: z.string(),
          from: z.string(),
          to: z.string(),
          label: z.string(),
          /** Equal-angle arc count; 0 for a single plain arc. */
          ticks: z.number(),
        }),
      ),
      /** Used by `figure`; empty otherwise. */
      visual_circles: z.array(
        z.object({
          center: z.string(),
          radius: z.number(),
          label: z.string(),
          dashed: z.boolean(),
          /** Degrees anticlockwise from +x; equal values mean a whole circle. */
          from_angle: z.number(),
          to_angle: z.number(),
          /** Fills back to the centre, making a sector. */
          sector: z.boolean(),
        }),
      ),
      /** Used by `figure`: point ids of a face to tint. Empty otherwise. */
      visual_highlight: z.array(z.string()),
      /**
       * The numbers behind a data chart. What they are depends on the kind:
       * `histogram` class frequencies, `box` five-number summaries five at a
       * time, `dot` the raw values. Empty otherwise.
       *
       * The data charts deliberately reuse `visual_range`, `visual_items`,
       * `visual_points` and `visual_curves` rather than adding a field each:
       * every scene of every script carries every field in this schema, and
       * past about twenty of them the compiled grammar for structured outputs
       * is rejected as too large.
       */
      visual_values: z.array(z.number()),
      /** Used by `table`: cells, row by row. Empty otherwise. */
      visual_table: z.array(z.array(z.string())),
    }),
  ),
});

export type ApiScript = z.infer<typeof apiScriptSchema>;

/** Reference lines ride in on `visual_points`: the x is the value. */
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
      const lines = scene.visual_items.filter(Boolean).slice(0, 3);
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
      // Classes are equal width by construction: the range is the span they
      // cover and each value is one class's frequency.
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
      // Five numbers per box: min, q1, median, q3, max.
      const groups = Math.floor(scene.visual_values.length / 5);
      const boxes = Array.from({ length: Math.min(groups, 3) }, (_, index) => {
        const [min, q1, median, q3, max] = scene.visual_values.slice(
          index * 5,
          index * 5 + 5,
        );
        return { label: scene.visual_items[index] ?? "", min, q1, median, q3, max };
      }).filter(
        // Out-of-order quartiles would draw a box inside out.
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
      // A segment naming a point that was never given would render as nothing
      // at all; dropping it keeps the rest of the figure intact.
      const segments = scene.visual_segments
        .filter((s) => known.has(s.from) && known.has(s.to))
        .slice(0, 10);
      const circles = scene.visual_circles
        .filter((c) => known.has(c.center) && c.radius > 0)
        .slice(0, 3);
      // A lone circle with its centre is a complete figure; segments are only
      // required when there is nothing else to draw.
      if (points.length < 2 || (segments.length === 0 && circles.length === 0)) {
        return undefined;
      }
      return {
        kind: "figure",
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
        // `visual_unit` has no other meaning for a figure, and a dedicated
        // boolean would be a twentieth field on every scene of every script —
        // which is where the compiled grammar for structured outputs stops
        // being accepted.
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
 * What the pipeline hands to Remotion. One JSON file per project in
 * `public/projects/<slug>/manifest.json`, so the composition needs a single
 * fetch and no async media probing.
 */
export type ManifestScene = Scene & {
  /** Path relative to `public/`, to be wrapped in `staticFile()`. */
  audioSrc: string;
  audioDurationInSeconds: number;
  durationInFrames: number;
  /** Timestamps relative to the start of this scene, not the whole video. */
  captions: Caption[];
};

export type Manifest = {
  topic: string;
  /** The look this short was made with; absent on ones made before designs. */
  design?: string;
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
