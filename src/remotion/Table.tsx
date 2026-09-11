import { useLayoutEffect, useRef, useState } from "react";
import { useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { layout, shadowOf, useTheme, withAlpha } from "./theme";
import { MathText } from "./MathText";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "table" }>;

/** 値ではなく方向を表す cell は大きく組む。 */
const ARROWS = new Set(["↗", "↘", "→", "↑", "↓", "⤴", "⤵"]);

/**
 * table。重要なのは増減表で、各区間における f′ の符号とそこでの f の振る舞いを示す。これは
 * 数III 微分法の骨格であり、忠実な表現は grid だけで、list でも graph でもない。
 *
 * 記入順に row ごとに組み立てる。まず critical point、次に derivative の符号、最後にそこから
 * 分かる振る舞いとなる。読み返すときは column ごとであり、row ごとに現れた table もその順で読める。
 */
export const Table: React.FC<{ data: Data; accent: string }> = ({
  data,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const tableRef = useRef<HTMLTableElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("fit table to width"));

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => {
      // offset 寸法は table 自身と Player の scale を含まない。適用後の幅を割り戻すと、padding や
      // 罫線の丸めを再び倍率へ戻して振動するため、等倍の表から毎回同じ倍率を求める。
      const width = table.offsetWidth;
      const height = table.offsetHeight;
      if (width === 0 || height === 0) return;
      setSize((old) => old.width === width && old.height === height ? old : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    measure();
    let active = true;
    void document.fonts.ready.then(() => {
      if (!active) return;
      measure();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => continueRender(handle)),
      );
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [continueRender, handle]);

  const columns = Math.max(...data.rows.map((row) => row.length));
  const rows = data.rows.length;

  // table は frame を満たすべきなので、縮小だけでなく拡大も許す。拡大上限は測定ではなく row 数で
  // 決める。row は下へ積まれ、背の高い table の幅を2倍にすると stage 下端からはみ出すためである。
  const headroom = rows <= 3 ? 1.9 : rows === 4 ? 1.6 : 1.3;
  const fit = size.width > 0
    ? Math.min(headroom, (layout.width - layout.safeX * 2) / size.width)
    : 1;

  const base = columns >= 7 ? 36 : columns >= 5 ? 44 : 52;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        height: "100%",
      }}
    >
      <div style={{ width: size.width * fit, height: size.height * fit, flexShrink: 0 }}>
        <table
          ref={tableRef}
          style={{
            width: "max-content",
            borderCollapse: "collapse",
            fontFamily: theme.fontFamily,
            fontSize: base,
            scale: fit,
            transformOrigin: "top left",
            color: theme.ink,
            textShadow: shadowOf(theme),
          }}
        >
          <tbody>
            {data.rows.map((row, rowIndex) => {
              const start = (0.8 + rowIndex * 0.55) * fps;
              const isHeader = rowIndex === 0;

              return (
                <tr key={rowIndex}>
                  {Array.from({ length: columns }, (_, columnIndex) => {
                    const text = row[columnIndex] ?? "";
                    // row 内では引き続き左から右へ現れ、長い row も押印ではなく書き込まれたように読める。
                    const cell = start + columnIndex * 0.06 * fps;
                    const appear = clamped(
                      frame,
                      [cell, cell + 0.3 * fps],
                      [0, 1], theme.easing);
                    const isLabel = columnIndex === 0;
                    const arrow = ARROWS.has(text.trim());

                    return (
                      <td
                        key={columnIndex}
                        style={{
                          padding: "16px 24px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                          opacity: appear,
                          fontWeight: isHeader || isLabel ? 900 : 700,
                          fontSize: arrow ? base * 1.3 : base,
                          lineHeight: 1.2,
                          color: isHeader || isLabel ? accent : theme.ink,
                          backgroundColor:
                            isHeader || isLabel
                              ? withAlpha(accent, 0.12)
                              : "transparent",
                          borderBottom: `2px solid ${withAlpha(accent, isHeader ? 0.85 : 0.28)}`,
                          borderRight:
                            isLabel && columns > 1
                              ? `2px solid ${withAlpha(accent, 0.85)}`
                              : `2px solid ${withAlpha(accent, 0.18)}`,
                        }}
                      >
                        <MathText text={text} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.caption ? (
        <div
          style={{
            fontFamily: theme.fontFamily,
            fontWeight: 700,
            fontSize: 38,
            color: accent,
            textShadow: shadowOf(theme),
            opacity: clamped(
              frame,
              [(0.8 + rows * 0.55) * fps, (1.4 + rows * 0.55) * fps],
              [0, 1]),
          }}
        >
          <MathText text={data.caption} />
        </div>
      ) : null}
    </div>
  );
};
