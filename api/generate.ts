import { isCourseId } from "../src/courses";
import { runPipeline } from "../src/pipeline/run";

/**
 * The whole pipeline in a single invocation, reporting progress as NDJSON.
 *
 * There is no job table to poll: a deployed build keeps no process between
 * requests, so the run and the connection reporting on it are the same thing.
 * The trade is that a reload during generation loses the progress view — the
 * run itself finishes and the short still appears in the feed.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const topic = String(body?.topic ?? "").trim();
  if (!topic) {
    return Response.json({ error: "topic is required" }, { status: 400 });
  }

  const course = isCourseId(body?.course) ? body.course : "general";
  const mock = Boolean(body?.mock);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runPipeline({ topic, course, mock })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // `no-transform` keeps an intermediary from buffering the whole run up to
      // compress it, which would deliver every progress line at once at the end.
      "cache-control": "no-cache, no-transform",
    },
  });
}
