import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";
import { manifestSrc as localManifestSrc } from "./pipeline/buildManifest.js";
import { newestFirst, summarize, type ShortSummary } from "./shorts.js";
import type { Manifest } from "./types.js";

/**
 * Where finished shorts live.
 *
 * Locally that is `public/projects/`, served by the dev server — the manifest
 * keeps paths relative to `public/` and `staticFile()` resolves them. A
 * deployed build has no disk it can keep, so the same files are pushed to blob
 * storage and the manifest is rewritten to absolute URLs on the way out.
 *
 * The presence of the token is what picks the branch, so a local checkout needs
 * no configuration and a deployment needs no code change.
 */
const usingBlob = () => {
  // Two ways a store can be attached. Connecting one to the project sets up
  // OIDC (`BLOB_STORE_ID` plus a short-lived token the SDK refreshes itself),
  // which is what a deployment normally uses; `BLOB_READ_WRITE_TOKEN` is the
  // long-lived static token, for code running outside Vercel. Either is enough
  // for the SDK to authenticate, so checking only the token would refuse to
  // start on a perfectly well-configured deployment.
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    return true;
  }
  // Without a store, a deployment would write the short into a `/tmp` that is
  // gone by the next request and hand the player a path nothing serves — a 404
  // arriving only after the whole pipeline has run. Say so up front instead.
  if (process.env.VERCEL) {
    throw new Error(
      "No Blob store is attached (neither BLOB_STORE_ID nor BLOB_READ_WRITE_TOKEN is set). Create a public Blob store in the Vercel dashboard and connect it to this project; a deployment has nowhere else to keep a finished short.",
    );
  }
  return false;
};

// Project slugs become both disk path components and Blob path prefixes. Keeping
// this deliberately narrower than a filename means a request can never escape
// the project it names when deletion is involved.
const PROJECT_SLUG = /^[a-zA-Z0-9-]+$/;

export const isProjectSlug = (slug: string) => PROJECT_SLUG.test(slug);

export class ProjectDeleteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

const assertDeletableSlug = (slug: string) => {
  if (!isProjectSlug(slug)) {
    throw new ProjectDeleteError("invalid project slug", 400);
  }
  if (slug === "mock") {
    // `mock` is the checked-in sample that makes a fresh clone usable; treating
    // it as ordinary generated output would let one library tap damage the repo.
    throw new ProjectDeleteError("the mock project cannot be deleted", 403);
  }
};

/** `projects/<slug>/manifest.json` → `<slug>`. */
const slugOf = (pathname: string) => pathname.split("/")[1] ?? pathname;

const publishToBlob = async (slug: string, manifest: Manifest) => {
  const { put } = await import("@vercel/blob");
  const dir = paths.projectDir(slug);

  // Sequential rather than Promise.all: a long script is a dozen uploads, and
  // the file-descriptor budget is shared across every concurrent invocation.
  for (const scene of manifest.scenes) {
    const name = path.basename(scene.audioSrc);
    const { url } = await put(
      `projects/${slug}/${name}`,
      fs.createReadStream(path.join(dir, name)),
      {
        access: "public",
        contentType: "audio/mpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
        // Without this the narration carries no cache-control, so a phone
        // re-fetches every clip on every swipe and playback starts as a race
        // against the download. The path already names an immutable file.
        cacheControlMaxAge: 31536000,
      },
    );
    scene.audioSrc = url;
  }

  // Uploaded last, and only once the audio it points at is already readable.
  const { url } = await put(
    `projects/${slug}/manifest.json`,
    JSON.stringify(manifest),
    {
      access: "public",
      contentType: "application/json; charset=utf-8",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    },
  );

  return url;
};

/**
 * Makes a freshly built project readable by the player, and returns the address
 * the feed should hand out for it.
 */
export const publishProject = async (
  slug: string,
  manifest: Manifest,
): Promise<string> =>
  usingBlob() ? publishToBlob(slug, manifest) : localManifestSrc(slug);

const listFromDisk = (): ShortSummary[] => {
  if (!fs.existsSync(paths.projects)) {
    return [];
  }

  return newestFirst(
    fs.readdirSync(paths.projects).flatMap((slug) => {
      const file = path.join(paths.projects, slug, "manifest.json");
      if (!fs.existsSync(file)) {
        return [];
      }
      const manifest = JSON.parse(fs.readFileSync(file, "utf-8")) as Manifest;
      return [summarize(manifest, slug, localManifestSrc(slug))];
    }),
  );
};

const listFromBlob = async (): Promise<ShortSummary[]> => {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "projects/" });
  const manifests = blobs.filter((blob) =>
    blob.pathname.endsWith("/manifest.json"),
  );

  // One fetch per short. Fine at this scale, and it keeps the feed derived from
  // the manifests themselves rather than from an index that can drift out of
  // step with them. Swap in a single index blob if the list ever gets long.
  const summaries = await Promise.all(
    manifests.map(async (blob) => {
      const response = await fetch(blob.url);
      if (!response.ok) {
        return null;
      }
      const manifest = (await response.json()) as Manifest;
      return summarize(manifest, slugOf(blob.pathname), blob.url);
    }),
  );

  return newestFirst(summaries.filter((item): item is ShortSummary => item !== null));
};

/** Every finished short, newest first — the feed the web app scrolls through. */
export const listShorts = async (): Promise<ShortSummary[]> =>
  usingBlob() ? listFromBlob() : listFromDisk();

const deleteFromDisk = async (slug: string) => {
  // Validation above is intentionally before this path is constructed.
  const dir = paths.projectDir(slug);
  if (!fs.existsSync(dir)) {
    // A missing project is a client error: reporting success would make a typo
    // indistinguishable from an irreversible deletion that actually happened.
    throw new ProjectDeleteError("project not found", 404);
  }
  await fs.promises.rm(dir, { recursive: true });
};

const deleteFromBlob = async (slug: string) => {
  const { del, list } = await import("@vercel/blob");
  // The trailing slash prevents a valid slug such as `lesson` from matching
  // another project's `lesson-two` files.
  const prefix = `projects/${slug}/`;
  const blobs = [] as Awaited<ReturnType<typeof list>>["blobs"];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, cursor });
    blobs.push(...page.blobs);
    cursor = page.cursor;
    if (!page.hasMore) {
      break;
    }
  } while (cursor);

  if (blobs.length === 0) {
    // Match disk semantics so a stale card or mistyped slug is visible to the
    // caller instead of being reported as a deletion that never occurred.
    throw new ProjectDeleteError("project not found", 404);
  }

  // Listing the whole project prefix, rather than only manifest.json, removes
  // every scene narration too (and any future per-project companion files).
  await del(blobs.map((blob) => blob.url));
};

/** Removes one generated short and all of the files belonging to it. */
export const deleteProject = async (slug: string): Promise<void> => {
  assertDeletableSlug(slug);
  return usingBlob() ? deleteFromBlob(slug) : deleteFromDisk(slug);
};
