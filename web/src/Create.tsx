import { useEffect, useRef, useState } from "react";
import { COURSES } from "../../src/courses";
import { VOICES } from "../../src/voices";
import type { JobEvent } from "./api";
import { playSample } from "./voiceSamples";

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
 */
const useCreepingProgress = (job: JobEvent) => {
  const settled = job.status === "done" || job.status === "error";
  const [shown, setShown] = useState(0);
  /* `shown` を effect dependency にせず、次の step が前の終了位置を正確に引き継げる
     よう、描画値は ref に保つ。 */
  const latest = useRef(0);

  useEffect(() => {
    if (settled) {
      latest.current = job.progress;
      setShown(job.progress);
      return;
    }

    const from = latest.current;
    const startedAt = performance.now();
    const tau = (APPROACH_SECONDS[job.status] ?? 8) * 1000;

    // 意図して frame より粗くする。fill にはすでに 0.4s の CSS transition があり、
    // ここでは目標を動かし続ければ足りる。
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const next = job.progress - (job.progress - from) * Math.exp(-elapsed / tau);
      latest.current = next;
      setShown(next);
    }, 250);

    return () => clearInterval(timer);
  }, [job.status, job.progress, settled]);

  return shown;
};

const JobCard: React.FC<{ job: JobEvent; onDismiss: () => void }> = ({
  job,
  onDismiss,
}) => {
  const settled = job.status === "done" || job.status === "error";
  const progress = useCreepingProgress(job);

  return (
    <div className={`job job--${job.status}`}>
      <div className="job__row">
        <span className="job__message">{job.message}</span>
        {settled ? (
          <button className="job__close" onClick={onDismiss} aria-label="閉じる">
            ✕
          </button>
        ) : (
          <span className="job__percent">{Math.round(progress * 100)}%</span>
        )}
      </div>
      <div className="job__track">
        <div className="job__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      {job.error ? <p className="job__error">{job.error}</p> : null}
    </div>
  );
};

export const Create: React.FC<{
  job: JobEvent | null;
  busy: boolean;
  onSubmit: (topic: string, voice: string) => void;
  onDismiss: () => void;
}> = ({ job, busy, onSubmit, onDismiss }) => {
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);

  return (
    <div className="create">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!topic.trim() || busy) {
            return;
          }
          onSubmit(topic.trim(), voice);
          setTopic("");
        }}
      >
        <h2>解きたい問題は？</h2>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={COURSES.math.placeholder}
          rows={5}
        />

        <div className="field">
          <span className="field__label">声</span>
          {/* chip ではなく select にする。14個の chip なら三行にわたって scroll し、
              これは一度選べば済む設定だからである。選択時に再生するのは、label は候補を
              絞れても、決め手になるのは sample だけだからである。 */}
          <div className="voice">
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value);
                playSample(e.target.value);
              }}
            >
              <optgroup label="日本語ボイス">
                {VOICES.filter((entry) => entry.native).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="多言語ボイス（日本語も話せます）">
                {VOICES.filter((entry) => !entry.native).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              className="voice__play"
              onClick={() => playSample(voice)}
              aria-label="声を試聴する"
            >
              ▶
            </button>
          </div>
        </div>

        <button type="submit" disabled={!topic.trim() || busy}>
          {busy ? "生成中…" : "動画をつくる"}
        </button>
      </form>

      {job ? <JobCard job={job} onDismiss={onDismiss} /> : null}
    </div>
  );
};
