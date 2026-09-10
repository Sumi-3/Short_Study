import { useState } from "react";
import { COURSES } from "../../src/courses";
import { VOICES } from "../../src/voices";
import { SCRIPT_MODELS } from "../../src/models";
import type { JobEvent } from "./api";
import { playSample } from "./voiceSamples";

const JobCard: React.FC<{ job: JobEvent; progress: number; onDismiss: () => void }> = ({
  job,
  progress,
  onDismiss,
}) => {
  const settled = job.status === "done" || job.status === "error";

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
  /** 進みは App が持つ。tab を離れてもこの component が消えても、途中の値を失わない。 */
  progress: number;
  busy: boolean;
  onSubmit: (topic: string, voice: string, model: string) => void;
  onDismiss: () => void;
}> = ({ job, progress, busy, onSubmit, onDismiss }) => {
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [model, setModel] = useState(SCRIPT_MODELS[0].id);

  return (
    <div className="create">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!topic.trim() || busy) {
            return;
          }
          onSubmit(topic.trim(), voice, model);
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

        <div className="field">
          <span className="field__label">台本モデル</span>
          {/* 声と違って2択なので chip にする。選ぶたびに開かせる理由がない。
              速さと深さのどちらを取ったかを、選んだ後も読めるようにしておく。 */}
          <div className="models">
            {SCRIPT_MODELS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`models__chip${model === entry.id ? " is-on" : ""}`}
                onClick={() => setModel(entry.id)}
                aria-pressed={model === entry.id}
              >
                <span className="models__name">{entry.label}</span>
                <span className="models__note">{entry.note}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={!topic.trim() || busy}>
          {busy ? "生成中…" : "動画をつくる"}
        </button>
      </form>

      {job ? <JobCard job={job} progress={progress} onDismiss={onDismiss} /> : null}
    </div>
  );
};
