import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { registerHooks } from "node:module";
import React from "react";
import katex from "katex";
import { renderToStaticMarkup } from "react-dom/server";
import { Player } from "@remotion/player";
import { parseProblemOutline } from "../src/problemOutline.js";

// SSR なら Chrome や remote font を要さず実際の scene component を検証できる。確認するのは
// content の保持であり、browser 上の layout や計測済みの fit ではない。
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
const { themeOf } = await import("../src/remotion/theme.js");
const { Poster } = await import("../src/remotion/Poster.js");
const { scriptSchema } = await import("../src/types.js");
const { summarize } = await import("../src/shorts.js");
const theme = themeOf();
const accent = theme.accents[0];

const render = (component: React.ComponentType<any>, inputProps: any) => {
  const html = renderToStaticMarkup(React.createElement(Player, {
    component, inputProps, compositionWidth: 1080, compositionHeight: 1920,
    fps: 30, durationInFrames: inputProps.durationInFrames, initialFrame: 40,
  }));
  // Suspense は error を throw せず fallback として serialize することがある。ゆえに
  // HTML string があるだけでは scene が render された証明にならない。
  assert.doesNotMatch(html, /<template[^>]*data-msg=/);
  return html;
};
const mathText = (text: string) => renderToStaticMarkup(React.createElement(MathText, { text }));
const literalText = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, text));
// display mode ではなく inline の `\displaystyle` を使う。limit は `lim` の下に置くが、
// 数式は文から飛び出さず文中に収まらなければならない。
const inlineMath = (tex: string) => `<span>${katex.renderToString(`\\displaystyle ${tex}`, {
  displayMode: false, throwOnError: false, output: "html",
})}</span>`;

// markup 全体を比較し、prose・unit・日付が誤って math mode に入ることも、legacy
// normalizer が KaTeX に渡る前の TeX を変えてしまうことも防ぐ。
for (const tex of [
  "x^2+4x-3", String.raw`\frac{3\sqrt{19}}{4}`,
  String.raw`\lim_{n \to \infty} a_n`, String.raw`\sum_{k=1}^{n} k^2`,
]) {
  const html = mathText(`9/8に公開。$${tex}$ の値を求めよ。単位はkm/h。`);
  assert.equal(html, `9/8に公開。${inlineMath(tex)} の値を求めよ。単位はkm/h。`);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /katex-display|cjk_fallback/);
}
// `op-limits` は limit の条件が演算子の下に行くときだけ KaTeX が使う class である。
// text style なら横に並ぶ。これが上の `\displaystyle` を使う理由そのものである。
assert.match(mathText(String.raw`$\lim_{n \to \infty} a_n$`), /mop op-limits/);
assert.equal(mathText("$x^2$ と $a_n$"), `${inlineMath("x^2")} と ${inlineMath("a_n")}`);
assert.equal(mathText("日本語だけ。単位km/h、9/8に公開。"), "日本語だけ。単位km/h、9/8に公開。");
for (const source of [
  "$", "$$", "$$$", "前$$後", "前$ $後", "前$\n$後",
  "前$x^2 後", String.raw`前$\frac{3}{4} 後`,
  String.raw`価格\$5です`, String.raw`前\$x^2\$後`,
  "前$<b>&後",
]) assert.equal(mathText(source), literalText(source), source);
assert.equal(mathText("前$x^2$$後"), `前${inlineMath("x^2")}$後`);
assert.equal(mathText("前$$中 $x$ 後$$"), `前$$中 ${inlineMath("x")} 後$$`);
assert.equal(mathText("$x$ 後$未完"), `${inlineMath("x")} 後$未完`);
assert.equal(mathText(String.raw`価格\$5 と $x$`), String.raw`価格\$5 と ${inlineMath("x")}`);
assert.equal(mathText(String.raw`\\$x$`), String.raw`\\${inlineMath("x")}`);
assert.equal(mathText(String.raw`$x+\$5$`), inlineMath(String.raw`x+\$5`));
const malformed = mathText(String.raw`前$\frac{1}{$後`);
assert.doesNotMatch(malformed, /katex-error|color:#cc0000/);
assert.ok(malformed.startsWith("前"));
assert.ok(malformed.endsWith("後"));
assert.ok(malformed.includes(String.raw`\frac{1}{`));

const scene = { scene_id: 1, visual_type: "hook", visual_content: "", narration: "説明" };
const renderCard = (text: string, points: string[], poster = false) => render(SceneShell, {
  scene, durationInFrames: 300, accent, poster,
  problem: { text, points, unit: "数学" },
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

// 各 compatibility branch を render する。これにより正しい parser が paragraph の脱落、
// 一つだけの問題の欠落、前の問題の非表示を覆い隠せない。
const fixtures = [
  { text: "条件 $x^2+4x-3=0$ を満たす値を求めよ。", points: [] },
  { text: "", points: [String.raw`値は $\frac{3\sqrt{19}}{4}$ である。`, "(1) $a_n$ の値を求めよ。"] },
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
      // 区別すべき問題が複数あるときだけ番号を出す。一問だけなら data には番号を残すが、
      // 画面には出さない。
      const shownNumber = html.includes(`>(${question.number})</span>`);
      assert.equal(shownNumber, question.number !== null && parsed.questions.length > 1);
    }
    assert.doesNotMatch(html, />問<\/span>/);
    // 開始 card はそれ自体で何かを示す。上に置く「問題」chip は、下の問題文がすでに
    // 示していることを繰り返すだけである。
    assert.doesNotMatch(html, />問題</);
    if (parsed.questions.length && parsed.questions.every((question) => question.number === null)) {
      assert.doesNotMatch(html, /min-width:1.55em/);
    }
    if (parsed.conditions.length && parsed.questions.length) assert.match(html, /border-top:2px solid/);
  }
}

// 以前の 56px の推定下限では、frame より高い poster を通してしまい得た。その下限を
// 大きく超える raw text と番号付き outline の両方を検査する。SSR は推定と固定 budget を
// 守れるが、DOM fit までは試せない。
for (const outlined of [false, true]) {
  const lines = [...Array.from({ length: 100 }, (_, i) => `条件${i + 1}として、すべての数値と範囲を省略せずに残す。`), "(1) 最後の問いを求めよ。"];
  const html = renderCard(outlined ? "" : lines.join("\n"), outlined ? lines : [], true);
  assert.ok(html.includes(mathText(outlined ? "最後の問いを求めよ。" : lines.join("\n"))));
  assert.match(html, /height:1540px;min-height:0;display:flex;align-items:center/);
  const size = Number(html.match(/font-weight:700;font-size:([\d.]+)px;line-height:1.55/)?.[1]);
  assert.ok(size > 0 && size < 56, `long poster must shrink below 56px, got ${size}`);
}

// legacy manifest に加え新しい marker markup も試す。SSR は文字の size を確認できるが、
// 計測に基づく縮小には依然 browser が必要である。
const { Formula } = await import("../src/remotion/math/Formula.js");
for (const [count, compact, expected] of [
  [2, false, 60], [3, false, 56], [4, false, 52], [6, false, 48], [2, true, 46],
] as const) {
  const html = render(Formula, {
    lines: ["[text][underline] 両辺を2で割る", ...Array(count - 1).fill("[plain] x=2")],
    caption: "符号に注意", accent, compact, durationInFrames: 300,
  });
  assert.ok(html.includes(`font-size:${expected}px;line-height:1.3`));
  assert.ok(html.includes("両辺を2で割る"));
}
// 旧 manifest の [carry] は行ごと落とす。marker が本文へ漏れず、淡い再掲も残さない。
const carryHtml = render(Formula, {
  lines: ["[carry] x=2", "[box] x^2=4"], caption: "二乗する", accent, durationInFrames: 300,
});
assert.ok(!carryHtml.includes("[carry]"));
assert.ok(!carryHtml.includes("前の式"));
assert.ok(!carryHtml.includes("opacity:0.68"));
// 残るのは [box] の行だけ。`katex-display` は注入した style にも出るので数式そのものを数える。
assert.equal((carryHtml.match(/class="katex"/g) ?? []).length, 1);

// incoming edge は、無関係な条件や prose を implication にせず statement/companion mode を
// 通過しなければならない。ここでは markup だけを検査し、label の折返し後の高さと fit した
// 配置には依然 browser が必要である。
for (const compact of [false, true]) {
  const html = render(Formula, {
    lines: ["[highlight] y=x^2+1", "[substitute: x=2 を代入][box] y=5"],
    caption: "", accent, compact, durationInFrames: 300,
  });
  assert.match(html, /class="formula-statements"/);
  assert.equal((html.match(/↓/g) ?? []).length, 1);
  assert.equal((html.match(/data-formula-substitution/g) ?? []).length, 1);
  assert.ok(html.includes("x=2 を代入"));
  assert.ok(!html.includes("[substitute:"));
  assert.match(html, /grid-template-columns:1fr auto 1fr/);
}
const label = "前に求めたx=2とy=3をそれぞれ対応する文字に代入する";
const longLabelHtml = render(Formula, {
  lines: ["[plain] z=x+y", `[substitute: ${label}] z=2+3`, "[text] 和を求める", "[box] z=5"],
  caption: "", accent, durationInFrames: 300,
});
assert.ok(longLabelHtml.includes(label));
assert.match(longLabelHtml, /overflow-wrap:anywhere;white-space:normal/);
assert.equal((longLabelHtml.match(/↓/g) ?? []).length, 1);
for (const lines of [["[substitute: x=2 を代入] y=5"], ["[text] 条件", "[substitute: x=2 を代入] y=5"]]) {
  const html = render(Formula, { lines, caption: "", accent, durationInFrames: 300 });
  assert.ok(!html.includes("↓"), "no arrow without an immediately preceding equation");
}
const legacyDerivation = render(Formula, {
  lines: ["x+2=5", "x=3"], caption: "", accent, durationInFrames: 300,
});
assert.match(legacyDerivation, /class="formula-derivation"/);
assert.equal((legacyDerivation.match(/↓/g) ?? []).length, 1);
assert.equal(mathText("x=±2"), "x=±2");

// `[text]` line は MathText を通る prose なので、解説内の inline math も問題 card と
// 同じように組版されなければならない。
const proseLine = render(Formula, {
  lines: [String.raw`[text] 判別式 $D = b^2-4ac$ の符号を調べる`, "[plain] x=2"],
  caption: "", accent, durationInFrames: 300,
});
assert.match(proseLine, /class="katex"/);
assert.ok(proseLine.includes("の符号を調べる"));
assert.doesNotMatch(proseLine, /\$D = b/);
// 数式の下の読み上げ行を heading weight にしてはならない。
assert.match(proseLine, /font-weight:500/);
// arrow は導出の各 step を示す。句読点サイズでは小さすぎた。
assert.match(render(Formula, {
  lines: ["x+2=5", "x=3"], caption: "", accent, durationInFrames: 300,
}), new RegExp(`font-size:76px;line-height:1[^;]*;color:${accent}`));

// 日付・単位・根号だけの曖昧な表記は保ち、LaTeX の命令や添字があれば数式として救う。
for (const plain of ["3√19/4", "9/8に公開", "面積を求める", "km/h"]) {
  assert.equal(mathText(plain), plain);
}
for (const tex of [String.raw`\frac{3\sqrt{19}}{4}`, String.raw`\frac{x^2}{2}`,
  "∫_0^π x dx", "∑_{k=1}^{n} k", "lim_{n→∞} a_n", "x^2", "a_n"]) {
  assert.match(mathText(tex), /class="katex"/);
  assert.doesNotMatch(mathText(tex), /katex-error/);
}
// 字幕は text style。displaystyle の分数は 2 行の帯を押し広げるので、`display={false}` で
// 分数を小さく組み、極限の条件は `lim` の横に置く。
const inlineFraction = renderToStaticMarkup(
  React.createElement(MathText, { text: String.raw`答えは $\frac{1}{2}$ です`, display: false }),
);
assert.match(inlineFraction, /class="katex"/);
assert.doesNotMatch(inlineFraction, /displaystyle|katex-display/);
assert.ok(inlineFraction.startsWith("答えは "));

const { LibraryCard } = await import("../web/src/LibraryCard.js");
for (const outline of [[], ["(1) $x^2$ の値を求めよ。"]]) {
  const html = renderToStaticMarkup(React.createElement(LibraryCard, {
    short: {
      slug: "inline-math", topic: "$x^2$ の値を求めよ。", outline,
      headline: "", course: "math", subject: "math", unit: "数学", subunit: "",
      createdAt: "", manifestSrc: "", durationInFrames: 300, fps: 30,
    },
    onOpen() {}, onDelete() {}, deleting: false,
  }));
  assert.ok(html.includes(inlineMath("x^2")));
  assert.ok(html.includes("の値を求めよ。"));
}

// card の問題は動画の1シーン目と同じ姿にする。1 問しかない list に番号は振らず、条件と問いの
// 間には同じ細い線を引く。
{
  const card = (outline: string[]) => renderToStaticMarkup(React.createElement(LibraryCard, {
    short: {
      slug: "outline", topic: "問題文", outline,
      headline: "", course: "math", subject: "math", unit: "数学", subunit: "",
      createdAt: "", manifestSrc: "", durationInFrames: 300, fps: 30,
    },
    onOpen() {}, onDelete() {}, deleting: false,
  }));
  const condition = "三角形$ABC$は円に内接する。";
  const single = card([condition, "(1) $x$ を求めよ。"]);
  assert.doesNotMatch(single, /\(1\)/, "単独の問いに番号は振らない");
  assert.match(single, /border-top/, "条件と問いの間に線を引く");
  const many = card([condition, "(1) $x$ を求めよ。", "(2) $y$ を求めよ。"]);
  assert.match(many, /\(1\)/);
  assert.match(many, /\(2\)/);
  assert.doesNotMatch(card(["(1) $x$ を求めよ。"]), /border-top/, "条件がなければ線は引かない");
}

let manifests = 0;
let scenes = 0;
for (const file of await readdir(new URL("../public/projects/", import.meta.url), { recursive: true })) {
  if (!file.endsWith("/manifest.json")) continue;
  const manifest = JSON.parse(await readFile(new URL(`../public/projects/${file}`, import.meta.url), "utf8"));
  // 旧 design key は script を拒否させても、異なる見た目を選ばせてもならない。
  const script = scriptSchema.omit({ scenes: true }).parse(manifest);
  assert.ok(!("design" in script));
  const summary = summarize(manifest, manifest.slug, file);
  assert.ok(!("design" in summary));
  const posterHtml = render(Poster, { ...summary, durationInFrames: 300 });
  const cardHtml = renderToStaticMarkup(React.createElement(LibraryCard, {
    short: summary, onOpen() {}, onDelete() {}, deleting: false,
  }));
  for (const html of [posterHtml, cardHtml]) {
    assert.ok(html.includes(theme.bgDeep) && html.includes(theme.ink), file);
  }
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
      scene: existing, durationInFrames: existing.durationInFrames, accent,
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
console.log(`PASS: compatibility branches, numbered/continued questions, card outline rule, no clamp, ${manifests} manifests (video/poster cards), ${scenes} scene SSR renders; browser layout not measured`);
