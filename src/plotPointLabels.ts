import { normalizeMathText } from "./mathText.js";

/**
 * API の grammar を増やさず、座標・補助線を個別に指定するため label の接頭辞を使う。
 * 未指定の旧ラベルと未知・重複マーカーは本文として残し、通常の角括弧を失わない。
 */
export const parsePlotPointLabel = (label: string): {
  text: string;
  coord: boolean;
  guide: boolean;
} => {
  let text = label;
  let coord = false;
  let guide = false;
  for (let i = 0; i < 2; i++) {
    const match = /^\s*\[(coord|guide)\]\s*([\s\S]*)$/.exec(text);
    if (!match) break;
    if (match[1] === "coord") {
      if (coord) break;
      coord = true;
    } else {
      if (guide) break;
      guide = true;
    }
    text = match[2];
  }
  return { text, coord, guide };
};

/** 裸の数式を正規化するとき、接頭辞まで LaTeX の角括弧として取り込ませない。 */
export const normalizePlotPointLabel = (label: string): string => {
  const parsed = parsePlotPointLabel(label);
  return label.slice(0, label.length - parsed.text.length) + normalizeMathText(parsed.text);
};
