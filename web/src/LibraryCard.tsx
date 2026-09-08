import { MathText } from "../../src/remotion/MathText";
import { themeOf } from "../../src/remotion/theme";
import type { ShortSummary } from "./api";

/**
 * One row of the library.
 *
 * The card used to be the video's own opening frame, held still. That reads
 * beautifully at full width and not at all at half of one — a 1080px stage
 * scaled onto a two-up card puts the question at 9px. So the library stopped
 * being a wall of posters: one card per row, as tall as it needs to be, and
 * the question broken into the points it is made of.
 *
 * The bullets come from the model (see OUTLINE_RULE), not from splitting the
 * question here. A card in a list is scanned rather than read, and knowing
 * which clause is a condition and which is the question asked is comprehension,
 * not punctuation.
 */
export const LibraryCard: React.FC<{
  short: ShortSummary;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}> = ({ short, onOpen, onDelete, deleting }) => {
  const theme = themeOf(short.design, short.subject);
  const accent = theme.accents[0];
  const seconds = Math.round(short.durationInFrames / short.fps);
  // The summary comes off a JSON API that may be an older deploy than this
  // bundle, and a card is not worth taking the whole screen down for.
  const points = short.outline ?? [];

  return (
    <div
      className="card"
      style={{
        background: `linear-gradient(150deg, ${theme.bg} 0%, ${theme.bgDeep} 100%)`,
        fontFamily: theme.fontFamily,
        color: theme.ink,
      }}
    >
      <button className="card__open" type="button" onClick={onOpen}>
        <div className="card__head">
          <span
            className="card__unit"
            style={{ background: accent, color: theme.bgDeep }}
          >
            {short.unit || "数学"}
          </span>
          {short.subunit ? (
            <span className="card__subunit" style={{ color: accent }}>
              {short.subunit}
            </span>
          ) : null}
        </div>

        {points.length > 0 ? (
          <ul className="card__points" style={{ "--accent": accent } as React.CSSProperties}>
            {points.map((point) => (
              <li key={point}>
                <MathText text={point} />
              </li>
            ))}
          </ul>
        ) : (
          // Shorts made before the outline existed have only the question, and
          // the question is a paragraph rather than a list.
          <p className="card__topic">
            <MathText text={short.topic} />
          </p>
        )}

        <p className="card__foot" style={{ color: theme.inkDim }}>
          {seconds}秒
        </p>
      </button>
      <div className="card__actions">
        <button
          className="card__delete"
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`「${short.topic}」を削除`}
        >
          {deleting ? "削除中…" : "削除"}
        </button>
      </div>
    </div>
  );
};
