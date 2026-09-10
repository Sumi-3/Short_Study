/**
 * 「書いたのに画面に出ない」だけを却下する。
 *
 * `normalizeVisual` と renderer は、不正な視覚データを例外にせず静かに削る設計である
 * （上限を超えた行は slice され、存在しない点を指す線分は捨てられ、curve が1本も compile
 * できない plot は `undefined` になってテキストへ落ちる）。再生を守るには正しいが、
 * 生成の側から見ると、モデルが書いた内容が誰にも知られず消えることになる。
 *
 * プロンプトはこれらを散文で禁じているが、散文は強制ではない。しかも構造化出力の
 * compiled grammar には余地が無く（`types.ts` の `apiScriptSchema` 参照）、型と required
 * 以外の制約は grammar に載らない。よって残る強制手段はここだけである。
 *
 * 却下は `generateScript` の再試行で理由ごと引用されるため、文面はモデルへの指示として書く。
 *
 * 検査するのは renderer の実挙動と一致するものに限る。「増減表を出すべき」のような編集方針は
 * ここでは扱わない。正しい台本を却下して数分かけて引き直させるのは、規則を守らせないことより
 * 高くつくためである（`solutionPlan.ts` と同じ判断）。
 */
import { COMPANION_MAX_LINES, FORMULA_MAX_LINES, parseFormulaLine } from "./formulaLines.js";
import { splitMathText } from "./mathText.js";
import { splitNarration } from "./narration.js";
import type { ApiScript } from "./types.js";

type Scene = ApiScript["scenes"][number];

/** 併記行を持つ種別。ここだけが行頭マーカーと [substitute:] の置き場所である。 */
const LINE_KINDS = ["formula", "figure", "plot"];

/**
 * `normalizeVisual` が解釈できる種別。API スキーマは enum を強制できないため（`types.ts` の
 * `visual_kind` 参照）綴り違いはここで捕まえる。放っておくと図なしのシーンになる。
 */
const KINDS = [
  "bullets", "flow", "bars", "formula", "plot", "figure",
  "table", "tree", "venn", "histogram", "box", "scatter", "dot", "none",
];

const MARKER =
  /\[(?:text|carry|box|underline|circle|highlight|strike|bracket|plain|substitute:)/;

/**
 * 閉じない `$` は `splitMathText` が数式に畳めず、`normalizeMathText` を通っても本文のまま
 * 残る。つまり画面に `$` がそのまま出る。プロンプトで7箇所くり返している規則がこれである。
 */
const strayDollar = (text: string) =>
  splitMathText(text).some((part) => !part.math && /(?:^|[^\\])\$/.test(part.text));

/** `expression.ts` の tokenize と同じ範囲。LaTeX が混ざった expr は curve ごと消える。 */
const FUNCTIONS = [
  "sin", "cos", "tan", "asin", "acos", "atan",
  "sqrt", "abs", "exp", "ln", "log", "floor", "ceil",
];
const CONSTANTS = ["pi", "e"];

const badExpr = (expr: string, variable: "x" | "t") => {
  const text = expr.replace(/\s+/g, "").toLowerCase();
  if (/[^0-9a-z.+\-*/^()]/.test(text)) {
    return "数字・変数・+ - * / ^ ( ) と定められた関数以外は書けません（LaTeX は使えません）";
  }
  // tokenize は [a-z]+ をまとめて1語にするため、"sinx" は関数ではなく未知語になる。
  const unknown = (text.match(/[a-z]+/g) ?? []).filter(
    (word) => word !== variable && !CONSTANTS.includes(word) && !FUNCTIONS.includes(word),
  );
  return unknown.length
    ? `${unknown.join("・")} は使えません（変数は ${variable} だけ、関数は ${FUNCTIONS.join(" ")}）`
    : null;
};

/**
 * `normalizeVisual` が黙って切り落とす上限。超えた分は画面に出ないまま消える。
 * 上限そのものは表示高さの都合なので、削るのではなくシーンを分けるよう促す。
 */
const truncated = (scene: Scene): string[] => {
  const items = scene.visual_items.filter((line) => line.trim());
  const rows = scene.visual_table.filter((row) => row.length > 0);
  const over = (label: string, actual: number, limit: number) =>
    actual > limit
      ? [`${label}が${actual}個あり、上限${limit}個を超えた分は画面に出ません。シーンを分けてください`]
      : [];

  switch (scene.visual_kind) {
    case "formula":
      return over("visual_items の行", items.length, FORMULA_MAX_LINES);
    case "figure":
      return [
        ...over("visual_items の併記行", items.length, COMPANION_MAX_LINES),
        ...over("visual_points の点", scene.visual_points.length, 8),
        ...over("visual_segments の線分", scene.visual_segments.length, 10),
        ...over("visual_angles の角", scene.visual_angles.length, 3),
        ...over("visual_circles の円", scene.visual_circles.length, 3),
      ];
    case "plot":
      return [
        ...over("visual_items の併記行", items.length, COMPANION_MAX_LINES),
        ...over("visual_curves の曲線", scene.visual_curves.length, 3),
        ...over("visual_points の点", scene.visual_points.length, 3),
      ];
    case "flow":
      return over("visual_items の手順", items.length, 4);
    case "table":
      return [
        ...over("visual_table の行", rows.length, 6),
        ...rows.flatMap((row, index) => over(`visual_table の${index + 1}行目のセル`, row.length, 8)),
      ];
    case "tree":
      return [
        ...over("visual_table の経路", rows.length, 12),
        ...rows.flatMap((row, index) => over(`visual_table の${index + 1}本目の枝`, row.length, 5)),
      ];
    case "venn":
      return over("visual_items の集合", items.length, 3);
    case "histogram":
      return [
        ...over("visual_values の階級", scene.visual_values.length, 12),
        ...over("visual_points の基準線", scene.visual_points.length, 3),
      ];
    case "box":
      return [
        ...over("visual_values の5数要約", scene.visual_values.length, 15),
        // 5 で割った余りは箱を作れず捨てられる。1群5個ずつという規則の破れがここに出る。
        ...(scene.visual_values.length % 5
          ? [`visual_values が${scene.visual_values.length}個で5の倍数ではありません。余りの${scene.visual_values.length % 5}個は捨てられます`]
          : []),
      ];
    case "scatter":
      return over("visual_points の点", scene.visual_points.length, 40);
    case "dot":
      return [
        ...over("visual_values の値", scene.visual_values.length, 40),
        ...over("visual_points の基準線", scene.visual_points.length, 3),
      ];
    default:
      return [];
  }
};

/**
 * `normalizeVisual` が `undefined` を返す条件。図が出ず、`visual_content` のテキストだけに
 * なる。図が要る単元でこれが起きると、プロンプトが最も強く禁じている「文字だけの説明」に
 * なってしまう。
 */
const dropped = (scene: Scene): string[] => {
  const items = scene.visual_items.filter((line) => line.trim());
  const rows = scene.visual_table.filter((row) => row.filter(Boolean).length > 0);
  const finite = (values: readonly number[], count: number) =>
    values.length >= count && values.slice(0, count).every(Number.isFinite);
  const missing = (reason: string) => [`${reason}。この図は表示されず、テキストだけのシーンになります`];

  switch (scene.visual_kind) {
    case "bullets":
      return items.length ? [] : missing("visual_items が空です");
    case "formula":
      return items.length ? [] : missing("visual_items が空です");
    case "flow":
      return items.length >= 2 ? [] : missing("visual_items の手順が2個未満です");
    case "bars":
      return scene.visual_bars.length >= 2 ? [] : missing("visual_bars が2本未満です");
    case "table":
      return rows.length >= 2 ? [] : missing("visual_table が2行未満です");
    case "tree":
      return rows.length >= 2 ? [] : missing("visual_table の経路が2本未満です");
    case "venn": {
      if (items.length < 2) return missing("visual_items の集合が2個未満です");
      const need = items.length === 2 ? 4 : 8;
      return scene.visual_values.length >= need
        ? []
        : [`visual_values が${scene.visual_values.length}個です。${items.length}集合では決まった順に${need}個必要です`];
    }
    case "histogram": {
      const [start, end] = scene.visual_range;
      if (scene.visual_values.filter(Number.isFinite).length < 2) {
        return missing("visual_values の階級が2個未満です");
      }
      return Number.isFinite(start) && end > start
        ? []
        : missing("visual_range が [下限, 上限] になっていません");
    }
    case "box": {
      const groups = Math.floor(scene.visual_values.length / 5);
      if (groups < 1) return missing("visual_values が5個未満です");
      // 四分位数が逆順の箱は normalizeVisual が丸ごと捨てる。裏返った箱ひげ図より無い方が安全でも、
      // 数え違いを黙って消せば、その群だけ図から消えた動画になる。
      return Array.from({ length: groups }, (_, index) =>
        scene.visual_values.slice(index * 5, index * 5 + 5),
      ).flatMap((five, index) =>
        five.every((value, at) => at === 0 || five[at - 1] <= value)
          ? []
          : [`visual_values の${index + 1}組目が小さい順ではありません（最小・第1四分位・中央・第3四分位・最大の順）`],
      );
    }
    case "scatter":
      return [
        ...(scene.visual_points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).length >= 3
          ? [] : missing("visual_points が3個未満です")),
        ...(finite(scene.visual_range, 4) ? [] : missing("visual_range が4つの数値になっていません")),
      ];
    case "dot":
      return scene.visual_values.filter(Number.isFinite).length >= 2
        ? [] : missing("visual_values が2個未満です");
    case "figure": {
      const labelled = scene.visual_points.filter((point) => point.label);
      const known = new Set(labelled.map((point) => point.label));
      // 参照先の無い線分・角・円は捨てられる。座標を書き忘れたのではなく点名の綴り違いが多い。
      const orphan = (label: string, ids: readonly string[]) =>
        ids.filter((id) => !known.has(id)).map((id) => `${label} が指す点 "${id}" が visual_points にありません`);
      const broken = [
        ...scene.visual_segments.flatMap((s) => orphan("visual_segments", [s.from, s.to])),
        ...scene.visual_angles.flatMap((a) => orphan("visual_angles", [a.at, a.from, a.to])),
        ...scene.visual_circles.flatMap((c) => orphan("visual_circles", [c.center])),
        ...orphan("visual_highlight", scene.visual_highlight),
      ];
      const segments = scene.visual_segments.filter((s) => known.has(s.from) && known.has(s.to));
      const circles = scene.visual_circles.filter((c) => known.has(c.center) && c.radius > 0);
      return [
        ...new Set(broken),
        ...(labelled.length >= 2 ? [] : missing("名前の付いた visual_points が2個未満です")),
        ...(segments.length || circles.length
          ? [] : missing("描ける visual_segments も visual_circles もありません")),
      ];
    }
    case "plot": {
      const curves = scene.visual_curves.filter((curve) => curve.expr).slice(0, 3);
      if (!curves.length) return missing("visual_curves に expr がありません");
      if (!finite(scene.visual_range, 4)) {
        return missing("visual_range の [xの最小, xの最大, yの最小, yの最大] が数値になっていません");
      }
      const shade = scene.visual_shade;
      const between = curves.filter((curve) => curve.region === "between");
      /*
       * 領域の塗りは buildRegionPolygons が丸ごと諦める（空配列を返す）作りなので、
       * 1本の指定違いで領域全体が消える。境界線だけが残るため、面積の問題なのに
       * 何も塗られていない動画になる。
       */
      const region = [
        ...(between.length && between.length !== 2
          ? [`region="between" は2本の曲線の両方に付けてください（今は${between.length}本）`] : []),
        ...(between.length && shade.length !== 2
          ? ['region="between" には visual_shade=[左端x, 右端x] が必須です'] : []),
        ...(between.some((curve) => curve.expr_y)
          ? ['region="between" は y=f(x) の曲線どうしにだけ使えます（expr_y は空にしてください）'] : []),
        ...(curves.some((curve) => curve.region === "inside" && !curve.expr_y)
          ? ['region="inside" は媒介変数表示の閉曲線用です。expr_y を書いてください'] : []),
        ...(curves.some((curve) =>
          ["above", "below", "revolve"].includes(curve.region) && curve.expr_y)
          ? [`region="above"／"below"／"revolve" は y=f(x) 用です。expr_y のある曲線には使えません`] : []),
        ...(shade.length === 2 && !(shade[0] < shade[1])
          ? ["visual_shade は [開始x, 終了x] を開始 < 終了 で書いてください"] : []),
      ];
      const invalid = curves.flatMap((curve) =>
        ([["expr", curve.expr, curve.expr_y ? "t" : "x"],
          ...(curve.expr_y ? [["expr_y", curve.expr_y, "t"]] : [])] as [string, string, "x" | "t"][])
          .flatMap(([name, expr, variable]) => {
            const reason = badExpr(expr, variable);
            return reason ? [`${name} "${expr}": ${reason}。この曲線は描かれません`] : [];
          }),
      );
      return [...region, ...invalid];
    }
    default:
      return [];
  }
};

/**
 * `[substitute:]` の説明が表示される条件は `Formula.tsx` の
 * `substitution && index > 0 && !shown[index - 1].text` である。外れると矢印も説明も出ず、
 * モデルが書いた代入の理由だけが消える。`parseFormulaLine` が [text]／[carry] との併用を
 * 生の行へ戻すため、その場合は逆に `[substitute: …]` が文字として画面に出る。
 */
const substitutions = (scene: Scene): string[] => {
  const written = scene.visual_items.filter((line) => /\[substitute:/.test(line));
  if (!written.length) return [];
  if (!LINE_KINDS.includes(scene.visual_kind)) {
    return [`[substitute:] は formula / figure / plot の visual_items でだけ使えます`];
  }
  const limit = scene.visual_kind === "formula" ? FORMULA_MAX_LINES : COMPANION_MAX_LINES;
  const shown = scene.visual_items.filter((line) => line.trim()).slice(0, limit).map(parseFormulaLine);

  return shown.flatMap((line, index) => {
    const raw = scene.visual_items.filter((value) => value.trim())[index];
    if (/\[substitute:/.test(raw) && !line.substitution) {
      return [`${index + 1}行目: [substitute:] は [text] や [carry] と重ねられず、そのまま文字として画面に出ます`];
    }
    if (!line.substitution) return [];
    if (index === 0) {
      return ["[substitute:] を先頭行に置くと矢印も説明も出ません。代入元の数式行を直前に置いてください"];
    }
    return shown[index - 1].text
      ? [`${index + 1}行目: [substitute:] の直前が [text] 行なので矢印も説明も出ません。代入元の数式行を直前に置いてください`]
      : [];
  });
};

/** 画面に出る文字列と、その名前。$ とマーカーの検査対象はここに集める。 */
const displayed = (scene: Scene): [string, string][] => {
  const lines = LINE_KINDS.includes(scene.visual_kind);
  const label = <T extends { label: string }>(name: string) => (item: T, index: number): [string, string] =>
    [`${name}[${index}] の label`, item.label];

  return [
    ["visual_content", scene.visual_content],
    ["visual_caption", scene.visual_caption],
    // 数式行は裸の LaTeX が保存形式で、$ は normalizeFormulaLine に外される。文章行だけを見る。
    ...scene.visual_items.flatMap((line, index): [string, string][] => {
      if (!line.trim()) return [];
      const parsed = parseFormulaLine(line);
      if (!lines) return [[`visual_items[${index}]`, line]];
      // 数式行の裸の LaTeX には $ を書かない規則で、normalizeFormulaLine が外すため見ない。
      // ただし解釈された分を除いた本文にマーカーが残っていれば、それは重ね過ぎで文字として出る。
      // [substitute:] の重ね過ぎは substitutions() が場所ごと報告するので、ここでは二重に言わない。
      return parsed.text
        ? [[`visual_items[${index}] の[text]行`, parsed.latex]]
        : MARKER.test(parsed.latex) && !/\[substitute:/.test(line)
          ? [[`visual_items[${index}]`, parsed.latex]]
          : [];
    }),
    ...scene.visual_table.flatMap((row, y) =>
      row.map((cell, x): [string, string] => [`visual_table[${y}][${x}]`, cell]),
    ),
    ...scene.visual_points.map(label("visual_points")),
    ...scene.visual_segments.map(label("visual_segments")),
    ...scene.visual_angles.map(label("visual_angles")),
    ...scene.visual_circles.map(label("visual_circles")),
    ...scene.visual_curves.map(label("visual_curves")),
  ];
};

/**
 * マーカーは併記行の行頭専用である。narration に入れば読み上げられ、label や expr に入れば
 * そのまま組版されるか curve ごと消える。
 */
const markers = (scene: Scene): string[] => {
  const found = [
    ...displayed(scene).filter(([, text]) => MARKER.test(text)),
    ...scene.visual_curves.flatMap((curve, index): [string, string][] =>
      MARKER.test(curve.expr) ? [[`visual_curves[${index}] の expr`, curve.expr]] : []),
    ...(MARKER.test(scene.narration) ? [["narration", ""] as [string, string]] : []),
  ];
  return found.length
    ? [`行頭マーカー（[text] や [box] など）は formula / figure / plot の visual_items の行頭でだけ使えます。${
        [...new Set(found.map(([name]) => name))].join("、")} に入っています`]
    : [];
};

/** `$` で囲めていない、または閉じていない箇所。画面に `$` がそのまま出る。 */
const dollars = (scene: Scene): string[] => {
  // 区切りそのものの誤りは呼び出し側が先に報告している。ここでは字幕を読めなければ見送る。
  const display = (() => {
    try {
      return splitNarration(scene.narration).display;
    } catch {
      return null;
    }
  })();
  const broken = [
    ...displayed(scene).filter(([, text]) => strayDollar(text)).map(([name]) => name),
    // 読み用ブロックに $ は書かない規則なので、字幕用ブロックだけを見る。
    ...(display && strayDollar(display) ? ["narration の字幕用ブロック"] : []),
  ];
  return broken.length
    ? [`閉じていない $ があります（${[...new Set(broken)].join("、")}）。数式は $…$ で囲み、地の文は囲まないでください`]
    : [];
};

/**
 * 台本1本を検査する。1シーンの理由はまとめて投げる。1件ずつ告げると、直したところで次の
 * 1件が出て、そのたび生成をやり直すことになるためである（`assertFormulaCarry` と同じ）。
 */
export const assertSceneIntegrity = (scenes: readonly Scene[]) => {
  for (const [index, scene] of scenes.entries()) {
    if (!KINDS.includes(scene.visual_kind)) {
      throw new Error(
        `シーン${index + 1}: visual_kind "${scene.visual_kind}" は使えません。${KINDS.join(" / ")} から選んでください`,
      );
    }
    const reasons = [
      ...dropped(scene),
      ...truncated(scene),
      ...substitutions(scene),
      ...markers(scene),
      ...dollars(scene),
    ];
    if (reasons.length) {
      throw new Error(`シーン${index + 1}の${scene.visual_kind}: ${reasons.join("／")}`);
    }
  }
};
