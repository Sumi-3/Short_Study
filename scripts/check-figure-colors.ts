import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Player } from "@remotion/player";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { apiScriptSchema, normalizeVisual, sceneVisualSchema, type ApiScript } from "../src/types.js";

Object.assign(globalThis, { __STUDY_WEB__: true });
const { themeOf, ThemeProvider } = await import("../src/remotion/theme.js");
const { figureRoleColor } = await import("../src/remotion/math/figureRoleColor.js");
const { Figure } = await import("../src/remotion/math/Figure.js");

// boolean も受け入れる大きな local union ではなく、SDK が実際に送出する JSON schema を
// 調べる。互換用 branch が API grammar に入ってはならない。
const wire = zodOutputFormat(apiScriptSchema).schema as any;
const scene = wire.properties.scenes.items;
assert.equal(Object.keys(scene.properties).length, 19);
assert.equal(scene.required.length, 19);
for (const [field, count] of [["visual_segments", 7], ["visual_angles", 5], ["visual_circles", 7]] as const) {
  assert.equal(Object.keys(scene.properties[field].items.properties).length, count);
  assert.equal(scene.properties[field].items.required.length, count);
}
assert.equal(scene.properties.visual_segments.items.properties.emphasis.type, "integer");
assert.ok(!scene.properties.visual_segments.items.properties.emphasis.anyOf);
const apiEmphasis = apiScriptSchema.shape.scenes.element.shape.visual_segments.element.shape.emphasis;
for (const value of [0, 1, 2, 3, 4, 5]) assert.ok(apiEmphasis.safeParse(value).success);
for (const value of [-1, 6, 1.5, true, false]) assert.ok(!apiEmphasis.safeParse(value).success);

const base: ApiScript["scenes"][number] = {
  scene_id: 1, narration: "説明", visual_type: "point", visual_content: "",
  visual_kind: "figure", visual_items: [], visual_bars: [], visual_unit: "",
  visual_caption: "", visual_curves: [], visual_range: [], visual_shade: [],
  visual_points: [{ x: 0, y: 0, label: "A" }, { x: 3, y: 0, label: "B" }],
  visual_segments: [{ from: "A", to: "B", label: "?", dashed: true, emphasis: 0, ticks: 2, arrow: true }],
  visual_angles: [], visual_circles: [], visual_highlight: [], visual_values: [], visual_table: [],
};
const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
const luminance = (color: number[]) => color.map((v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: number[], b: number[]) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
};
const blend = (over: number[], under: number[], alpha: number) => over.map((v, i) => v * alpha + under[i] * (1 - alpha));

const theme = themeOf();
let minimum = Infinity;
// 単なる無地の swatch でなく、最大の background wash の全組合せに veil と強調面を
// 重ねて含める。最大値同士は実際に動く blob より重なり、保守的な stroke 検査になる。
const grounds = [theme.bg, theme.bgDeep].flatMap((ground) => Array.from({ length: 8 }, (_, mask) => {
  let color = rgb(ground);
  for (const [i, accent] of [2, 1, 4].entries()) {
    if (mask & (1 << i)) color = blend(rgb(theme.accents[accent]), color, 0.55 * theme.wash);
  }
  const veil = theme.veil.match(/[\d.]+/g)!.map(Number);
  return blend(veil.slice(0, 3), color, veil[3]);
})).flatMap((ground) => [ground, ...theme.accents.map((accent) => blend(rgb(accent), ground, 0.18))]);

for (const emphasis of [0, 1, 2, 3, 4, 5, false, true] as const) {
  const numeric = typeof emphasis === "number";
  const input = { ...base, visual_segments: [{ ...base.visual_segments[0], emphasis: numeric ? emphasis : 0 }] };
  const data = normalizeVisual(input);
  assert.ok(data?.kind === "figure");
  data.segments[0].emphasis = emphasis;
  assert.ok(sceneVisualSchema.safeParse(data).success);
  // 意図して別の scene accent を使う。true は従来どおりの accent を保ち、role は
  // scene が変わっても同じ色を保たなければならない。
  const accent = theme.accents[4];
  const color = emphasis === true ? accent : emphasis ? figureRoleColor(theme, emphasis) : theme.inkDim;
  const Component = () => React.createElement(ThemeProvider, { value: theme }, React.createElement(Figure, { data, accent }));
  const html = renderToStaticMarkup(React.createElement(Player, {
    component: Component, compositionWidth: 1080, compositionHeight: 1920,
    fps: 30, durationInFrames: 300, initialFrame: 240, acknowledgeRemotionLicense: true,
  }));
  assert.doesNotMatch(html, /<template[^>]*data-msg=/);
  assert.ok(html.includes(`stroke="${color}" stroke-width="${emphasis ? 9 : 5}"`));
  assert.ok(html.includes('stroke-dasharray="14 12"'));
  assert.equal((html.match(/<line /g) ?? []).length, 3, "edge and both equality ticks survive");
  assert.ok(html.includes(`fill="${color}"`), "arrow and label use the edge color");
  assert.ok(html.includes('>?</text>'));
  if (numeric && emphasis > 0) {
    assert.equal(data.segments[0].emphasis, emphasis, "normalization preserves the role");
    for (const ground of [theme.bg, theme.bgDeep]) assert.ok(ratio(rgb(color), rgb(ground)) >= 4.5);
    const worst = Math.min(...grounds.map((ground) => ratio(rgb(color), ground)));
    assert.ok(worst >= 3, `whiteboard role ${emphasis}: stroke contrast ${worst}`);
    minimum = Math.min(minimum, worst);
  }
}
assert.equal(new Set([1, 2, 3, 4, 5].map((role) => figureRoleColor(theme, role))).size, 5);
console.log(`whiteboard: all 5 roles, legacy booleans, labels/ticks/dashes/arrows; worst stroke contrast ${minimum.toFixed(2)}:1`);

let figures = 0;
for (const file of await readdir(new URL("../public/projects/", import.meta.url), { recursive: true })) {
  if (!file.endsWith("/manifest.json")) continue;
  const manifest = JSON.parse(await readFile(new URL(`../public/projects/${file}`, import.meta.url), "utf8"));
  for (const scene of manifest.scenes) {
    if (scene.visual?.kind !== "figure") continue;
    // これらの file も ticks/circles/axes 導入前のものである。migration を要求せず、
    // emphasis 自体を検証して未変更の payload を render する。
    const figureSchema = sceneVisualSchema.options.find((option) => option.shape.kind.value === "figure")! as any;
    for (const segment of scene.visual.segments) {
      assert.ok(figureSchema.shape.segments.element.shape.emphasis.safeParse(segment.emphasis).success, file);
    }
    const html = renderToStaticMarkup(React.createElement(Player, {
      component: Figure, inputProps: { data: scene.visual, accent: theme.accents[0] },
      compositionWidth: 1080, compositionHeight: 1920, fps: 30,
      durationInFrames: 300, initialFrame: 240, acknowledgeRemotionLicense: true,
    }));
    assert.doesNotMatch(html, /<template[^>]*data-msg=|NaN/);
    assert.ok(html.includes("<svg") && html.includes("<line"), file);
    figures++;
  }
}
console.log(`PASS: outbound schema 19 required fields, segments/angles/circles remain 7/5/7; ${figures} existing figures render without migration. Browser rendering not checked.`);
