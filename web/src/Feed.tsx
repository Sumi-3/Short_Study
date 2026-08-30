import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShortPlayer } from "./ShortPlayer";
import { Thumbnail } from "./Thumbnail";
import type { ShortSummary } from "./api";

/**
 * The vertical swipe feed.
 *
 * Both entry points share it: the home screen opens it over a filtered list at
 * the card that was tapped, and the shorts tab hands it everything in shuffled
 * order. Only the short on screen gets a mounted Player — running several
 * compositions at once is the whole cost of this playback model.
 */
export const Feed: React.FC<{
  shorts: ShortSummary[];
  initialIndex: number;
  hasGesture: React.RefObject<React.SyntheticEvent | null>;
  /** Present when the feed is covering the app rather than filling a tab. */
  onClose?: () => void;
}> = ({ shorts, initialIndex, hasGesture, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scroller = useRef<HTMLDivElement>(null);

  // Before paint, so opening on the third card never shows the first one.
  useLayoutEffect(() => {
    const container = scroller.current;
    if (container) {
      container.scrollTop = initialIndex * container.clientHeight;
    }
  }, [initialIndex]);

  useEffect(() => {
    const container = scroller.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    container
      .querySelectorAll(".feed-item")
      .forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [shorts]);

  return (
    <div className={`feed${onClose ? " feed--full" : ""}`}>
      {onClose ? (
        <button className="feed__close" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
      ) : null}

      <div className="feed-scroll" ref={scroller}>
        {shorts.map((short, index) => (
          <section className="feed-item" key={short.slug} data-index={index}>
            <div className="phone">
              {index === activeIndex ? (
                <ShortPlayer
                  manifestSrc={short.manifestSrc}
                  hasGesture={hasGesture}
                />
              ) : (
                <Thumbnail short={short} />
              )}
            </div>
            <p className="feed-item__topic">{short.topic}</p>
          </section>
        ))}
      </div>
    </div>
  );
};
