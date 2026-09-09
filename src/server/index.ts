import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { paths } from "../config.js";
import { runPipeline } from "../pipeline/run.js";
import {
  deleteProject,
  isProjectSlug,
  listShorts,
  ProjectDeleteError,
} from "../storage.js";
import { isCourseId } from "../courses.js";
import { isVoiceId } from "../voices.js";

const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = path.join(paths.root, "web", "dist");

/**
 * Under `npm run dev`, Vite serves the app and this process is the API only.
 *
 * Otherwise a stale `web/dist` would make :3001 a second, fully working copy of
 * the app alongside Vite's :5173 — open both and you hear the narration twice.
 */
const apiOnly = process.env.SHORT_STUDY_API_ONLY === "1";
const serveWeb = !apiOnly && fs.existsSync(WEB_DIST);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
};

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });

const sendFile = (res: http.ServerResponse, filePath: string) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
    "content-length": fs.statSync(filePath).size,
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
};

/**
 * One generation at a time. Both slow steps are network-bound on third-party
 * services, so running jobs in parallel mostly buys rate-limit errors.
 *
 * A promise chain rather than a queue of job records, because a request now
 * holds its own connection open for the whole run: waiting for the lock and
 * waiting for the pipeline look the same from the client's side.
 *
 * This is the one guarantee a deployed build cannot make — separate requests
 * land in separate instances with nothing between them to take a lock on.
 */
let tail: Promise<unknown> = Promise.resolve();
const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
  const next = tail.then(work, work);
  tail = next.catch(() => undefined);
  return next;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = url.pathname;

  try {
    if (route === "/api/generate" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const topic = String(body.topic ?? "").trim();
      if (!topic) {
        return sendJson(res, 400, { error: "topic is required" });
      }
      const course = isCourseId(body.course) ? body.course : "math";

      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      });
      await serialize(async () => {
        for await (const event of runPipeline({
          topic,
          course,
          voice: isVoiceId(body.voice) ? body.voice : undefined,
        })) {
          res.write(`${JSON.stringify(event)}\n`);
        }
      });
      return res.end();
    }

    if (route === "/api/shorts" && req.method === "GET") {
      return sendJson(res, 200, await listShorts());
    }

    if (route === "/api/shorts" && req.method === "DELETE") {
      const slug = url.searchParams.get("slug") ?? "";
      // Keep malformed slugs out of storage entirely; deleteProject repeats the
      // check because it is also callable without this router.
      if (!isProjectSlug(slug)) {
        return sendJson(res, 400, { error: "invalid project slug" });
      }
      try {
        await deleteProject(slug);
        return sendJson(res, 200, { deleted: true });
      } catch (error) {
        if (error instanceof ProjectDeleteError) {
          return sendJson(res, error.status, { error: error.message });
        }
        throw error;
      }
    }

    // Narration and manifests, served where staticFile() expects them.
    if (route.startsWith("/projects/")) {
      const target = path.join(paths.dataRoot, "public", route.slice(1));
      if (!target.startsWith(path.join(paths.dataRoot, "public"))) {
        return sendJson(res, 403, { error: "forbidden" });
      }
      if (sendFile(res, target)) {
        return;
      }
    }

    // Built web app (production). In dev, Vite serves this instead.
    if (serveWeb) {
      const candidate = path.join(WEB_DIST, route === "/" ? "index.html" : route.slice(1));
      if (sendFile(res, candidate)) {
        return;
      }
      if (sendFile(res, path.join(WEB_DIST, "index.html"))) {
        return;
      }
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    if (res.headersSent) {
      return res.end();
    }
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  if (apiOnly) {
    console.log(`API   http://localhost:${PORT}  (API only — open the Vite URL)`);
    return;
  }
  console.log(`API   http://localhost:${PORT}`);
  console.log(
    serveWeb
      ? `開く  http://localhost:${PORT}`
      : `Web   run \`npm run web\` (or \`npm run web:build\` to serve it here)`,
  );
});
