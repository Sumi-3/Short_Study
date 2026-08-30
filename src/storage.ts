import fs from "node:fs";
import path from "node:path";
import { paths } from "./config";
import { manifestSrc as localManifestSrc } from "./pipeline/buildManifest";
import { newestFirst, summarize, type ShortSummary } from "./shorts";
import type { Manifest } from "./types";

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
const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
