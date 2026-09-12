import { MathText } from "../MathText";
import { splitMathText } from "../../mathText";

/**
 * SVG 上のラベル。数式を含むものは KaTeX で組み、本文だけなら `<text>` で描く。
 *
 * 図形の辺の長さや角の名前は `$\sqrt{7}$` `$\theta$` `$\frac{3}{2}$` のように書きたいが、SVG の
 * `<text>` は文字列しか置けない。`<foreignObject>` なら SVG 座標系のまま HTML を置けるので、
 * viewBox の拡大縮小にも `<text>` と同じに追従し、置き場所の計算を変えずに済む。HTML を SVG の
 * 外に重ねる案は、`preserveAspectRatio` で決まる実寸を測って座標を写す必要があり、fitter と同じ
 * 種類の測定に依存してしまう。
 *
 * 縁取りは `<text>` の `paint-order: stroke` に相当するものを text-shadow で作る。HTML 文字への
 * `paint-order` は engine 間で揃っておらず、8 方向の影なら Chrome でも Safari でも同じに出る。
 */
export const SvgLabel: React.FC<{
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  weight?: number;
  fontFamily?: string;
  anchor?: "start" | "middle" | "end";
  /** `<text>` の dominantBaseline。省略時は SVG の既定（baseline）。 */
  baseline?: "middle";
  opacity?: number;
  /** 背景に紛れないための縁取り。`<text>` では stroke、数式では影になる。 */
  outline?: { color: string; width: number };
  background?: string;
}> = ({ text, x, y, size, color, weight, fontFamily, anchor, baseline, opacity, outline, background }) => {
  if (!background && !splitMathText(text).some((part) => part.math)) {
    return (
      <text
        x={x}
        y={y}
        fill={color}
        fontSize={size}
        fontWeight={weight}
        fontFamily={fontFamily}
        textAnchor={anchor}
        dominantBaseline={baseline}
        opacity={opacity}
        stroke={outline?.color}
        strokeWidth={outline?.width}
        paintOrder={outline ? "stroke" : undefined}
      >
        {text}
      </text>
    );
  }

  // 箱は余裕を持って大きく取り、中身を anchor 側に寄せる。はみ出しは見せるので、箱の大きさが
  // 置き場所を決めることはない。
  const width = size * 14;
  const height = size * 3;
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  // `<text>` の y は既定では baseline で、`dominantBaseline="middle"` なら文字の中央。箱は中央で
  // 揃えるので、baseline 指定の呼び出しでは文字の高さの分だけ上へ寄せて同じ位置に見せる。
  const centerY = baseline === "middle" ? y : y - size * 0.35;
  const ring = outline
    ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
        .map(([dx, dy]) => `${dx * outline.width / 2}px ${dy * outline.width / 2}px 0 ${outline.color}`)
        .join(", ")
    : undefined;

  return (
    <foreignObject
      x={left}
      y={centerY - height / 2}
      width={width}
      height={height}
      opacity={opacity}
      style={{ overflow: "visible" }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent:
            anchor === "middle" ? "center" : anchor === "end" ? "flex-end" : "flex-start",
          fontSize: size,
          fontWeight: weight,
          fontFamily: fontFamily ?? "inherit",
          color,
          lineHeight: 1,
          whiteSpace: "nowrap",
          textShadow: ring,
        }}
      >
        {background ? (
          // 数式の分数・日本語も実際の組版幅で覆い、固定幅の下地でグラフを余分に隠さない。
          <span style={{ position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", inset: "-4px -8px", backgroundColor: background, borderRadius: 4 }} />
            <span style={{ position: "relative" }}><MathText text={text} /></span>
          </span>
        ) : <MathText text={text} />}
      </div>
    </foreignObject>
  );
};
