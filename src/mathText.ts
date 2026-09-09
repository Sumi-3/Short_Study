/** 保存時と表示時で境界が変わると、字幕や図だけに生の TeX が残るため共用する。 */
export type MathPart = { text: string; math: boolean; start: number; end: number };

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。、「」『』]/u;
const EVIDENCE = /\\[a-zA-Z]+|[\^_]\s*(?:\{|[a-zA-Z0-9+-])/;
const RUN = /(?:\\[a-zA-Z]+|\\[^\r\n]|[a-zA-Z0-9Α-ω∞≤≥≠±×÷−√∑∫∈∪∩→←↔=+*/^_{}()[\]|.,:;!<> \t-])+/g;

const escaped = (text: string, at: number) => {
  let slashes = 0;
  while (at > 0 && text[--at] === "\\") slashes++;
  return slashes % 2 === 1;
};

/** 日付や単位には数式の証拠がないので触らない。日本語は明示区切りの中でも本文へ戻す。 */
const runs = (text: string, offset: number, explicit: boolean): MathPart[] => {
  const prose = /\\(?:text|textrm|textsf|textbf|textit|mbox)\{([^{}]*)\}/g;
  for (const match of text.matchAll(prose)) {
    if (!JAPANESE.test(match[1])) continue;
    return [
      ...runs(text.slice(0, match.index), offset, explicit),
      { text: match[1], math: false, start: offset + match.index, end: offset + match.index + match[0].length },
      ...runs(text.slice(match.index + match[0].length), offset + match.index + match[0].length, explicit),
    ];
  }
  const parts: MathPart[] = [];
  let cursor = 0;
  // 明示された式は aligned の & や改行を含めて保つ。裸の式より狭い文字集合で切ると構文を壊す。
  const pattern = explicit ? /[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。、「」『』]+/gu : RUN;
  for (const match of text.matchAll(pattern)) {
    const value = match[0].trim();
    if (!value || (!explicit && !EVIDENCE.test(value))) continue;
    // 閉じ忘れた $ や文字として escape された $ の中を再び囲むと、正規化のたびに $ が増える。
    if (!explicit && (text[match.index - 1] === "$" || value.includes("\\$"))) continue;
    // 正規表現の escape 分岐が日本語を拾った場合も、KaTeX へは絶対に渡さない。
    if (JAPANESE.test(value)) {
      const pieces = value.split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。、「」『』]+)/u);
      let position = match.index + match[0].indexOf(value);
      if (position > cursor) parts.push({ text: text.slice(cursor, position), math: false, start: offset + cursor, end: offset + position });
      for (const piece of pieces) {
        if (piece) parts.push(...(JAPANESE.test(piece)
          ? [{ text: piece, math: false, start: offset + position, end: offset + position + piece.length }]
          : runs(piece, offset + position, explicit)));
        position += piece.length;
      }
      cursor = position;
      continue;
    }
    const start = match.index + match[0].indexOf(value);
    const end = start + value.length;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), math: false, start: offset + cursor, end: offset + start });
    parts.push({ text: value, math: true, start: offset + start, end: offset + end });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), math: false, start: offset + cursor, end: offset + text.length });
  return parts;
};

/** formula は式専用フィールドだけに使う。本文で x や日付を勝手に数式にしないためである。 */
export const splitMathText = (text: string, formula = false): MathPart[] => {
  const parts: MathPart[] = [];
  let cursor = 0;
  const delimiters = /\$+|\\[()[\]]/g;
  let match: RegExpExecArray | null;
  while ((match = delimiters.exec(text)) !== null) {
    const start = match.index;
    if (start < cursor || escaped(text, start)) continue;
    const open = match[0];
    const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
    if (!["$", "$$", "\\(", "\\["].includes(open)) continue;
    let end = text.indexOf(close, start + open.length);
    while (end !== -1 && (escaped(text, end) ||
      (close === "$$" && (text[end - 1] === "$" || text[end + close.length] === "$")))) {
      end = text.indexOf(close, end + close.length);
    }
    if (end === -1) continue;
    const body = text.slice(start + open.length, end);
    if (!body.trim() || [...body].some((char, at) => char === "$" && !escaped(body, at))) continue;
    parts.push(...runs(text.slice(cursor, start), cursor, formula));
    const inner = runs(body, start + open.length, true);
    // 字幕の結合は区切り文字も含む元の範囲を必要とする。
    if (inner.length === 1 && inner[0].math) {
      parts.push({ ...inner[0], start, end: end + close.length });
    } else {
      parts.push(...inner);
    }
    cursor = end + close.length;
    // `$a_n$$b_n$` の中央は閉じる $ と開く $。二つ目から走査を再開し、$$ と取り違えない。
    delimiters.lastIndex = cursor;
  }
  parts.push(...runs(text.slice(cursor), cursor, formula));
  return parts;
};

export const normalizeMathText = (text: string) =>
  splitMathText(text).map((part) => part.math ? `$${part.text}$` : part.text).join("");

/** 未知の命令を捨てたり閉じ括弧を補ったりすると式の意味が変わるので、失敗範囲を保つ。 */
export const texAtoms = (tex: string): string[] => {
  const atoms: string[] = [];
  let at = 0;
  const group = () => {
    const close = tex[at] === "{" ? "}" : "]";
    const open = tex[at++];
    let depth = 1;
    while (at < tex.length && depth) {
      const c = tex[at++];
      if (c === "\\") at++;
      else if (c === open) depth++;
      else if (c === close) depth--;
    }
  };
  while (at < tex.length) {
    const start = at;
    if (tex[at] === "\\") {
      at++;
      if (/[a-zA-Z]/.test(tex[at] ?? "")) while (at < tex.length && /[a-zA-Z]/.test(tex[at])) at++;
      else if (at < tex.length) at++;
    } else if (tex[at] === "{") group();
    else at++;
    while (at < tex.length) {
      const beforeSpace = at;
      while (/[ \t]/.test(tex[at] ?? "")) at++;
      if (tex[at] === "{" || tex[at] === "[") group();
      else if (tex[at] === "^" || tex[at] === "_") {
        at++;
        if (tex[at] === "{") group();
        else if (at < tex.length) at++;
      } else { at = beforeSpace; break; }
    }
    atoms.push(tex.slice(start, at));
  }
  return atoms;
};
