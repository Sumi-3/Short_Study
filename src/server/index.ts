import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { paths } from "../config.js";
import { basicAuthEnabled, checkBasicAuth } from "../auth.js";
import { runPipeline } from "../pipeline/run.js";
import {
  deleteProject,
  isProjectSlug,
  listShorts,
  ProjectDeleteError,
} from "../storage.js";
import { isCourseId } from "../courses.js";
import { isVoiceId } from "../voices.js";
import { isModelId } from "../models.js";
import { extractProblem, isExtractImage } from "../pipeline/extractProblem.js";

const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = path.join(paths.root, "web", "dist");

/**
 * `npm run dev` では Vite が app を配信し、この process は API 専用になる。
 *
 * そうしないと古い `web/dist` が Vite の :5173 と並ぶ完全動作の app を :3001 に作り、両方を
 * 開けばナレーションが二重に聞こえる。
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
 * 生成は 1 度に 1 件にする。遅い 2 工程は third-party service の network 待ちなので、job を
 * 並列にしても主に rate-limit error が増えるだけである。
 *
 * job record の queue ではなく promise chain にする。request は実行全体で自身の connection を
 * 開いたままにし、client 側からは lock 待ちも pipeline 待ちも同じに見えるためである。
 *
 * これは deployed build には保証できない。別 request は別 instance に届き、間に lock を取る対象が
 * ないためである。
 */
let tail: Promise<unknown> = Promise.resolve();
const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
  const next = tail.then(work, work);
  tail = next.catch(() => undefined);
  return next;
};

const server = http.createServer(async (req, res) => {
  if (basicAuthEnabled() && !checkBasicAuth(req.headers.authorization)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="short_study"' });
    return res.end();
  }

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
          model: isModelId(body.model) ? body.model : undefined,
        })) {
          res.write(`${JSON.stringify(event)}\n`);
        }
      });
      return res.end();
    }

    if (route === "/api/extract" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
      if (!isExtractImage(body.image)) {
        return sendJson(res, 400, { error: "JPEG image is required" });
      }
      const topic = await extractProblem(
        body.image,
        isModelId(body.model) ? body.model : undefined,
      );
      if (!topic) {
        return sendJson(res, 422, {
          error: "問題文を読み取れませんでした。画像を調整して再試行してください。",
        });
      }
      return sendJson(res, 200, { topic });
    }

    if (route === "/api/shorts" && req.method === "GET") {
      return sendJson(res, 200, await listShorts());
    }

    if (route === "/api/shorts" && req.method === "DELETE") {
      const slug = url.searchParams.get("slug") ?? "";
      // 不正な slug を storage に到達させない。deleteProject は router を通さず呼べるため、
      // 同じ検査を繰り返す。
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

    // narration と manifest を staticFile() が期待する場所で配信する。
    if (route.startsWith("/projects/")) {
      const target = path.join(paths.dataRoot, "public", route.slice(1));
      if (!target.startsWith(path.join(paths.dataRoot, "public"))) {
        return sendJson(res, 403, { error: "forbidden" });
      }
      if (sendFile(res, target)) {
        return;
      }
    }

    // build 済み Web app（production）。dev では代わりに Vite が配信する。
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
  console.log(
    basicAuthEnabled()
      ? "認証: HTTP Basic 認証は有効です"
      : "警告: BASIC_AUTH_PASSWORD が未設定のため認証は無効です",
  );
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
