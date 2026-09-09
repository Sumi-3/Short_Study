import { useEffect, useRef, useState } from "react";
import { MathText } from "../../src/remotion/MathText";
import { themeOf } from "../../src/remotion/theme";
import type { ShortSummary } from "./api";

/**
 * library の一行。
 *
 * card は以前、動画自身の開始フレームを静止させたものだった。全幅なら美しく読めるが、
 * 半分の幅ではまったく読めない。1080px の stage を二列 card に縮めると問題文は 9px に
 * なる。そこで library は poster の壁をやめ、一行一 card として必要な高さを確保し、
 * 問題を構成する points に分けた。
 *
 * bullet はここで問題文を分割するのでなく model から得る（`OUTLINE_RULE` 参照）。
 * 一覧中の card は熟読でなく走査される。どの節が条件でどれが問われていることかを
 * 知るのは、句読点の問題ではなく理解に関わるからである。
 */
export const LibraryCard: React.FC<{
  short: ShortSummary;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}> = ({ short, onOpen, onDelete, deleting }) => {
  const theme = themeOf();
  const accent = theme.accents[0];
  const seconds = Math.round(short.durationInFrames / short.fps);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  // summary を返す JSON API はこの bundle より古い deploy かもしれず、そのために
  // card 一枚で画面全体を落とす価値はない。
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
    // card に紐づく menu が、reader が library を移動する間に card から離れて浮かない
    // ようにする。
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
          // outline 導入前に作られた short には問題文しかなく、それは list ではなく
          // paragraph として扱う。
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
                  // item の実行前に閉じる。`onSelect` は native confirmation を開き、
                  // reader が閉じた dialog の背後に menu まで残ると、片付けるものが一つ
                  // 増えるためである。
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
