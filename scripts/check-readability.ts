import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Player } from "@remotion/player";
import { parseProblemOutline } from "../src/problemOutline.js";

// SSR exercises the real scene components without requiring Chrome or remote
// fonts. It checks content preservation, not browser layout or measured fit.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
    return nextLoad(url, context);
  },
});
Object.assign(globalThis, { __STUDY_WEB__: true });
const { SceneShell } = await import("../src/remotion/SceneShell.js");
const { SceneText } = await import("../src/remotion/SceneText.js");
const { SceneDiagram } = await import("../src/remotion/SceneDiagram.js");
const { MathText } = await import("../src/remotion/MathText.js");

const render = (component: React.ComponentType<any>, inputProps: any) => {
  const html = renderToStaticMarkup(React.createElement(Player, {
    component, inputProps, compositionWidth: 1080, compositionHeight: 1920,
    fps: 30, durationInFrames: inputProps.durationInFrames, initialFrame: 40,
  }));
  // Suspense can serialize an error as a fallback instead of throwing it.
  // An HTML string alone therefore does not prove the scene rendered.
  assert.doesNotMatch(html, /<template[^>]*data-msg=/);
  return html;
};
const mathText = (text: string) => renderToStaticMarkup(React.createElement(MathText, { text }));
const scene = { scene_id: 1, visual_type: "hook", visual_content: "", narration: "説明" };
const renderCard = (text: string, points: string[], poster = false) => render(SceneShell, {
  scene, durationInFrames: 300, accent: "#ffcc00", poster,
  problem: { text, points, label: "問題", unit: "数学" },
});

assert.deepEqual(parseProblemOutline([]), { conditions: [], questions: [] });
assert.deepEqual(parseProblemOutline(["値を求める"]), {
  conditions: [], questions: [{ number: null, text: "値を求める" }],
});
assert.deepEqual(parseProblemOutline(["円に内接する四角形ABCD", "AB = BC = 7", "cos Bを求める"]), {
  conditions: ["円に内接する四角形ABCD", "AB = BC = 7"],
  questions: [{ number: null, text: "cos Bを求める" }],
});
assert.deepEqual(parseProblemOutline(["条件", "(1) 第一問", "補足条件", "（２）第二問"]), {
  conditions: ["条件"], questions: [
    { number: "1", text: "第一問\n補足条件" }, { number: "2", text: "第二問" },
  ],
});

// Each compatibility branch is rendered, so a correct parser cannot mask a
// dropped paragraph, a missing lone question, or a hidden earlier question.
const fixtures = [
  { text: "古い問題文の段落\nx^2の値を求めよ。", points: [] },
  { text: "", points: ["値を求める"] },
  { text: "", points: ["(1) x^2の値を求めよ。"] },
  { text: "", points: ["円に内接する四角形ABCD", "AB = BC = 7", "cos Bを求める"] },
  { text: "", points: ["関数f(x)=x^2-4x+3である。", "(1) f(x)=0を解け。", "(2) 0≦x≦3での最小値を求めよ。"] },
  { text: "", points: ["(1) 第一問\n補足条件", "（２）第二問"] },
  { text: "", points: [...Array.from({ length: 14 }, (_, i) => `条件${i + 1}の全文を保持する。`), "(1) 第一問", "(2) 最後の問いも表示する。"] },
];
for (const { text, points } of fixtures) {
  const parsed = parseProblemOutline(points);
  for (const poster of [false, true]) {
    const html = renderCard(text, points, poster);
    assert.ok(!html.includes("line-clamp"));
    if (!points.length) assert.ok(html.includes(mathText(text)));
    for (const condition of parsed.conditions) assert.ok(html.includes(mathText(condition)));
    for (const question of parsed.questions) {
      assert.ok(html.includes(mathText(question.text)));
      if (question.number) assert.ok(html.includes(`>(${question.number})</span>`));
    }
  }
}

// The former 56px estimate floor could approve a poster taller than its
// frame. Check both raw text and numbered outlines well beyond that floor;
// SSR can guard the estimate and fixed budget, but cannot exercise DOM fit.
for (const outlined of [false, true]) {
  const lines = [...Array.from({ length: 100 }, (_, i) => `条件${i + 1}として、すべての数値と範囲を省略せずに残す。`), "(1) 最後の問いを求めよ。"];
  const html = renderCard(outlined ? "" : lines.join("\n"), outlined ? lines : [], true);
  assert.ok(html.includes(mathText(outlined ? "最後の問いを求めよ。" : lines.join("\n"))));
  assert.match(html, /height:1540px;min-height:0;display:flex;align-items:center/);
  const size = Number(html.match(/font-weight:700;font-size:([\d.]+)px;line-height:1.55/)?.[1]);
  assert.ok(size > 0 && size < 56, `long poster must shrink below 56px, got ${size}`);
}

let manifests = 0;
let scenes = 0;
for (const file of await readdir(new URL("../public/projects/", import.meta.url), { recursive: true })) {
  if (!file.endsWith("/manifest.json")) continue;
  const manifest = JSON.parse(await readFile(new URL(`../public/projects/${file}`, import.meta.url), "utf8"));
  const points = manifest.outline ?? [];
  const parsed = parseProblemOutline(points);
  for (const poster of [false, true]) {
    const html = renderCard(manifest.topic, points, poster);
    if (!points.length) assert.ok(html.includes(mathText(manifest.topic)), file);
    for (const condition of parsed.conditions) assert.ok(html.includes(mathText(condition)), file);
    for (const question of parsed.questions) assert.ok(html.includes(mathText(question.text)), file);
  }
  for (const existing of manifest.scenes) {
    const component = existing.visual && existing.visual.kind !== "bullets" ? SceneDiagram : SceneText;
    const html = render(component, {
      scene: existing, durationInFrames: existing.durationInFrames, accent: "#ffcc00",
    });
    assert.ok(html.length > 0, `${file}: ${existing.scene_id}`);
    if (existing.visual?.kind === "formula") {
      assert.ok((html.match(/data-formula-measure/g) ?? []).length >= existing.visual.lines.length,
        `${file}: ${existing.scene_id} must retain every formula row`);
    }
    scenes++;
  }
  manifests++;
}
console.log(`PASS: compatibility branches, numbered/continued questions, no clamp, ${manifests} manifests (video/poster cards), ${scenes} scene SSR renders; browser layout not measured`);
