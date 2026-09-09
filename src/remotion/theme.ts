import { createContext, useContext } from "react";
import { Easing } from "remotion";

/** Device faces only: nothing here is downloaded. */
const stack = (...system: string[]) =>
  [...system.map((s) => `"${s}"`), "sans-serif"].join(", ");

/**
 * Device faces, chosen for their weights rather than their shape.
 *
 * Hiragino Maru Gothic ProN is the rounded face an iPhone has, and it used to
 * lead this list. It ships exactly one master: every weight resolves to
 * `HiraMaruProN-W4`, so the 700 and 900 asked for below were drawn as
 * *synthetic* bold — an outline the engine fattens, not a designed face — and
 * captions came out smeared. Hiragino Sans answers each request with a real
 * master (W2/W3/W4/W5/W6/W8 measured), so the weight hierarchy survives.
 * Rounded costs the weights: no rounded face on iOS has more than one.
 */
const ROUNDED = stack("Hiragino Sans", "Noto Sans CJK JP");

export type Theme = {
  bg: string;
  bgDeep: string;
  ink: string;
  inkDim: string;
  /** Cycled per scene so consecutive scenes never share an accent. */
  accents: readonly string[];
  fontFamily: string;
  /** How much the background wash shows through. */
  veil: string;
  /** Chip and card rounding — sharper reads as more formal. */
  radius: number;
  /** The motion character: slower and softer, or crisp and direct. */
  easing: (input: number) => number;
  /** A light plate keeps dark caption ink separate from the washes. */
  plate: string;
  /** A faint shadow avoids muddying dark text on the board. */
  textShadow: string;
  /** Restrains marker colours so background washes do not drown the board. */
  wash: number;
};

/** Marker colours must remain legible as text on a light board. */
const whiteboard: Theme = {
  bg: "#FBFBF9",
  bgDeep: "#E7E9EC",
  ink: "#16202E",
  inkDim: "rgba(22,32,46,0.56)",
  accents: ["#1F6FEB", "#D92D20", "#0E9F6E", "#7C3AED", "#B45309"],
  fontFamily: ROUNDED,
  veil: "rgba(255,255,255,0.5)",
  radius: 12,
  easing: Easing.bezier(0.3, 0.9, 0.2, 1),
  plate: "rgba(255,255,255,0.78)",
  textShadow: "0 2px 10px rgba(22,32,46,0.14)",
  wash: 0.3,
};

const ThemeContext = createContext<Theme>(whiteboard);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);

export const accentFor = (theme: Theme, index: number) =>
  theme.accents[index % theme.accents.length];

/** `#rrggbb` → `rgba(...)`. Gradients need explicit alpha stops: interpolating
 * a hex straight to `transparent` fades through transparent *black* in some
 * engines and leaves a dark ring. */
export const withAlpha = (hex: string, alpha: number) => {
  const int = parseInt(hex.slice(1), 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

/** 1080x1920. Key content stays inside these margins. */
export const layout = {
  width: 1080,
  height: 1920,
  safeX: 88,
  safeTop: 120,
  /**
   * The caption is anchored to the *bottom* of the frame rather than hung from
   * a fixed top, because its height varies with the line count. Measuring from
   * the bottom keeps it at a constant distance from the edge and lets it grow
   * upward into space the stage has already reserved.
   *
   * Moving the old 190px inset to 100px returns 90px to the diagram/working
   * stage. At a 390px-wide full-frame phone preview this is about 36 CSS px
   * (100 * 390 / 1080), allowing roughly a 34px home-indicator inset. This is
   * a full-frame viewing allowance, not a guarantee for every social app's
   * overlay; keeping 100px rather than going flush leaves an edge buffer.
   * The band and gap stay unchanged, so captions still have two full lines.
   */
  captionBottom: 100,
  /** Two lines at 66px/1.3 plus the plate's 20px padding, rounded up. */
  captionBandHeight: 212,
  /** Breathing room between the stage and the tallest caption. */
  captionGap: 44,
} as const;

/** Top of a full two-line caption: where the scene stage has to stop. */
export const stageBottom =
  layout.height -
  layout.captionBottom -
  layout.captionBandHeight -
  layout.captionGap;

/** Legacy manifests share the current look without rewriting stored data. */
export const themeOf = (): Theme => whiteboard;

export const shadowOf = (theme: Theme) => theme.textShadow;
export const plateOf = (theme: Theme) => theme.plate;
