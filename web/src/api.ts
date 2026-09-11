import type { CourseId } from "../../src/courses";
import type { JobEvent } from "../../src/progress";
import type { ShortSummary } from "../../src/shorts";
import type { Manifest } from "../../src/types";

export type { JobEvent, ShortSummary };

/** Blob-backed manifest は絶対パス、local のものは `public/` からの相対パスである。 */
const absolute = (src: string) =>
  /^https?:\/\//.test(src) ? src : `/${src}`;

const json = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `${response.status}`);
  }
  return body as T;
};

/**
 * 1件の生成を stream し、stage ごとに progress event を yield する。
 *
 * server は client が poll する job table に書く代わりに、実行全体で connection を
 * 保持する。deploy 済み build には、その table を持つために request より長生きする
 * process がないからである。
 */
export async function* generate(
  topic: string,
  course: CourseId,
  voice: string,
  model: string,
): AsyncGenerator<JobEvent> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, course, voice, model }),
  });

  // 拒否された request は stream ではなく JSON で応答する。
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `${response.status}`);
  }
  if (!response.body) {
    throw new Error("サーバーが進捗を返しませんでした");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";

  const parse = function* (chunk: string) {
    buffered += chunk;
    const lines = buffered.split("\n");
    // chunk 境界はどこにでも来るので、最後の断片は行の途中かもしれない。
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line) as JobEvent;
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    yield* parse(value);
  }
  if (buffered.trim()) {
    yield JSON.parse(buffered) as JobEvent;
  }
}

export const fetchShorts = () => json<ShortSummary[]>("/api/shorts");

export const deleteShort = (slug: string) =>
  json<{ deleted: true }>(`/api/shorts?slug=${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

/** crop 後の JPEG だけを送り、返った問題文は既存の topic と同じ扱いにする。 */
export const extractProblem = (image: string, model: string) =>
  json<{ topic: string }>("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, model }),
  });

/**
 * manifest の fetch はセッションごとに最大一回にする。
 *
 * pipeline は slug ごとに一つを書いて決して書き換えない immutable なものなので、
 * invalidation は不要である。feed にとっても必要で、以前は swipe のたび動画が出る前に
 * blob storage への往復があり、その間ずっと下の card が見えていた。
 */
const manifests = new Map<string, Promise<Manifest>>();

export const fetchManifest = (manifestSrc: string) => {
  const cached = manifests.get(manifestSrc);
  if (cached) {
    return cached;
  }
  const pending = json<Manifest>(absolute(manifestSrc)).catch((error) => {
    // 失敗を記憶すると一度だけの不調が恒久化するので、cache には残さない。
    manifests.delete(manifestSrc);
    throw error;
  });
  manifests.set(manifestSrc, pending);
  return pending;
};

/** 一つを cache に warm する。失敗は次の実際の fetch で扱えばよい。 */
export const prefetchManifest = (manifestSrc: string) => {
  void fetchManifest(manifestSrc).catch(() => {});
};
