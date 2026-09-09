import { Fragment } from "react";
import katex from "katex";
// LibraryCard は Formula なしで MathText を読み込めるため、font もここで読み込む。
import "katex/dist/katex.min.css";
import { Fraction } from "./Fraction";

/** 先頭に付けるので、作者が自分で `\textstyle` と書けばそちらが上書きできる。 */
const DISPLAY_STYLE = "\\displaystyle ";

/**
 * 意味を変えず本文中の数式位置を決められるのは作者だけである。重ねた/escape した dollar は
 * 文字どおりに扱い、曖昧または閉じていない delimiter は問題文の一部を飲み込ませず表示に残す。
 */
export const MathText: React.FC<{ text: string }> = ({ text }) => {
  if (!text.includes("$")) return <LegacyMathText text={text} />;

  const delimiters = [...text.matchAll(/\\[\s\S]|\$+/g)]
    .filter((match) => match[0].startsWith("$"));
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < delimiters.length - 1; i++) {
    const open = delimiters[i];
    const close = delimiters[i + 1];
    if (open[0] !== "$" || close[0] !== "$") continue;
    const tex = text.slice(open.index + 1, close.index);
    i++;
    if (!tex.trim()) continue;

    parts.push(text.slice(cursor, open.index));
    try {
      const html = katex.renderToString(DISPLAY_STYLE + tex, {
        // inline にして、数式を独立した中央揃え block にせず文中へ置く。`displayMode` は
        // *style* も選び、text style では極限の条件が `lim` の下でなく横に来て分数も小さくなる。
        // `\displaystyle` なら block を作らずにその style を要求でき、横の解答と同じ組版になる。
        displayMode: false,
        throwOnError: false,
        output: "html",
      });
      parts.push(<span key={open.index} dangerouslySetInnerHTML={{ __html: html }} />);
    } catch {
      // 想定外の renderer 失敗時も、source は escape した本文として残さなければならない。
      parts.push(text.slice(open.index, close.index + 1));
    }
    cursor = close.index + 1;
  }
  parts.push(text.slice(cursor));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
};

// 以下の手配置 branch は $ delimiter のない既存データ用の fallback。metrics を維持すれば、
// すでに生成済みの動画の見た目を保てる。

/**
 * `^` または `_` の後に、braced group、符号付き数値、または1文字が続く形。
 *
 * brace なしの形は実際の入力に合わせる。`x^2` と `a_n` は見たままの意味で、`x^2y` は
 * 2 で止まる。これは LaTeX と同じ読み方である。数列の index は `a_{n+1}`、`S_{2n}` の
 * ように式であることが多いため、下付きでは brace も頻繁に必要になる。
 *
 * "Letter" には Greek と ∞ も含める必要がある。最も必要になる積分の範囲で、`∫_0^π` が
 * 下限だけを設定し、`^π` を2つの文字どおりの文字として行内に残してしまっていたためである。
 */
const SCRIPT_VALUE = "\\{[^}]{1,12}\\}|[-+]?\\d+|[A-Za-zΑ-ω∞]";
const SCRIPT = new RegExp(`([_^])(${SCRIPT_VALUE})`, "g");

/** `lim` とその下に置く条件を、1単位として扱う。 */
const LIMIT = new RegExp(`lim_(${SCRIPT_VALUE})`, "g");

/**
 * 意図的に小さくした分数構文。プレーンテキストだけでは `3√19/4` が `(3√19)/4` なのか
 * `3√(19/4)` なのか分からず、そもそも数式でないかもしれない（`9/8に公開`）。そのため
 * generator は2つの境界を明示する。
 *
 * 入れ子の分数を含め、各半分の内側にある brace は文字どおり残す。`SCRIPT` と同じ浅い
 * 割り切りであり、この本文 renderer が不完全な LaTeX parser になるのを防ぐ。
 */
const FRACTION = /\\frac\{([^{}]*)\}\{([^{}]*)\}/g;

/**
 * 組版器が周囲の文字より高く描く演算子。本文の1emでは `∫` は x-height をわずかに超える
 * 細い線となり、横の解答にある同じ記号の見た目ではない。KaTeX はそれ専用の display-size
 * glyph を使う。
 */
const OPERATORS = "∫∬∭∮∑Σ∏";
const LARGE_OPERATOR = new RegExp(`[${OPERATORS}]`, "g");

/**
 * 1.5em は layout に代償を払わずに描ける glyph の最大サイズである。
 *
 * inline box は `font-size × line-height` を行へ寄与するので、ここでの0.68ならこの span の
 * 寄与は1.02emに収まる。これは problem card と library card がすでに使う line-height 内であり、
 * 演算子を大きくしても積み上げ分数のように行を押し広げない理由である。offset で背の高い
 * glyph を本文本来の baseline へ戻す。
 */
const OPERATOR_STYLE: React.CSSProperties = {
  fontSize: "1.5em",
  lineHeight: 0.68,
  verticalAlign: "-0.16em",
  // glyph 自身の side bearing も一緒に拡大され、範囲の前に空白と読めるだけの gap ができる。
  // つまり `∫ ₀^π` となり、範囲が演算子に接しない。拡大後の em の10分の1を戻すと、衝突させず
  // に gap を詰められる。
  marginRight: "-0.1em",
};

/**
 * 組版どおり、条件を下に置いた `lim`。
 *
 * 最初は絶対配置の subscript にしたが、行が伸びなかった。条件は `lim` の glyph 内側7.3pxに
 * 入り、逃がす場所がなかった。line-height 1.55 の18px行では glyph box 下の leading は3.6pxだが、
 * 0.55em の条件には9.9pxが必要である。行外への描画が読めなくする原因だったので、代わりに
 * flow で layout して行を必要なだけ伸ばす。card の fitter がそれを吸収でき、数式にはその余地を
 * 与える価値がある。
 */
const LIMIT_STYLE: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  verticalAlign: "middle",
  lineHeight: 1.04,
  margin: "0 0.14em",
};

/** `n→∞` のように広い条件が単位の幅を決め、`lim` はその上で中央に置く。 */
const LIMIT_CONDITION_STYLE: React.CSSProperties = {
  fontSize: "0.55em",
  lineHeight: 1.04,
  whiteSpace: "nowrap",
};

/**
 * 旧 question text は `\\frac` を受け入れており、ときどき LaTeX が漏れ出すのは避けられない。
 * この renderer に収まるプレーンな記号の command だけを残す。それ以外は slash だけを除く。
 * 未知の command を消せば問題文の一部を黙って捨ててしまい、slash を見せるよりは読める名前を
 * 本文として残すほうがよいからである。
 */
const normaliseCommands = (text: string) =>
  text
    .replace(/\\sqrt\{([^{}]*)\}/g, "√$1")
    .replace(/\\(lim|sum|prod|int|to|infty|theta|pi|le|ge|times|cdot)/g, (_, command: string) => ({
      lim: "lim",
      sum: "∑",
      prod: "∏",
      int: "∫",
      to: "→",
      infty: "∞",
      theta: "θ",
      pi: "π",
      le: "≦",
      ge: "≧",
      times: "×",
      cdot: "・",
    })[command]!)
    .replace(/\\(?!frac(?:\{|$))/g, "");

const LegacyMathText: React.FC<{ text: string }> = ({ text }) => {
  const source = normaliseCommands(text);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  const marks = [
    ...source.matchAll(LIMIT),
    ...source.matchAll(SCRIPT),
    ...source.matchAll(FRACTION),
    ...source.matchAll(LARGE_OPERATOR),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const match of marks) {
    const at = match.index ?? 0;
    // 1つの文字列に対する2つの pattern は重なり得るため、先に現れた方を採用する。
    if (at < cursor) {
      continue;
    }
    if (at > cursor) {
      parts.push(source.slice(cursor, at));
    }
    if (match[0].startsWith("lim_")) {
      const condition = match[1];
      parts.push(
        <span key={at} style={LIMIT_STYLE}>
          <span>lim</span>
          <span style={LIMIT_CONDITION_STYLE}>
            {condition.startsWith("{") ? condition.slice(1, -1) : condition}
          </span>
        </span>,
      );
      cursor = at + match[0].length;
      continue;
    }
    if (OPERATORS.includes(match[0])) {
      parts.push(
        <span key={at} style={OPERATOR_STYLE}>
          {match[0]}
        </span>,
      );
      cursor = at + 1;
      continue;
    }
    if (match[0].startsWith("\\frac{")) {
      parts.push(
        <Fraction
          key={at}
          numerator={<LegacyMathText text={match[1]} />}
          denominator={<LegacyMathText text={match[2]} />}
        />,
      );
      cursor = at + match[0].length;
      continue;
    }
    const [whole, marker, raw] = match;
    const Tag = marker === "_" ? "sub" : "sup";
    parts.push(
      <Tag
        key={at}
        style={{
          fontSize: "0.62em",
          lineHeight: 1,
          verticalAlign: marker === "_" ? "sub" : "super",
        }}
      >
        {raw.startsWith("{") ? raw.slice(1, -1) : raw}
      </Tag>,
    );
    cursor = at + whole.length;
  }
  parts.push(source.slice(cursor));

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
};
