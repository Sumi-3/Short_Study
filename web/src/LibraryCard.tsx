import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  // The summary comes off a JSON API that may be an older deploy than this
  // bundle, and a card is not worth taking the whole screen down for.
  const points = short.outline ?? [];
  const menuItems = [
    {
      id: "delete",
      label: deleting ? "削除中…" : "削除",
      ariaLabel: `「${short.topic}」を削除`,
      disabled: deleting,
      danger: true,
      onSelect: onDelete,
    },
  ];

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeIfOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    const closeOnScroll = () => setMenuOpen(false);

    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    // A menu anchored to a card should not float away from that card while a
    // reader is moving through the library.
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [menuOpen]);

  return (
    <div
      className="card"
      style={{
        background: `linear-gradient(150deg, ${theme.bg} 0%, ${theme.bgDeep} 100%)`,
        fontFamily: theme.fontFamily,
        color: theme.ink,
        "--card-menu-accent": accent,
        "--card-menu-deep": theme.bgDeep,
        "--card-menu-ink": theme.ink,
        "--card-menu-ink-dim": theme.inkDim,
      } as React.CSSProperties}
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
      <div className="card__menu" ref={menu}>
        <button
          className="card__menu-trigger"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          aria-label={`「${short.topic}」の操作メニュー`}
          aria-expanded={menuOpen}
          aria-controls={`card-menu-${short.slug}`}
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="card__menu-popover" id={`card-menu-${short.slug}`} role="menu">
            {menuItems.map((item) => (
              <button
                className={`card__menu-item${item.danger ? " card__menu-item--danger" : ""}`}
                key={item.id}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  // Closed before the item runs: `onSelect` opens a native
                  // confirmation, and a menu still standing behind a dialog the
                  // reader has just dismissed is one more thing to put away.
                  setMenuOpen(false);
                  item.onSelect();
                }}
                disabled={item.disabled}
                aria-label={item.ariaLabel}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
