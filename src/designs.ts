/**
 * Look-and-feel presets, picked per video on the create screen.
 *
 * `subject` used to be the only thing steering the palette, and with the app
 * gone maths-only that left every short looking identical. A design is the same
 * set of knobs the themes already had — colours, typeface family, corner
 * radius, pacing — named so it can be chosen rather than inferred, and stored
 * on the manifest so a short keeps the look it was made with.
 */
export type DesignId =
  | "indigo"
  | "midnight"
  | "chalk"
  | "plum"
  | "forest"
  | "ember";

export type DesignMeta = {
  id: DesignId;
  label: string;
  /** Shown as the swatch on the picker. */
  swatch: string;
};

export const DESIGNS: readonly DesignMeta[] = [
  { id: "indigo", label: "藍", swatch: "#4CD8FF" },
  { id: "midnight", label: "深夜", swatch: "#8AA4FF" },
  { id: "chalk", label: "黒板", swatch: "#F6E7C1" },
  { id: "plum", label: "梅", swatch: "#FF7AC8" },
  { id: "forest", label: "深緑", swatch: "#5CFFB0" },
  { id: "ember", label: "熾火", swatch: "#FFA24C" },
];

export const DEFAULT_DESIGN: DesignId = "indigo";

export const isDesignId = (value: unknown): value is DesignId =>
  typeof value === "string" && DESIGNS.some((design) => design.id === value);
