import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { layout, shadowOf, useTheme, withAlpha } from "./theme";
import { useFitToWidth } from "./useFitToWidth";
import type { SceneVisual } from "../types";

type Data = Extract<SceneVisual, { kind: "table" }>;

/** Cells that are a direction rather than a value are set larger. */
const ARROWS = new Set(["↗", "↘", "→", "↑", "↓", "⤴", "⤵"]);

/**
 * A table. The one that matters is the 増減表 — the sign of f′ over each
 * interval and what f does there — which is the backbone of 数III 微分法 and
 * has no other faithful representation: it is a grid, not a list and not a
 * graph.
 *
 * It builds row by row, because that is the order it is filled in: first the
 * critical points, then the signs of the derivative, then the behaviour they
 * imply. Reading it afterwards happens column by column, and a table that
 * arrived row by row still reads that way.
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

  // A table should fill the frame, so this is allowed to grow as well as
  // shrink. How far it may grow is bounded by the row count rather than by
  // measurement: rows stack downward, and a tall table that doubled in width
  // would run off the bottom of the stage.
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
                  // Cells within a row still arrive left to right, so a long
                  // row reads as being written rather than stamped.
                  const cell = start + columnIndex * 0.06 * fps;
                  const appear = interpolate(
                    frame,
                    [cell, cell + 0.3 * fps],
                    [0, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: theme.easing,
                    },
                  );
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
                      {text}
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
            opacity: interpolate(
              frame,
              [(0.8 + rows * 0.55) * fps, (1.4 + rows * 0.55) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        >
          {data.caption}
        </div>
      ) : null}
    </div>
  );
};
