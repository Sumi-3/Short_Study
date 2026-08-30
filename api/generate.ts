import { isCourseId } from "../src/courses.js";
import { runPipeline } from "../src/pipeline/run.js";

/**
 * The whole pipeline in a single invocation, reporting progress as NDJSON.
 *
 * There is no job table to poll: a deployed build keeps no process between
 * requests, so the run and the connection reporting on it are the same thing.
 * The trade is that a reload during generation loses the progress view — the
 * run itself finishes and the short still appears in the feed.
 *
 * Exported as `POST` rather than as a default function: a default-exported
 * function is ambiguous between the Web handler and the older Node
 * `(request, response)` signature, and being read as the latter hands you an
 * `IncomingMessage` with no `.json()` — a TypeError before any of this runs,
 * surfacing only as an opaque FUNCTION_INVOCATION_FAILED.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const topic = String(body?.topic ?? "").trim();
    if (!topic) {
      return Response.json({ error: "topic is required" }, { status: 400 });
    }

    const course = isCourseId(body?.course) ? body.course : "math";
    const mock = Boolean(body?.mock);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runPipeline({ topic, course, mock })) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          // runPipeline yields its own failures, so reaching here means the
          // generator itself broke. Without this the rejection escapes the
          // stream and the whole invocation dies with nothing readable.
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                status: "error",
                message: "生成に失敗しました",
                progress: 1,
                course,
                slug: null,
                manifestSrc: null,
                error: error instanceof Error ? error.message : String(error),
              })}\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        // `no-transform` keeps an intermediary from buffering the whole run up
        // to compress it, which would deliver every progress line at once.
        "cache-control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    // Anything thrown before the stream exists — a bad body, a missing
    // binding — as JSON the client can display, not a platform 500 page.
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
