import type { CourseId } from "../../src/courses";
import type { DesignId } from "../../src/designs";
import type { JobEvent } from "../../src/progress";
import type { ShortSummary } from "../../src/shorts";
import type { Manifest } from "../../src/types";

export type { JobEvent, ShortSummary };

/** Blob-backed manifests are absolute; local ones are relative to `public/`. */
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
 * Streams one generation, yielding a progress event per stage.
 *
 * The server holds the connection for the whole run rather than writing to a
 * job table the client polls, because a deployed build has no process that
 * outlives a request to keep such a table in.
 */
export async function* generate(
  topic: string,
  course: CourseId,
  voice: string,
  design: DesignId,
): AsyncGenerator<JobEvent> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, course, voice, design }),
  });

  // A rejected request answers with JSON, not with the stream.
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
    // A chunk boundary lands anywhere, so the last piece may be half a line.
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

/**
 * A manifest is fetched at most once a session.
 *
 * They are immutable — the pipeline writes one per slug and never rewrites it —
 * so there is nothing to invalidate. The feed depends on this: swiping used to
 * mean a round-trip to blob storage before the video could appear, and the
 * card underneath showed through for as long as that took.
 */
const manifests = new Map<string, Promise<Manifest>>();

export const fetchManifest = (manifestSrc: string) => {
  const cached = manifests.get(manifestSrc);
  if (cached) {
    return cached;
  }
  const pending = json<Manifest>(absolute(manifestSrc)).catch((error) => {
    // A failure must not be remembered, or one bad moment is permanent.
    manifests.delete(manifestSrc);
    throw error;
  });
  manifests.set(manifestSrc, pending);
  return pending;
};

/** Warms one into the cache; failures are the next real fetch's problem. */
export const prefetchManifest = (manifestSrc: string) => {
  void fetchManifest(manifestSrc).catch(() => {});
};
