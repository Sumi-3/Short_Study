import { useCurrentFrame, useVideoConfig } from "remotion";
import { clamped } from "./clamped";
import { layout, shadowOf, useTheme, withAlpha } from "./theme";
import { useFitToWidth } from "./useFitToWidth";
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

  const columns = Math.max(...data.rows.map((row) => row.length));
  const rows = data.rows.length;

  // table は frame を満たすべきなので、縮小だけでなく拡大も許す。拡大上限は測定ではなく row 数で
  // 決める。row は下へ積まれ、背の高い table の幅を2倍にすると stage 下端からはみ出すためである。
  const headroom = rows <= 3 ? 1.9 : rows === 4 ? 1.6 : 1.3;
  const { register, fit } = useFitToWidth(
    layout.width - layout.safeX * 2,
    headroom,
  );

  const base = columns >= 7 ? 36 : columns >= 5 ? 44 : 52;
  const fontSize = base * fit;
  const pad = `${Math.round(16 * fit)}px ${Math.round(24 * fit)}px`;

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
      <table
        ref={register(0)}
        style={{
          width: "max-content",
          borderCollapse: "collapse",
          fontFamily: theme.fontFamily,
          fontSize,
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
                        padding: pad,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        opacity: appear,
                        fontWeight: isHeader || isLabel ? 900 : 700,
                        fontSize: arrow ? fontSize * 1.3 : fontSize,
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
