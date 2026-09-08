import { useMemo, useState } from "react";
import { MATH_TAXONOMY, splitUnit } from "../../src/curriculum";
import { LibraryCard } from "./LibraryCard";
import type { ShortSummary } from "./api";

const ALL = "すべて";

/** One horizontal row of chips. `null` is the unfiltered choice. */
const Bar: React.FC<{
  label: string;
  options: string[];
  value: string | null;
  onPick: (next: string | null) => void;
}> = ({ label, options, value, onPick }) => (
  <div className="bar">
    <span className="bar__label">{label}</span>
    <div className="bar__chips">
      <button
        className={`chip${value === null ? " is-on" : ""}`}
        onClick={() => onPick(null)}
      >
        {ALL}
      </button>
      {options.map((option) => (
        <button
          key={option}
          className={`chip${value === option ? " is-on" : ""}`}
          onClick={() => onPick(option)}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

/**
 * The library: three cascading curriculum filters over a list of cards.
 *
 * Only categories that actually have a video are offered — an empty chip is a
 * dead end, and the curriculum has nine courses and ninety-one topics, almost
 * none of which will exist early on. They stay in curriculum order rather than
 * being sorted by count, so a chip does not move between visits.
 */
export const Home: React.FC<{
  shorts: ShortSummary[];
  onOpen: (list: ShortSummary[], index: number) => void;
  onDelete: (slug: string) => Promise<void>;
}> = ({ shorts, onOpen, onDelete }) => {
  const [major, setMajor] = useState<string | null>(null);
  const [middle, setMiddle] = useState<string | null>(null);
  const [small, setSmall] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filed = useMemo(
    () => shorts.map((short) => ({ short, ...splitUnit(short.unit) })),
    [shorts],
  );

  const majors = useMemo(() => {
    const present = new Set(filed.map((item) => item.major));
    return [...new Set(MATH_TAXONOMY.map((unit) => unit.major))].filter((name) =>
      present.has(name),
    );
  }, [filed]);

  const middles = useMemo(() => {
    const pool = major ? filed.filter((item) => item.major === major) : filed;
    const present = new Set(pool.map((item) => item.middle));
    return [
      ...new Set(
        MATH_TAXONOMY.filter((unit) => !major || unit.major === major).map(
          (unit) => unit.middle,
        ),
      ),
    ].filter((name) => present.has(name));
  }, [filed, major]);

  const smalls = useMemo(() => {
    const pool = filed.filter(
      (item) =>
        (!major || item.major === major) && (!middle || item.middle === middle),
    );
    const present = new Set(pool.map((item) => item.short.subunit));
    return MATH_TAXONOMY.filter(
      (unit) =>
        (!major || unit.major === major) && (!middle || unit.middle === middle),
    )
      .flatMap((unit) => unit.topics)
      .filter((topic) => present.has(topic));
  }, [filed, major, middle]);

  const visible = useMemo(
    () =>
      filed
        .filter(
          (item) =>
            (!major || item.major === major) &&
            (!middle || item.middle === middle) &&
            (!small || item.short.subunit === small),
        )
        .map((item) => item.short),
    [filed, major, middle, small],
  );

  // Narrowing the level above can strand a choice below it; drop it rather
  // than leave a chip lit that no longer matches anything.
  const pickMajor = (next: string | null) => {
    setMajor(next);
    setMiddle(null);
    setSmall(null);
  };
  const pickMiddle = (next: string | null) => {
    setMiddle(next);
    setSmall(null);
  };

  const remove = async (short: ShortSummary) => {
    // A native confirmation deliberately interrupts the tap: deletion is an
    // irreversible secondary action, so it should never ride on the card-open
    // gesture or need a custom modal before a phone-sized library is usable.
    if (!window.confirm(`「${short.topic}」を削除しますか？\nこの操作は元に戻せません。`)) {
      return;
    }

    setDeleteError(null);
    setDeletingSlug(short.slug);
    try {
      await onDelete(short.slug);
    } catch (error) {
      setDeleteError(
        `削除できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <div className="home">
      <div className="home__filters">
        <Bar label="大分類" options={majors} value={major} onPick={pickMajor} />
        <Bar label="中分類" options={middles} value={middle} onPick={pickMiddle} />
        <Bar label="小分類" options={smalls} value={small} onPick={setSmall} />
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <h1 className="empty__brand">
            short<span>_</span>study
          </h1>
          <p>
            {shorts.length === 0
              ? "解きたい問題を1つ。ショート動画になります。"
              : "この分類の動画はまだありません。"}
          </p>
        </div>
      ) : (
        <div className="grid-scroll">
          {deleteError ? (
            <p className="home__delete-error" role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="grid">
            {visible.map((short, index) => (
              <div
                className="grid__cell"
                key={short.slug}
              >
                <LibraryCard
                  short={short}
                  onOpen={() => onOpen(visible, index)}
                  onDelete={() => remove(short)}
                  deleting={deletingSlug === short.slug}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
