import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShortPlayer } from "./ShortPlayer";
import { Thumbnail } from "./Thumbnail";
import { COURSES, courseList, type CourseId } from "../../src/courses";
import {
  fetchShorts,
  generate,
  type JobEvent,
  type ShortSummary,
} from "./api";

/** `all` is a filter value only; it is never a course a short can belong to. */
type Filter = CourseId | "all";

const JobCard: React.FC<{ job: JobEvent; onDismiss: () => void }> = ({
  job,
  onDismiss,
}) => {
  const settled = job.status === "done" || job.status === "error";

  return (
    <div className={`job job--${job.status}`}>
      <div className="job__row">
        <span className="job__message">
          <span className="job__course">{COURSES[job.course].label}</span>
          {job.message}
        </span>
        {settled ? (
          <button className="job__close" onClick={onDismiss} aria-label="閉じる">
            ✕
          </button>
        ) : (
          <span className="job__percent">{Math.round(job.progress * 100)}%</span>
        )}
      </div>
      <div className="job__track">
        <div className="job__fill" style={{ width: `${job.progress * 100}%` }} />
      </div>
      {job.error ? <p className="job__error">{job.error}</p> : null}
    </div>
  );
};

export const App: React.FC = () => {
  const [topic, setTopic] = useState("");
  const [course, setCourse] = useState<CourseId>("general");
  const [filter, setFilter] = useState<Filter>("all");
  const [mock, setMock] = useState(false);
  const [job, setJob] = useState<JobEvent | null>(null);
  const [shorts, setShorts] = useState<ShortSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [composing, setComposing] = useState(false);
  /**
   * The last real user gesture, kept so a short that starts on its own can
   * still be handed one.
   *
   * The Player only unlocks its pool of audio tags when `play()` is given an
   * event, and unlocked tags are the only ones a phone lets make sound. A
   * swipe is a genuine gesture, but it is over by the time the next short has
   * fetched its manifest and mounted — so the event is carried forward rather
   * than reduced to a boolean.
   *
   * Ref, not state: setting this during a tap must not re-render the mounted
   * ShortPlayer, or the same tap both auto-starts and click-starts it.
   */
  const hasGesture = useRef<React.SyntheticEvent | null>(null);
  /** Slug to jump to once the refreshed feed has actually rendered. */
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () =>
      filter === "all"
        ? shorts
        : shorts.filter((short) => short.course === filter),
    [shorts, filter],
  );

  const refreshShorts = useCallback(async () => {
    try {
      const list = await fetchShorts();
      setShorts(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void refreshShorts();
  }, [refreshShorts]);

  // Which short is on screen. Only that one gets a mounted Player — running
  // several compositions at once is the whole cost of this playback model.
  useEffect(() => {
    const container = feedRef.current;
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
  }, [visible]);

  // Scrolling has to wait for the new item to exist in the DOM; doing it as the
  // stream reports "done" lands before React commits, and scroll anchoring then
  // drags the view back to whichever short was already on screen.
  useEffect(() => {
    if (!pendingSlug) {
      return;
    }
    const short = shorts.find((item) => item.slug === pendingSlug);
    if (!short) {
      return;
    }
    // A filter that hides the short just generated would strand the jump, so
    // the feed switches to the section the new video landed in.
    if (filter !== "all" && filter !== short.course) {
      setFilter(short.course);
      return;
    }

    const index = visible.findIndex((item) => item.slug === pendingSlug);
    const container = feedRef.current;
    if (index < 0 || !container) {
      return;
    }
    container.scrollTo({ top: index * container.clientHeight, behavior: "auto" });
    setActiveIndex(index);
    setPendingSlug(null);
  }, [pendingSlug, shorts, visible, filter]);

  const pickFilter = (next: Filter) => {
    setFilter(next);
    setActiveIndex(0);
    feedRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const asked = topic.trim();
    if (!asked) {
      return;
    }
    setComposing(false);
    setTopic("");
    // Shown before the first event arrives, so the sheet closing is not the
    // only feedback the tap gets.
    setJob({
      status: "queued",
      message: "順番待ち",
      progress: 0,
      course,
      slug: null,
      manifestSrc: null,
      error: null,
    });

    try {
      for await (const next of generate(asked, course, mock)) {
        setJob(next);
        if (next.status === "done" && next.slug) {
          setPendingSlug(next.slug);
          await refreshShorts();
        }
      }
    } catch (error) {
      setJob({
        status: "error",
        message: "生成に失敗しました",
        progress: 1,
        course,
        slug: null,
        manifestSrc: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const busy = job !== null && job.status !== "done" && job.status !== "error";
  const counts = useMemo(() => {
    const map = new Map<CourseId, number>();
    for (const short of shorts) {
      map.set(short.course, (map.get(short.course) ?? 0) + 1);
    }
    return map;
  }, [shorts]);

  return (
    // Any real tap counts as the gesture that unlocks programmatic playback.
    <div
      className="app"
      onPointerDown={(event) => {
        hasGesture.current = event;
      }}
    >
      {shorts.length > 0 ? (
        <nav className="filters">
          <button
            className={`filters__chip${filter === "all" ? " is-on" : ""}`}
            onClick={() => pickFilter("all")}
          >
            すべて
          </button>
          {courseList
            .filter((meta) => counts.has(meta.id))
            .map((meta) => (
              <button
                key={meta.id}
                className={`filters__chip${filter === meta.id ? " is-on" : ""}`}
                onClick={() => pickFilter(meta.id)}
              >
                {meta.label}
                <span className="filters__count">{counts.get(meta.id)}</span>
              </button>
            ))}
        </nav>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          <h1 className="empty__brand">
            short<span>_</span>study
          </h1>
          <p>
            {shorts.length === 0
              ? "学びたいことを1文で。ショート動画になります。"
              : "この科目の動画はまだありません。"}
          </p>
        </div>
      ) : (
        <div className="feed-scroll" ref={feedRef}>
          {visible.map((short, index) => (
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
      )}

      {job ? (
        <div className="overlay-top">
          <JobCard job={job} onDismiss={() => setJob(null)} />
        </div>
      ) : null}

      <button
        className="fab"
        onClick={() => setComposing(true)}
        disabled={busy}
        aria-label="動画をつくる"
      >
        {busy ? "…" : "＋"}
      </button>

      {composing ? (
        <div className="scrim" onClick={() => setComposing(false)}>
          <section className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__grip" />
            <form onSubmit={submit} className="composer">
              <h2>学びたいことは？</h2>

              {/* The course picks the system prompt, so it is chosen before
                  typing rather than inferred from the sentence. */}
              <div className="picker" role="radiogroup" aria-label="科目">
                {courseList.map((meta) => (
                  <button
                    key={meta.id}
                    type="button"
                    role="radio"
                    aria-checked={course === meta.id}
                    className={`picker__chip${course === meta.id ? " is-on" : ""}`}
                    onClick={() => setCourse(meta.id)}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>

              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={COURSES[course].placeholder}
                rows={4}
                autoFocus
              />
              <label className="mock">
                <input
                  type="checkbox"
                  checked={mock}
                  onChange={(e) => setMock(e.target.checked)}
                />
                モック台本を使う（APIキー不要）
              </label>
              <button type="submit" disabled={!topic.trim()}>
                動画をつくる
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
};
