import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Create } from "./Create";
import { Feed } from "./Feed";
import { Home } from "./Home";
import { newAudioGate } from "./audioGate";
import { fetchShorts, generate, type JobEvent, type ShortSummary } from "./api";
import type { DesignId } from "../../src/designs";

type Tab = "home" | "shorts" | "create";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "▦" },
  { id: "shorts", label: "ショート", icon: "▶" },
  { id: "create", label: "生成", icon: "＋" },
];

/** Fisher–Yates. The shorts tab is a shuffle, not a sort. */
const shuffled = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("home");
  const [shorts, setShorts] = useState<ShortSummary[]>([]);
  const [job, setJob] = useState<JobEvent | null>(null);
  /** The filtered list a card was opened from, played over the whole app. */
  const [viewing, setViewing] = useState<{
    list: ShortSummary[];
    index: number;
  } | null>(null);
  /**
   * Session-wide audio state, shared by every player. The first short of a
   * session waits to be tapped because only a play() made inside that click
   * unlocks the Player's audio tags on a phone; after that, the gesture that
   * brought a short on screen is enough.
   *
   * Ref, not state: setting this during a tap must not re-render the mounted
   * ShortPlayer, or the same tap both auto-starts and click-starts it.
   */
  const gate = useRef(newAudioGate());

  /** Reshuffled whenever the tab is entered, so it is a different run each time. */
  const [shuffleKey, setShuffleKey] = useState(0);

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

  const random = useMemo(
    () => shuffled(shorts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shorts, shuffleKey],
  );

  const busy = job !== null && job.status !== "done" && job.status !== "error";

  const submit = async (
    topic: string,
    voice: string,
    design: DesignId,
  ) => {
    setJob({
      status: "queued",
      message: "順番待ち",
      progress: 0,
      course: "math",
      slug: null,
      manifestSrc: null,
      error: null,
    });

    try {
      for await (const next of generate(topic, "math", voice, design)) {
        setJob(next);
        if (next.status === "done" && next.slug) {
          const list = await refreshShorts();
          // Straight into the video that was just asked for, rather than
          // leaving the viewer to find it in the library.
          const index = list.findIndex((short) => short.slug === next.slug);
          if (index >= 0) {
            setViewing({ list, index });
          }
        }
      }
    } catch (error) {
      setJob({
        status: "error",
        message: "生成に失敗しました",
        progress: 1,
        course: "math",
        slug: null,
        manifestSrc: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const pickTab = (next: Tab) => {
    if (next === "shorts") {
      setShuffleKey((key) => key + 1);
    }
    setTab(next);
  };

  return (
    // Any real tap counts as the gesture that unlocks programmatic playback.
    <div
      className="app"
      onPointerDown={(event) => {
        gate.current.gesture = event;
      }}
    >
      <main className="app__body">
        {tab === "home" ? (
          <Home
            shorts={shorts}
            onOpen={(list, index) => setViewing({ list, index })}
          />
        ) : null}

        {tab === "shorts" ? (
          random.length === 0 ? (
            <div className="empty">
              <h1 className="empty__brand">
                short<span>_</span>study
              </h1>
              <p>まだ動画がありません。</p>
            </div>
          ) : (
            <Feed
              key={shuffleKey}
              shorts={random}
              initialIndex={0}
              gate={gate}
            />
          )
        ) : null}

        {tab === "create" ? (
          <Create
            job={job}
            busy={busy}
            onSubmit={submit}
            onDismiss={() => setJob(null)}
          />
        ) : null}
      </main>

      <nav className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`tabs__button${tab === entry.id ? " is-on" : ""}`}
            onClick={() => pickTab(entry.id)}
          >
            <span className="tabs__icon" aria-hidden>
              {entry.icon}
            </span>
            {entry.label}
          </button>
        ))}
      </nav>

      {viewing ? (
        <Feed
          shorts={viewing.list}
          initialIndex={viewing.index}
          gate={gate}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
};
