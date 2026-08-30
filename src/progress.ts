import type { CourseId } from "./courses.js";

export type JobStatus =
  | "queued"
  | "script"
  | "audio"
  | "captions"
  | "manifest"
  | "done"
  | "error";

/**
 * One line of the generation stream.
 *
 * The pipeline reports progress by yielding these rather than by updating a
 * record somewhere: a deployed build has no process that outlives the request,
 * so there is nowhere for a job table to live. The browser reads them straight
 * off the response body.
 *
 * A leaf module on purpose — the web client imports this type, and anything it
 * pulled in transitively would have to survive a browser bundle.
 */
export type JobEvent = {
  status: JobStatus;
  /** Japanese label for the current step, shown as-is in the UI. */
  message: string;
  /** 0–1, for a determinate progress bar. */
  progress: number;
  /** Which system prompt this was generated with, chosen by the user. */
  course: CourseId;
  slug: string | null;
  /** Relative to `public/` locally, an absolute URL when blob-backed. */
  manifestSrc: string | null;
  error: string | null;
};
