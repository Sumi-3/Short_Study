import { useState } from "react";
import { COURSES } from "../../src/courses";
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
  onSubmit: (topic: string, mock: boolean) => void;
  onDismiss: () => void;
}> = ({ job, busy, onSubmit, onDismiss }) => {
  const [topic, setTopic] = useState("");
  const [mock, setMock] = useState(false);

  return (
    <div className="create">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!topic.trim() || busy) {
            return;
          }
          onSubmit(topic.trim(), mock);
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
        <label className="mock">
          <input
            type="checkbox"
            checked={mock}
            onChange={(e) => setMock(e.target.checked)}
          />
          モック台本を使う（APIキー不要）
        </label>
        <button type="submit" disabled={!topic.trim() || busy}>
          {busy ? "生成中…" : "動画をつくる"}
        </button>
      </form>

      {job ? <JobCard job={job} onDismiss={onDismiss} /> : null}
    </div>
  );
};
