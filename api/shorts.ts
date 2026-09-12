import {
  deleteProject,
  isProjectSlug,
  listShorts,
  ProjectDeleteError,
} from "../src/storage.js";
import { basicAuthEnabled, checkBasicAuth } from "../src/auth.js";

const unauthorized = () =>
  new Response(null, {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="short_study"' },
  });

export async function GET(request: Request): Promise<Response> {
  if (basicAuthEnabled() && !checkBasicAuth(request.headers.get("authorization") ?? undefined)) {
    return unauthorized();
  }

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

export async function DELETE(request: Request): Promise<Response> {
  if (basicAuthEnabled() && !checkBasicAuth(request.headers.get("authorization") ?? undefined)) {
    return unauthorized();
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  // Reject this at the HTTP boundary as well as in storage, so malformed input
  // is never mistaken for a storage outage; storage repeats the guard for any
  // future non-HTTP caller.
  if (!isProjectSlug(slug)) {
    return Response.json({ error: "invalid project slug" }, { status: 400 });
  }

  try {
    await deleteProject(slug);
    return Response.json({ deleted: true });
  } catch (error) {
    const status = error instanceof ProjectDeleteError ? error.status : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}
