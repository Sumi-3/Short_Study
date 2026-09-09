import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Create } from "./Create";
import { Feed } from "./Feed";
import { Home } from "./Home";
import { newAudioGate } from "./audioGate";
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
  const [tab, setTab] = useState<Tab>("home");
  const [shorts, setShorts] = useState<ShortSummary[]>([]);
  const [job, setJob] = useState<JobEvent | null>(null);
  /** card を開いた元の絞り込み list を、app 全体の上で再生する。 */
  const [viewing, setViewing] = useState<{
    list: ShortSummary[];
    index: number;
  } | null>(null);
  /**
   * すべての player が共有する、セッション全体の音声状態。最初の short はタップを待つ。
   * phone 上で Player の audio tag を unlock できるのは、その click の中の play() だけ
   * だからである。その後は short を画面に出した gesture だけで足りる。
   *
   * state ではなく ref にする。タップ中のセットで mounted ShortPlayer を再レンダー
   * してしまうと、同じタップで auto-start と click-start の両方が起こる。
   */
  const gate = useRef(newAudioGate());

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

  const pickTab = (next: Tab) => {
    if (next === "shorts") {
      setShuffleKey((key) => key + 1);
    }
    setTab(next);
  };

  return (
    // 実際のタップならどれでも programmatic playback を unlock する gesture として使える。
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
