import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod/v4";
import { parseFormulaLine } from "../src/formulaLines.js";
import { apiScriptSchema, normalizeVisual, sceneVisualSchema, type ApiScript } from "../src/types.js";

// Prefixes share an existing string channel. Guard both marker orders and
// the ordinary bracketed LaTeX which a greedy prefix parser would consume.
for (const annotation of ["box", "underline", "circle", "highlight", "strike", "bracket", "plain"] as const) {
  assert.deepEqual(parseFormulaLine(`[${annotation}] x=2`), { latex: "x=2", annotation, text: false });
  for (const prefix of [`[text][${annotation}]`, `[${annotation}] [text]`]) {
    assert.deepEqual(parseFormulaLine(`  ${prefix} x^2 の係数に注目  `), {
      latex: "x^2 の係数に注目", annotation, text: true,
    });
  }
}
assert.deepEqual(parseFormulaLine("[text] 因数分解する"), { latex: "因数分解する", annotation: null, text: true });
for (const line of ["x^2-5x+6=0", "[0,1]", "[unknown] x", "[text]   ", "[box] ", "[box][text] "]) {
  assert.deepEqual(parseFormulaLine(line), { latex: line, annotation: null, text: false });
}
assert.equal(parseFormulaLine("[text][text] 本文").latex, "[text] 本文");
assert.equal(parseFormulaLine("[box][underline] x").latex, "[underline] x");

// Check the actual schema exported for structured outputs, including required
// keys. The local manifest limit must not grow the compiled API grammar.
const schema = z.toJSONSchema(apiScriptSchema) as any;
const apiScene = schema.properties.scenes.items;
assert.equal(Object.keys(apiScene.properties).length, 19);
assert.equal(apiScene.required.length, 19);
assert.equal(apiScene.properties.visual_items.items.type, "string");
assert.equal(apiScene.properties.visual_kind.enum.length, 14);

const mixed = [
  "x^2-5x+6=0", "[text] 和が5、積が6の2数を探す", "(x-2)(x-3)=0",
  "[text][underline] どちらかの因数が0", "x-2=0 \\quad \\text{または} \\quad x-3=0", "[box] x=2,3",
];
const base: ApiScript["scenes"][number] = {
  scene_id: 1, narration: "説明", visual_type: "point", visual_content: "",
  visual_kind: "formula", visual_items: mixed, visual_bars: [], visual_unit: "",
  visual_caption: "", visual_curves: [], visual_range: [], visual_shade: [],
  visual_points: [], visual_segments: [], visual_angles: [], visual_circles: [],
  visual_highlight: [], visual_values: [], visual_table: [],
};
assert.deepEqual(normalizeVisual(base), { kind: "formula", lines: mixed, caption: "" });
assert.ok(sceneVisualSchema.safeParse(normalizeVisual(base)).success);
assert.ok(!sceneVisualSchema.safeParse({ kind: "formula", lines: [...mixed, "x=2"], caption: "" }).success);
assert.equal(normalizeVisual({ ...base, visual_items: [" ", ""] }), undefined);

// The channel also carries labels for charts. Exercise every kind so [text]
// interpretation cannot accidentally leak into names, table cells or exprs.
const fixtures: Partial<ApiScript["scenes"][number]>[] = [
  { visual_kind: "bullets", visual_items: ["[text] 名前"] },
  { visual_kind: "flow", visual_items: ["準備", "結果"] },
  { visual_kind: "bars", visual_bars: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
  { visual_kind: "formula" },
  { visual_kind: "plot", visual_range: [-2, 2, -2, 2], visual_curves: [{ expr: "x^2", expr_y: "", label: "", region: "" }] },
  { visual_kind: "figure", visual_points: [{ x: 0, y: 0, label: "A" }, { x: 1, y: 0, label: "B" }],
    visual_segments: [{ from: "A", to: "B", label: "", dashed: false, emphasis: 0, ticks: 0, arrow: false }] },
  { visual_kind: "table", visual_table: [["x", "1"], ["y", "2"]] },
  { visual_kind: "tree", visual_table: [["A", "B"], ["A", "C"]] },
  { visual_kind: "venn", visual_items: ["A", "B"], visual_values: [1, 2, 3, 4] },
  { visual_kind: "histogram", visual_range: [0, 10], visual_values: [1, 2] },
  { visual_kind: "box", visual_items: ["[text] A組"], visual_values: [0, 1, 2, 3, 4] },
  { visual_kind: "scatter", visual_range: [0, 3, 0, 3], visual_items: ["[text] x軸", "y軸"],
    visual_points: [{ x: 0, y: 0, label: "" }, { x: 1, y: 1, label: "" }, { x: 2, y: 2, label: "" }] },
  { visual_kind: "dot", visual_values: [1, 2, 3] },
  { visual_kind: "none" },
];
for (const fixture of fixtures) {
  const visual = normalizeVisual({ ...base, ...fixture });
  if (fixture.visual_kind === "none") {
    assert.equal(visual, undefined);
    continue;
  }
  assert.equal(visual?.kind, fixture.visual_kind);
  assert.ok(sceneVisualSchema.safeParse(visual).success, fixture.visual_kind);
  if (visual?.kind === "figure" || visual?.kind === "plot") {
    assert.deepEqual(visual.lines, mixed.slice(0, 2));
    assert.ok(!sceneVisualSchema.safeParse({ ...visual, lines: mixed.slice(0, 3) }).success);
    const { lines: _lines, caption: _caption, ...legacy } = visual;
    assert.ok(sceneVisualSchema.safeParse(legacy).success);
  }
  if (visual?.kind === "bullets") assert.equal(visual.items[0], "[text] 名前");
  if (visual?.kind === "box") assert.equal(visual.boxes[0].label, "[text] A組");
  if (visual?.kind === "scatter") assert.equal(visual.xLabel, "[text] x軸");
}

let manifests = 0;
for (const file of await readdir(new URL("../public/projects/", import.meta.url), { recursive: true })) {
  if (!file.endsWith("/manifest.json")) continue;
  const manifest = JSON.parse(await readFile(new URL(`../public/projects/${file}`, import.meta.url), "utf8"));
  for (const scene of manifest.scenes) {
    // Historical figures predate required ticks/axes fields and play directly
    // from JSON. Validate the working changed here, without requiring those
    // unrelated older payloads to migrate to today's entire figure schema.
    const visual = scene.visual;
    if (visual?.kind === "formula") {
      assert.ok(sceneVisualSchema.safeParse(visual).success, `${file}: ${scene.scene_id}`);
      for (const line of visual.lines) assert.equal(typeof parseFormulaLine(line).latex, "string");
    } else if ((visual?.kind === "figure" || visual?.kind === "plot") && visual.lines?.length) {
      assert.ok(visual.lines.length <= 2, `${file}: companion limit`);
    }
  }
  manifests++;
}
console.log(`PASS: markers, six/two-row limits, 19 required API fields, all 14 kinds, ${manifests} existing manifests`);
