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
 * 生成 stream の 1 行。
 *
 * pipeline はどこかの record を更新せずこれを yield して進捗を伝える。deployed build には
 * request 後も生きる process がなく、job table を置く場所がないためである。browser は response
 * body から直接読む。
 *
 * 意図して leaf module にする。web client がこの型を import するため、推移的に引くものはすべて
 * browser bundle に耐えなければならない。
 */
export type JobEvent = {
  status: JobStatus;
  /** UI にそのまま出す、現在の工程の日本語ラベル。 */
  message: string;
  /** 確定進捗 bar 用の 0–1。 */
  progress: number;
  /** 生成 event の形を manifest とそろえるため保持する。 */
  course: CourseId;
  slug: string | null;
  /** ローカルでは `public/` からの相対パス、blob 利用時は絶対 URL。 */
  manifestSrc: string | null;
  error: string | null;
};
