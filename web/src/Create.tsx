import { useState } from "react";
import { COURSES } from "../../src/courses";
import { DEFAULT_DESIGN, DESIGNS, type DesignId } from "../../src/designs";
import { VOICES } from "../../src/voices";
import type { JobEvent } from "./api";

const JobCard: React.FC<{ job: JobEvent; onDismiss: () => void }> = ({
  job,
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

export const Create: React.FC<{
  job: JobEvent | null;
  busy: boolean;
  onSubmit: (topic: string, voice: string, design: DesignId) => void;
  onDismiss: () => void;
}> = ({ job, busy, onSubmit, onDismiss }) => {
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [design, setDesign] = useState<DesignId>(DEFAULT_DESIGN);

  return (
    <div className="create">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!topic.trim() || busy) {
            return;
          }
          onSubmit(topic.trim(), voice, design);
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
          {/* A select rather than chips: fourteen of them would be three rows
              of scrolling, and this is a set-and-forget choice. */}
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <optgroup label="日本語ボイス">
              {VOICES.filter((entry) => entry.native).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}（{entry.gender === "female" ? "女性" : "男性"}）
                </option>
              ))}
            </optgroup>
            <optgroup label="多言語ボイス（日本語も話せます）">
              {VOICES.filter((entry) => !entry.native).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}（{entry.gender === "female" ? "女性" : "男性"}）
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="field">
          <span className="field__label">デザイン</span>
          <div className="swatches">
            {DESIGNS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={design === entry.id}
                className={`swatch${design === entry.id ? " is-on" : ""}`}
                onClick={() => setDesign(entry.id)}
              >
                <span
                  className="swatch__dot"
                  style={{ background: entry.swatch }}
                  aria-hidden
                />
                {entry.label}
              </button>
            ))}
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
