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

/**
 * 各 step のおおよその所要秒数。これに依存するのは creep の形だけで、到達地点は
 * 次の event が step を確定するため変わらない。値が外れても bar の進みが少し速い・
 * 遅いだけで、milestone を偽ることはない。
 */
const APPROACH_SECONDS: Partial<Record<JobEvent["status"], number>> = {
  queued: 3,
  // Claude 呼び出し。実行中で群を抜いて長い待ち時間になる。
  script: 16,
  audio: 5,
  captions: 5,
  manifest: 2,
};

/**
 * step の重みへ飛ばずに、徐々に近づける。
 *
 * `runPipeline` が報告するのは step の*開始時*で、重みはその step が*終わった時点*の
 * 実時間に対する完了量である。したがって「台本を書いています」の 0.70 は「終われば
 * 70%」であって「今70%」ではない。しかし bar は文字どおり読んで Claude 呼び出しの
 * 全時間を 70% で止まっていた。これは誰の目にも留まるほど長い唯一の step である。
 *
 * 近づき方は exponential なので、完全には届かない。step を完了させるのは次の event
 * だけであり、早く目標に着いた bar も、飛んで着いた bar と同じくらい目立って止まる。
 *
 * この状態を `Create` ではなく App に置くのは、tab を離れると `Create` が unmount され、
 * 到達点を失って戻ったときに bar が 0 まで巻き戻っていたからである。App は生存し続ける。
 */
const useCreepingProgress = (job: JobEvent | null, runId: number) => {
  const settled = !job || job.status === "done" || job.status === "error";
  /* 失敗は完了ではない。error の progress 1 をそのまま塗ると、赤く満杯の bar が
     成功と同じ形になり、どこで止まったのかも伝わらない。 */
  const target = !job ? 0 : job.status === "error" ? 0 : job.progress;
  const [shown, setShown] = useState(0);
  /* `shown` を effect dependency にせず、次の step が前の終了位置を正確に引き継げる
     よう、描画値は ref に保つ。 */
  const latest = useRef(0);

  /*
   * run が変わったら前回の到達点を捨てる。引き継ぐと、直前の run が置いた 1 から
   * 新しい run の queued（0）へ向かって、bar が満杯から逆走していた。
   */
  useEffect(() => {
    latest.current = 0;
    setShown(0);
  }, [runId]);

  useEffect(() => {
    if (settled) {
      latest.current = target;
      setShown(target);
      return;
    }

    const from = latest.current;
    const startedAt = performance.now();
    const tau = (APPROACH_SECONDS[job.status] ?? 8) * 1000;

    // 意図して frame より粗くする。fill にはすでに 0.4s の CSS transition があり、
    // ここでは目標を動かし続ければ足りる。
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const next = target - (target - from) * Math.exp(-elapsed / tau);
      latest.current = next;
      setShown(next);
    }, 250);

    return () => clearInterval(timer);
  }, [job?.status, target, settled]);

  return shown;
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
  /** 生成の実行ごとに増える。bar の到達点を run をまたいで持ち越さないための印。 */
  const [runId, setRunId] = useState(0);
  /**
   * シークバーの置き場所。tab bar の上辺に重ねるため、動画の枠から出して nav の中へ
   * portal する（理由は [ShortPlayer.tsx](./ShortPlayer.tsx) を参照）。element を state
   * に持つのは、nav が main より後に mount され、ref だけでは Player 側が
   * 描き直されないためである。
   */
  const [seekSlot, setSeekSlot] = useState<HTMLDivElement | null>(null);

  const progress = useCreepingProgress(job, runId);

  /*
   * 終わった job の card を片付ける。
   *
   * 走っている job は片付けない。パイプラインは server 側で進んでおり、state を消しても
   * 止まらないうえ、次の event が届いた瞬間に card が戻ってきて点滅するだけである。
   * さらに `busy` を偽って、二重の生成を許してしまう。
   */
  const dismissSettled = useCallback(() => {
    setJob((current) =>
      current && (current.status === "done" || current.status === "error") ? null : current,
    );
  }, []);

  const refreshShorts = useCallback(async () => {
    const list = await fetchShorts();
    setShorts(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshShorts().catch(() => {});
  }, [refreshShorts]);

  const removeShort = async (slug: string) => {
    dismissSettled();
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
    model: string,
  ) => {
    setRunId((id) => id + 1);
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
      for await (const next of generate(topic, "math", voice, model)) {
        setJob(next);
        if (next.status === "done" && next.slug) {
          const list = await refreshShorts();
          // 視聴者に library から探させず、今要求した動画へ直接入る。
          const index = list.findIndex((short) => short.slug === next.slug);
          if (index >= 0) {
            // 結果は動画そのものが示す。完了した bar を後ろに残しておく意味はない。
            setJob(null);
            // 再生は home tab の中に出るので、create tab のままだと画面に現れない。
            setTab("home");
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
    dismissSettled();
    flushSync(() => setViewing({ list, index }));
    viewingPlayer.current?.play(event);
  };

  const pickTab = (next: Tab, event: React.MouseEvent) => {
    dismissSettled();
    // ✕ を無くしたので、再生から戻る唯一の操作が tab になる。ホームへ戻ると一覧が出る。
    setViewing(null);
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
          /* 再生は shorts tab と同じく tab の中に出す。app を覆う overlay にすると、
             下の bar が隠れて閉じるための ✕ が要り、shorts と操作が食い違っていた。 */
          viewing ? (
            <Feed
              shorts={viewing.list}
              initialIndex={viewing.index}
              seekSlot={seekSlot}
              playbackRef={viewingPlayer}
            />
          ) : (
            <Home
              shorts={shorts}
              onOpen={openShort}
              onDelete={removeShort}
            />
          )
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
              seekSlot={seekSlot}
              playbackRef={tabPlayer}
            />
          )
        ) : null}

        {tab === "create" ? (
          <Create
            job={job}
            progress={progress}
            busy={busy}
            onSubmit={submit}
            onDismiss={() => setJob(null)}
          />
        ) : null}
      </main>

      <nav className="tabs">
        {/* 高さ 0 の目印。シークバーはこれを基準に上辺へまたがる。 */}
        <div className="tabs__seek" ref={setSeekSlot} />
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

    </div>
  );
};
