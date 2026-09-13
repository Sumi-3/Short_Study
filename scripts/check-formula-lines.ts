import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod/v4";
import { parseFormulaLine, withoutCarry } from "../src/formulaLines.js";
import { apiScriptSchema, normalizeVisual, sceneVisualSchema, type ApiScript } from "../src/types.js";

// prefix は既存の string channel を共有する。両方の marker 順序と、貪欲な prefix parser
// なら消費してしまう通常の角括弧付き LaTeX を守る。
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

// substitution は対象の装飾とは独立した incoming edge である。不正な prefix を含め、
// 以前の parse 形状と角括弧付きの数式を保つ。
assert.deepEqual(parseFormulaLine("[substitute: x=2 を代入] y=2^2+1"), {
  latex: "y=2^2+1", annotation: null, text: false, substitution: "x=2 を代入",
});
for (const prefix of ["[substitute: x=2 を代入][box]", "[box] [substitute: x=2 を代入]"]) {
  assert.deepEqual(parseFormulaLine(`${prefix} y=5`), {
    latex: "y=5", annotation: "box", text: false, substitution: "x=2 を代入",
  });
}
assert.equal(parseFormulaLine("[substitute: x=2 を代入] [0,1]").latex, "[0,1]");
for (const line of [
  "[substitute] x=2", "[substitute: ] x=2", "[substitute: x=2 を代入] ",
  "[substitute: a[1] を代入] x=2", "[text][substitute: x=2 を代入] 本文",
  "[substitute: x=2 を代入][carry] y=5",
]) assert.deepEqual(parseFormulaLine(line), { latex: line, annotation: null, text: false });
assert.equal(parseFormulaLine("[substitute: x=2][substitute: y=3] z=5").latex, "[substitute: y=3] z=5");

// required key を含め、structured output 用に export される実際の schema を検査する。
// local manifest の上限が compiled API grammar を大きくしてはならない。
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

// channel は chart の label も運ぶ。全 kind を試し、`[text]` の解釈が name、table cell、
// expr に誤って漏れないようにする。
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

// 旧 manifest に残る [carry] は marker として読み続けるが、淡い再掲はもう作らないので描かない。
assert.deepEqual(parseFormulaLine("[carry] x+2=5"), {
  latex: "x+2=5", annotation: "carry", text: false,
});
assert.deepEqual(withoutCarry(["[carry] x+2=5", "[box] x=3"]), ["[box] x=3"]);
assert.deepEqual(
  withoutCarry(["x+2=5", "[text] 両辺から2を引く"]),
  ["x+2=5", "[text] 両辺から2を引く"],
);

let manifests = 0;
for (const file of await readdir(new URL("../public/projects/", import.meta.url), { recursive: true })) {
  if (!file.endsWith("/manifest.json")) continue;
  const manifest = JSON.parse(await readFile(new URL(`../public/projects/${file}`, import.meta.url), "utf8"));
  for (const scene of manifest.scenes) {
    // 過去の figure は必須の ticks/axes field より前のもので、JSON から直接再生される。
    // 関係のない古い payload に現在の figure schema 全体への migration を求めず、ここで
    // 変更した動作を検証する。
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
