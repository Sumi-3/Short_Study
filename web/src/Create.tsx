import { useEffect, useRef, useState } from "react";
import { COURSES } from "../../src/courses";
import { DEFAULT_DESIGN, DESIGNS, type DesignId } from "../../src/designs";
import { VOICES } from "../../src/voices";
import type { JobEvent } from "./api";
import { playSample } from "./voiceSamples";

/**
 * Roughly how long each step runs, in seconds. Only the shape of the creep
 * depends on these, never where it ends up — the next event is what settles a
 * step — so being wrong here costs a bar that fills a little fast or a little
 * slow, not one that lies about the milestone.
 */
const APPROACH_SECONDS: Partial<Record<JobEvent["status"], number>> = {
  queued: 3,
  // The Claude call. Far and away the longest wait in a run.
  script: 16,
  audio: 5,
  captions: 5,
  manifest: 2,
};

/**
 * Creeps toward the step's weight instead of jumping to it.
 *
 * `runPipeline` reports a step as it *starts*, and the weights are how much of
 * the wall clock is done once that step *ends*. So 「台本を書いています」at
 * 0.70 means "this will be 70% when it finishes", not "we are at 70%" — but
 * the bar read it literally and sat at 70% for the whole Claude call, which is
 * the one step long enough for anyone to watch.
 *
 * The approach is exponential, so it never quite arrives: only the next event
 * completes a step, and a bar that reached the target early would stall just
 * as visibly as one that jumped there.
 */
const useCreepingProgress = (job: JobEvent) => {
  const settled = job.status === "done" || job.status === "error";
  const [shown, setShown] = useState(0);
  /* The rendered value, kept in a ref so a new step can pick up exactly where
     the last one left off without making `shown` an effect dependency. */
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

    // Coarser than a frame on purpose: the fill already carries a 0.4s CSS
    // transition, so this only has to keep the target moving.
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
              of scrolling, and this is a set-and-forget choice. Picking one
              plays it, because the label narrows the field down but only the
              sample settles it. */}
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
