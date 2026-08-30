import { listShorts } from "../src/storage.js";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listShorts(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    // Most likely no blob store is attached. Say which, rather than letting the
    // throw become an opaque FUNCTION_INVOCATION_FAILED with an empty feed.
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
