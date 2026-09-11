import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeMathText, splitMathText } from "../src/mathText.js";
import { normalizeNarration, NarrationMathError } from "../src/mathSpeech.js";
import { renderMathParts } from "../src/renderMath.js";
import { normalizeVisual, normalizeVisualText, type ApiScript } from "../src/types.js";
import { normalizeFormulaLine } from "../src/formulaLines.js";

// CSS の URL と実際のフォントはビルド検査に任せ、ここでは本番コンポーネントの組版を調べる。
registerHooks({ load(url, context, nextLoad) {
  return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : nextLoad(url, context);
} });
const { MathText } = await import("../src/remotion/MathText.js");
const { SvgLabel } = await import("../src/remotion/math/SvgLabel.js");
const { themeOf } = await import("../src/remotion/theme.js");
const html = (text: string, formula = false) => renderToStaticMarkup(React.createElement(MathText, { text, formula }));

for (const tex of [String.raw`\sqrt{7}`, String.raw`\theta`, String.raw`\frac{3}{4}`, "x^2", "a_{n+1}"]) {
  for (const expression of [tex, `$${tex}$`, `$$${tex}$$`, `\\(${tex}\\)`, `\\[${tex}\\]`]) {
    const source = `解説は${expression}です。`;
    assert.equal(normalizeMathText(source), `解説は$${tex}$です。`);
    assert.equal(normalizeMathText(normalizeMathText(source)), normalizeMathText(source));
    assert.equal(html(source), html(`解説は$${tex}$です。`));
    assert.match(html(source), /class="katex"/);
    assert.doesNotMatch(html(source), /katex-error|cjk_fallback/);
    const svg = renderToStaticMarkup(React.createElement("svg", null, React.createElement(SvgLabel, {
      text: expression, x: 0, y: 0, size: 40, color: themeOf().ink,
    })));
    assert.match(svg, /<foreignObject/);
    assert.match(svg, /class="katex"/);
  }
}

for (const source of ["日本語だけ", "9/8に公開。単位はkm/h", "3√19/4", String.raw`価格\$5`,
  "前$x^2 後", String.raw`前\$x^2\$後`]) {
  assert.equal(normalizeMathText(source), source);
  assert.equal(normalizeMathText(normalizeMathText(source)), source);
}
assert.equal(html("$a_n$$b_n$"), html("$a_n$") + html("$b_n$"));
assert.equal(normalizeMathText("$a_n$$b_n$"), "$a_n$$b_n$");
for (const source of [String.raw`$条件はx^2です$`, String.raw`$\text{条件} x^2$`, String.raw`裸の\sqrt{7}と\theta`]) {
  const rendered = renderMathParts(source);
  assert.ok(rendered.some((part) => part.html));
  for (const part of rendered.filter((part) => part.html)) {
    assert.doesNotMatch(part.text, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  }
  assert.doesNotMatch(html(source), /cjk_fallback|katex-error/);
}
for (const source of [String.raw`$\sqrt{7}+\unknown{2}+\theta$`, String.raw`$\sqrt{7}+\frac{1}{$`,
  String.raw`$\href{javascript:alert(1)}{x}+\theta$`, String.raw`$\bad{<img src=x onerror=alert(1)>}+\theta$`]) {
  const markup = html(source);
  assert.match(markup, /class="katex"/);
  assert.doesNotMatch(markup, /katex-error|color:#cc0000|<img |<a /);
  assert.ok(renderMathParts(source).some((part) => part.html === undefined));
}
assert.doesNotMatch(html(String.raw`\begin{aligned}x&=\sqrt{7}\\y&=\theta\end{aligned}`, true), /katex-error|\\begin/);
assert.match(html(String.raw`\frac{3}{4}`, true), /katex-display/);
const mixedFormula = html(String.raw`x=\sqrt{7}\quad\text{または}\quad x=\theta`, true);
assert.equal((mixedFormula.match(/class="katex-display"/g) ?? []).length, 1);
assert.match(mixedFormula, /または/);
assert.doesNotMatch(mixedFormula, /cjk_fallback|katex-error/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(MathText, { text: String.raw`\frac{3}{4}`, display: false })), /katex-display|displaystyle/);

for (const [tex, speech] of [
  [String.raw`\sqrt{7}`, "ルート7"],
  [String.raw`\sqrt{0}`, "ルート0"],
  [String.raw`\sqrt{1001}`, "ルート1001"],
  [String.raw`\frac{3}{4}`, "4分の3"],
  [String.raw`\frac{3\sqrt{19}}{4}`, "4分の3ルート19"],
  [String.raw`\theta`, "シータ"], [String.raw`\pi`, "パイ"],
  [String.raw`\theta\pi`, "シータパイ"],
  ["x^2", "xの2乗"], ["a_{n+1}", "エーエヌプラスイチ"],
  [String.raw`x\le 2`, "x以下2"], [String.raw`x\ge 1`, "x以上1"],
  [String.raw`n\to\infty`, "n矢印無限大"], [String.raw`\sin\theta`, "サインシータ"],
  [String.raw`\sqrt{x+1}`, "ルートかっこxたす1かっことじ"],
  [String.raw`\frac{x+1}{2}`, "2分のかっこxたす1かっことじ"],
  [String.raw`\frac{1}{x+1}`, "かっこxたす1かっことじ分の1"],
  [String.raw`\sqrt{\frac{3}{4}}`, "ルートかっこ4分の3かっことじ"],
  [String.raw`\frac{1}{\sqrt{2}}`, "かっこルート2かっことじ分の1"],
  [String.raw`\sqrt{19.5}`, "ルートかっこ19.5かっことじ"],
  [String.raw`\frac{-3}{4}`, "4分のかっこマイナス3かっことじ"],
  [String.raw`\frac12`, "2分の1"],
  [String.raw`\sqrt{2}x`, "ルートかっこ2かっことじx"],
  [String.raw`\sqrt{7}\theta`, "ルートかっこ7かっことじシータ"],
  [String.raw`\sqrt{\pi x}`, "ルートかっこパイxかっことじ"],
  [String.raw`\frac{\theta x}{2}`, "2分のかっこシータxかっことじ"],
  ["(x+1)^2", "かっこxたす1かっことじの2乗"],
  ["2^{n+1}", "2のかっこnたす1かっことじ乗"],
]) {
  assert.equal(normalizeNarration(tex), speech, tex);
  assert.equal(normalizeNarration(`答えは$${tex}$です。`), `答えは${speech}です。`);
  assert.equal(normalizeNarration(speech), speech, "TTS 直前の二度目の正規化は読みを変えない");
}
for (const source of [String.raw`\unknown{2}`, String.raw`\frac{1}{`, "x_", "$x", String.raw`\sqrt[3]{2}`]) {
  assert.throws(() => normalizeNarration(source), NarrationMathError, source);
}

const base: ApiScript["scenes"][number] = {
  scene_id: 1, narration: "説明", visual_type: "step", visual_content: String.raw`値は\theta`,
  visual_kind: "figure", visual_items: [String.raw`[text] 長さは\sqrt{7}`], visual_bars: [], visual_unit: "axes",
  visual_caption: String.raw`角は\(\theta\)`, visual_curves: [], visual_range: [], visual_shade: [],
  visual_points: [{ x: 0, y: 0, label: "a_n" }, { x: 3, y: 0, label: "B" }],
  visual_segments: [{ from: "a_n", to: "B", label: String.raw`\sqrt{7}`, dashed: false, emphasis: 0, ticks: 0, arrow: false }],
  visual_angles: [{ at: "a_n", from: "B", to: "B", label: String.raw`\theta`, ticks: 0 }],
  visual_circles: [{ center: "a_n", radius: 1, label: String.raw`\pi`, dashed: false, from_angle: 0, to_angle: 0, sector: false }],
  visual_highlight: ["a_n", "B"], visual_values: [], visual_table: [],
};
const before = structuredClone(base);
const figure = normalizeVisual(base);
assert.equal(figure?.kind, "figure");
if (figure?.kind === "figure") {
  assert.equal(figure.points[0].label, "$a_n$");
  assert.equal(figure.segments[0].from, figure.points[0].label);
  assert.equal(figure.angles[0].at, figure.points[0].label);
  assert.equal(figure.circles[0].center, figure.points[0].label);
  assert.deepEqual(figure.highlight, ["$a_n$", "B"]);
  assert.deepEqual(figure.lines, [String.raw`[text] 長さは$\sqrt{7}$`]);
}
assert.deepEqual(base, before);
assert.deepEqual(normalizeVisualText(normalizeVisualText(base)), normalizeVisualText(base));
const raw = String.raw`\sqrt{7}`;
for (const kind of ["bullets", "flow", "bars", "table", "tree", "venn", "box", "scatter", "dot", "histogram", "plot", "formula"] as const) {
  const scene = normalizeVisualText({ ...base, visual_kind: kind, visual_items: [raw, "b"],
    visual_bars: [{ label: raw, value: 2 }, { label: "b", value: 3 }], visual_table: [[raw, "b"], [raw, "b"]],
    visual_curves: [{ expr: "x^2", expr_y: "", label: raw, region: "" }] });
  assert.equal(scene.visual_content, String.raw`値は$\theta$`);
  assert.equal(scene.visual_caption, String.raw`角は$\theta$`);
  assert.equal(scene.visual_bars[0].label, `$${raw}$`);
  assert.equal(scene.visual_table[0][0], `$${raw}$`);
  assert.equal(scene.visual_curves[0].label, `$${raw}$`);
  assert.equal(scene.visual_curves[0].expr, "x^2");
  assert.equal(scene.visual_items[0], ["plot", "formula"].includes(kind) ? raw : `$${raw}$`);
}
assert.equal(normalizeFormulaLine(String.raw`[box][text] 値は\sqrt{7}`), String.raw`[box][text] 値は$\sqrt{7}$`);
assert.equal(normalizeFormulaLine(String.raw`[substitute: \theta を代入] $$x^2$$`), String.raw`[substitute: $\theta$ を代入] x^2`);
assert.equal(normalizeFormulaLine(String.raw`[carry] \(x^2\)`), "[carry] x^2");
assert.ok(splitMathText("普通の文").every((part) => !part.math));
console.log("PASS: delimiters, bare/mixed/error TeX, SVG labels, TeX-to-speech readings, visual fields/references and idempotence");
