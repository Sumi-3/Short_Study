import type { CourseId } from "../../src/courses";
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
  mock: boolean,
): AsyncGenerator<JobEvent> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, course, mock }),
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

export const fetchManifest = (manifestSrc: string) =>
  json<Manifest>(absolute(manifestSrc));
