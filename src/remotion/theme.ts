import { createContext, useContext } from "react";
import { Easing } from "remotion";
import type { DesignId } from "../designs.js";
import { fontFamily as zenMaru, loadFont as loadRounded } from "@remotion/google-fonts/ZenMaruGothic";

/**
 * Only the renderer downloads webfonts.
 *
 * `loadFont()` eagerly fetches every unicode range of the japanese subset —
 * around 120 files per weight, each behind its own `delayRender()` — because
 * the renderer must have every glyph in memory before it captures a frame. A
 * phone browser does not: it already ships Japanese faces, and the stack below
 * falls through to them.
 *
 * `__STUDY_WEB__` is defined by web/vite.config.ts and undefined in the
 * Remotion bundle, so this is decided at build time rather than by sniffing
 * globals whose timing relative to module evaluation is not guaranteed.
 */
const isWebPlayerBuild = typeof __STUDY_WEB__ !== "undefined" && __STUDY_WEB__;

if (!isWebPlayerBuild) {
  loadRounded("normal", {
    weights: ["700", "900"],
    subsets: ["japanese", "latin"],
    ignoreTooManyRequestsWarning: true,
  });
}

/** Device faces first in the browser; the webfont is what the renderer uses. */
const stack = (webfont: string, ...system: string[]) =>
  [`"${webfont}"`, ...system.map((s) => `"${s}"`), "sans-serif"].join(", ");

/**
 * The one face, whatever design is picked.
 *
 * The designs used to reach for a sans, a serif and this, which made the
 * typeface a second thing the picker decided without saying so — 「黒板」 came
 * out in Mincho because it was a blackboard, not because anyone chose Mincho.
 * A rounded gothic is the one that suits every design here: it is the face a
 * Japanese textbook aimed at students is set in, and it stays legible at the
 * size a question is shown on a two-up card.
 *
 * The fallbacks matter more than usual, because the browser never downloads
 * the webfont (see above) — on a phone what actually paints is ヒラギノ丸ゴ.
 */
const ROUNDED = stack(zenMaru, "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans CJK JP");

export const SUBJECTS = ["history", "math", "science", "language", "general"] as const;
export type Subject = (typeof SUBJECTS)[number];

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
  /** Multiplies every entrance duration. */
  speed: number;
  /*
   * The three below exist for `whiteboard`. Every other theme is light ink on
   * a dark ground, and they all share one drop shadow, one caption plate and
   * full-strength background washes. A light theme has to invert all three: a
   * dark blur under dark text is a smudge, a near-black plate swallows the
   * caption, and a 55%-alpha wash drowns white. Optional, so the dark themes
   * stay exactly as they were written.
   */
  /** Behind the caption text. Defaults to `DARK_PLATE`. */
  plate?: string;
  /** Under every piece of text. Defaults to `textShadow`. */
  textShadow?: string;
  /** Scales the background wash's opacity. Defaults to 1. */
  wash?: number;
};

const SOFT = Easing.bezier(0.16, 1, 0.3, 1);
const CRISP = Easing.bezier(0.3, 0.9, 0.2, 1);
const SPRINGY = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * Named looks the create screen offers, keyed by DesignId.
 *
 * They vary the same fields the subject themes do. `indigo` is the maths theme
 * unchanged, so a short made before designs existed keeps exactly its look.
 */
export const designs: Record<DesignId, Theme> = {
  indigo: {
    bg: "#0C1B36",
    bgDeep: "#050B1A",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.6)",
    accents: ["#4CD8FF", "#FFD84D", "#FF63A5", "#5CFFB0", "#B98CFF"],
    fontFamily: ROUNDED,
    veil: "rgba(4,9,20,0.44)",
    radius: 10,
    easing: CRISP,
    speed: 0.9,
  },
  /** Cooler and quieter: wider corners, softer motion. */
  midnight: {
    bg: "#141A3A",
    bgDeep: "#070819",
    ink: "#F3F5FF",
    inkDim: "rgba(243,245,255,0.58)",
    accents: ["#8AA4FF", "#7BE0FF", "#C6A0FF", "#FFC97A", "#7CFFD4"],
    fontFamily: ROUNDED,
    veil: "rgba(7,8,25,0.46)",
    radius: 22,
    easing: SOFT,
    speed: 0.8,
  },
  /** Blackboard: warm chalk on deep green, serif, deliberate. */
  chalk: {
    bg: "#183A2E",
    bgDeep: "#08150F",
    ink: "#F6E7C1",
    inkDim: "rgba(246,231,193,0.6)",
    accents: ["#F6E7C1", "#9BE8B4", "#FFD08A", "#8FD8FF", "#FFA8A8"],
    fontFamily: ROUNDED,
    veil: "rgba(8,21,15,0.5)",
    radius: 4,
    easing: SOFT,
    speed: 0.75,
  },
  plum: {
    bg: "#2A0E33",
    bgDeep: "#12041A",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.6)",
    accents: ["#FF7AC8", "#FFD84D", "#8AF0FF", "#C6A0FF", "#FF9E7A"],
    fontFamily: ROUNDED,
    veil: "rgba(18,4,26,0.44)",
    radius: 26,
    easing: SPRINGY,
    speed: 0.95,
  },
  forest: {
    bg: "#0C2A26",
    bgDeep: "#04120F",
    ink: "#EAFFF7",
    inkDim: "rgba(234,255,247,0.58)",
    accents: ["#5CFFB0", "#7BE0FF", "#FFE27A", "#B8FF7A", "#7AFFE0"],
    fontFamily: ROUNDED,
    veil: "rgba(4,18,15,0.44)",
    radius: 18,
    easing: SPRINGY,
    speed: 0.9,
  },
  /*
   * The one light design: marker on a classroom whiteboard.
   *
   * Accents are real marker colours rather than the neon the dark themes use,
   * because here an accent has to stay legible *as text* on white — `#4CD8FF`
   * simply disappears. That makes them strong as background washes too, hence
   * `wash`.
   */
  whiteboard: {
    bg: "#FBFBF9",
    bgDeep: "#E7E9EC",
    ink: "#16202E",
    inkDim: "rgba(22,32,46,0.56)",
    accents: ["#1F6FEB", "#D92D20", "#0E9F6E", "#7C3AED", "#B45309"],
    fontFamily: ROUNDED,
    veil: "rgba(255,255,255,0.5)",
    radius: 12,
    easing: CRISP,
    speed: 0.9,
    plate: "rgba(255,255,255,0.78)",
    textShadow: "0 2px 10px rgba(22,32,46,0.14)",
    wash: 0.3,
  },
  /** Warm and high-contrast, for something that should feel urgent. */
  ember: {
    bg: "#2E1207",
    bgDeep: "#150602",
    ink: "#FFF4EA",
    inkDim: "rgba(255,244,234,0.58)",
    accents: ["#FFA24C", "#FFD84D", "#FF6B6B", "#FFC2A0", "#7BE0FF"],
    fontFamily: ROUNDED,
    veil: "rgba(21,6,2,0.46)",
    radius: 8,
    easing: CRISP,
    speed: 1,
  },
};

export const themes: Record<Subject, Theme> = {
  /** Sepia and ink: quieter, slower, a printed-page feel. */
  history: {
    bg: "#241705",
    bgDeep: "#120B02",
    ink: "#FFF6E6",
    inkDim: "rgba(255,246,230,0.62)",
    accents: ["#F0B93B", "#E0653A", "#8FA95A", "#79A6C0", "#D98F6A"],
    fontFamily: ROUNDED,
    veil: "rgba(14,8,1,0.46)",
    radius: 8,
    easing: SOFT,
    speed: 1.15,
  },
  /** Blueprint blues: high contrast, direct motion, nothing decorative. */
  math: {
    bg: "#0C1B36",
    bgDeep: "#050B1A",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.6)",
    accents: ["#4CD8FF", "#FFD84D", "#FF63A5", "#5CFFB0", "#B98CFF"],
    fontFamily: ROUNDED,
    veil: "rgba(4,9,20,0.44)",
    radius: 10,
    easing: CRISP,
    speed: 0.9,
  },
  /** Lab greens: rounded type, a slight overshoot, energetic. */
  science: {
    bg: "#072A26",
    bgDeep: "#031412",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.6)",
    accents: ["#00E5C7", "#A6FF4D", "#FFA02B", "#66C7FF", "#C46BFF"],
    fontFamily: ROUNDED,
    veil: "rgba(2,16,14,0.42)",
    radius: 22,
    easing: SPRINGY,
    speed: 1,
  },
  /** Warm violets for language and literature. */
  language: {
    bg: "#241041",
    bgDeep: "#100420",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.6)",
    accents: ["#FF7FC0", "#FFD93D", "#7FE6FF", "#B4FF7F", "#FF9E6B"],
    fontFamily: ROUNDED,
    veil: "rgba(12,3,24,0.44)",
    radius: 18,
    easing: SOFT,
    speed: 1,
  },
  /** The original high-chroma pop, for anything unclassified. */
  general: {
    bg: "#150438",
    bgDeep: "#0B0121",
    ink: "#FFFFFF",
    inkDim: "rgba(255,255,255,0.62)",
    accents: ["#FFE500", "#00E5FF", "#FF2D95", "#4DFF7C", "#FF8A00"],
    fontFamily: ROUNDED,
    veil: "rgba(10,1,28,0.42)",
    radius: 999,
    easing: SOFT,
    speed: 1,
  },
};

const ThemeContext = createContext<Theme>(themes.general);
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
   */
  captionBottom: 190,
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

/** Keeps white text legible over any accent-coloured shape behind it. */
export const textShadow = "0 8px 32px rgba(0,0,0,0.55)";

/** One plate behind the whole caption block; per-token plates leave seams. */
export const DARK_PLATE = "rgba(9,1,26,0.66)";

export const shadowOf = (theme: Theme) => theme.textShadow ?? textShadow;
export const plateOf = (theme: Theme) => theme.plate ?? DARK_PLATE;
