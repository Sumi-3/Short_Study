import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Create } from "./Create";
import { Feed } from "./Feed";
import { Home } from "./Home";
import type { ShortPlayerHandle } from "./ShortPlayer";
import {
  deleteShort,
  fetchShorts,
  generate,
  type JobEvent,
  type ShortSummary,
} from "./api";

type Tab = "home" | "shorts" | "create";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "▦" },
  { id: "shorts", label: "ショート", icon: "▶" },
  { id: "create", label: "生成", icon: "＋" },
];

/** Fisher–Yates。shorts tab は sort ではなく shuffle である。 */
const shuffled = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

export const App: React.FC = () => {
  const viewingPlayer = useRef<ShortPlayerHandle>(null);
  const tabPlayer = useRef<ShortPlayerHandle>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [shorts, setShorts] = useState<ShortSummary[]>([]);
  const [job, setJob] = useState<JobEvent | null>(null);
  /** card を開いた元の絞り込み list を、app 全体の上で再生する。 */
  const [viewing, setViewing] = useState<{
    list: ShortSummary[];
    index: number;
  } | null>(null);
  /** tab に入るたび shuffle し直し、毎回異なる並びにする。 */
  const [shuffleKey, setShuffleKey] = useState(0);

  const refreshShorts = useCallback(async () => {
    const list = await fetchShorts();
    setShorts(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshShorts().catch(() => {});
  }, [refreshShorts]);

  const removeShort = async (slug: string) => {
    await deleteShort(slug);
    await refreshShorts();
    setViewing((current) => {
      if (!current?.list.some((short) => short.slug === slug)) {
        return current;
      }
      // 固定した Player を、storage から消した直後の manifest に向け直してはならない。
      // この feed を閉じてその player をきれいに終了し、次に開くときは通常どおり
      // 安定した一つの player を作る。
      return null;
    });
  };

  const random = useMemo(
    () => shuffled(shorts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shorts, shuffleKey],
  );

  const busy = job !== null && job.status !== "done" && job.status !== "error";

  const submit = async (
    topic: string,
    voice: string,
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
      for await (const next of generate(topic, "math", voice)) {
        setJob(next);
        if (next.status === "done" && next.slug) {
          const list = await refreshShorts();
          // 視聴者に library から探させず、今要求した動画へ直接入る。
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

  const openShort = (
    list: ShortSummary[],
    index: number,
    event: React.MouseEvent,
  ) => {
    // manifest の fetch を待つと gesture が失効する。空の Player と audio pool だけ先に
    // mount し、このサムネイルの click 中に event つきの play() を呼ぶ。これで pool が
    // 解除されるので、視聴者は音を出すためにもう一度タップしなくてよい。
    flushSync(() => setViewing({ list, index }));
    viewingPlayer.current?.play(event);
  };

  const pickTab = (next: Tab, event: React.MouseEvent) => {
    if (next === "shorts") {
      flushSync(() => {
        setShuffleKey((key) => key + 1);
        setTab(next);
      });
      tabPlayer.current?.play(event);
      return;
    }
    setTab(next);
  };

  return (
    <div className="app">
      <main className="app__body">
        {tab === "home" ? (
          <Home
            shorts={shorts}
            onOpen={openShort}
            onDelete={removeShort}
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
              playbackRef={tabPlayer}
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
            onClick={(event) => pickTab(entry.id, event)}
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
          playbackRef={viewingPlayer}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
};
