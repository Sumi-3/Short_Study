import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";
import { manifestSrc as localManifestSrc } from "./pipeline/buildManifest.js";
import { newestFirst, summarize, type ShortSummary } from "./shorts.js";
import type { Manifest } from "./types.js";

/**
 * 完成した short の保存先。
 *
 * ローカルでは dev server が配信する `public/projects/` に置く。manifest は `public/` からの
 * 相対パスを保ち、`staticFile()` が解決する。デプロイ済みビルドには保持できるディスクがないため、
 * 同じファイルを blob storage へ送り、出力時に manifest を絶対 URL へ書き換える。
 *
 * token の有無で分岐するため、ローカル checkout には設定不要で、デプロイにもコード変更が要らない。
 */
const usingBlob = () => {
  // store の接続方法は 2 つある。プロジェクトへ接続すると OIDC（`BLOB_STORE_ID` と SDK が
  // 自身で更新する短期 token）が設定され、通常のデプロイはこちらを使う。`BLOB_READ_WRITE_TOKEN`
  // は Vercel 外のコード用の長期固定 token である。どちらでも SDK は認証できるので、token だけを
  // 見ると完全に設定済みのデプロイまで起動拒否してしまう。
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    return true;
  }
  // store がなければデプロイは short を次の要求で消える `/tmp` に書き、何も配信しないパスを
  // player へ渡す。パイプライン完走後に初めて 404 になるので、先に失敗を伝える。
  if (process.env.VERCEL) {
    throw new Error(
      "No Blob store is attached (neither BLOB_STORE_ID nor BLOB_READ_WRITE_TOKEN is set). Create a public Blob store in the Vercel dashboard and connect it to this project; a deployment has nowhere else to keep a finished short.",
    );
  }
  return false;
};

// project slug は disk path component と Blob path prefix の両方になる。filename より意図して
// 狭くすることで、削除時に要求が指したプロジェクトの外へ決して出られない。
const PROJECT_SLUG = /^[a-zA-Z0-9-]+$/;

export const isProjectSlug = (slug: string) => PROJECT_SLUG.test(slug);

/** ローカルから Blob へ書くには、OIDC ではなく長期 token が必要になる。 */
export const hasBlobWriteToken = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

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
};

/** `projects/<slug>/manifest.json` から `<slug>` を得る。 */
const slugOf = (pathname: string) => pathname.split("/")[1] ?? pathname;

const publishToBlob = async (
  slug: string,
  manifest: Manifest,
  {
    existingFiles = new Map<string, string>(),
    publishManifest = true,
  }: {
    existingFiles?: ReadonlyMap<string, string>;
    publishManifest?: boolean;
  } = {},
) => {
  const { put } = await import("@vercel/blob");
  const dir = paths.projectDir(slug);

  // Promise.all ではなく直列にする。長い台本では upload が十数件になり、file descriptor の
  // 予算は同時実行中のすべての invocation で共有されるためである。
  for (const scene of manifest.scenes) {
    const name = path.basename(scene.audioSrc);
    const pathname = `projects/${slug}/${name}`;
    const existingUrl = existingFiles.get(pathname);
    if (existingUrl) {
      scene.audioSrc = existingUrl;
      continue;
    }
    const { url } = await put(pathname, fs.createReadStream(path.join(dir, name)), {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
      // これがないとナレーションに cache-control が付かず、端末は swipe ごとに各 clip を
      // 再取得し、再生は download との競争になる。パスはすでに不変のファイルを指している。
      cacheControlMaxAge: 31536000,
    });
    scene.audioSrc = url;
  }

  if (!publishManifest) {
    return existingFiles.get(`projects/${slug}/manifest.json`) ?? "";
  }

  // 指す音声がすべて読めるようになってから、最後に upload する。
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
 * 新規作成したプロジェクトを player が読める状態にし、feed が渡すべきアドレスを返す。
 */
export const publishProject = async (
  slug: string,
  manifest: Manifest,
): Promise<string> =>
  usingBlob() ? publishToBlob(slug, manifest) : localManifestSrc(slug);

type BlobSyncFile = {
  pathname: string;
  file: string;
  size: number;
};

export type BlobSyncPlan = {
  slug: string;
  files: BlobSyncFile[];
  missingFiles: BlobSyncFile[];
  manifest: Manifest;
};

const localProjectsForBlobSync = (): Omit<BlobSyncPlan, "missingFiles">[] => {
  if (!fs.existsSync(paths.projects)) {
    return [];
  }

  return fs.readdirSync(paths.projects, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || !isProjectSlug(entry.name)) {
      return [];
    }

    const slug = entry.name;
    const dir = paths.projectDir(slug);
    const manifestFile = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestFile)) {
      return [];
    }

    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8")) as Manifest;
    const audioFiles = new Map<string, BlobSyncFile>();
    for (const scene of manifest.scenes) {
      const name = path.basename(scene.audioSrc);
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) {
        throw new Error(`Audio file is missing: ${file}`);
      }
      const pathname = `projects/${slug}/${name}`;
      audioFiles.set(pathname, { pathname, file, size: fs.statSync(file).size });
    }

    const manifestPathname = `projects/${slug}/manifest.json`;
    return [{
      slug,
      manifest,
      files: [
        ...audioFiles.values(),
        {
          pathname: manifestPathname,
          file: manifestFile,
          size: fs.statSync(manifestFile).size,
        },
      ],
    }];
  });
};

/** Blob の全ページを読む。同期漏れが件数の増加で復活しないようにする。 */
export const listBlobFiles = async (): Promise<Map<string, string>> => {
  const { list } = await import("@vercel/blob");
  const files = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: "projects/", cursor });
    for (const blob of page.blobs) {
      files.set(blob.pathname, blob.url);
    }
    cursor = page.cursor;
    if (!page.hasMore) {
      break;
    }
  } while (cursor);

  return files;
};

/** ローカルの project と Blob の pathname を比べ、まだないファイルだけを返す。 */
export const planBlobSync = (
  remoteFiles: ReadonlyMap<string, string> = new Map(),
): BlobSyncPlan[] =>
  localProjectsForBlobSync().map((project) => ({
    ...project,
    missingFiles: project.files.filter((file) => !remoteFiles.has(file.pathname)),
  }));

export type BlobSyncResult = {
  uploaded: BlobSyncPlan[];
  failures: { slug: string; error: Error }[];
};

/**
 * ローカル生成物で Blob を補完する。
 *
 * 個々の project は独立しているため、一つの壊れた音声で他の完成品まで配信不能にしない。
 * ただし失敗を成功として push を進めると本番 feed が欠けるため、呼び出し元には最後に失敗を返す。
 */
export const syncProjectsToBlob = async (): Promise<BlobSyncResult> => {
  const remoteFiles = await listBlobFiles();
  const plans = planBlobSync(remoteFiles);
  const uploaded: BlobSyncPlan[] = [];
  const failures: BlobSyncResult["failures"] = [];

  for (const plan of plans) {
    if (plan.missingFiles.length === 0) {
      continue;
    }
    try {
      // publishToBlob は player 用 URL を scene へ入れる。ローカル再生用 manifest まで絶対 URL に
      // 変えると staticFile() の前提が壊れるため、同期専用に JSON として複製する。
      await publishToBlob(plan.slug, structuredClone(plan.manifest), {
        existingFiles: remoteFiles,
        publishManifest: plan.missingFiles.some(
          (file) => file.pathname === `projects/${plan.slug}/manifest.json`,
        ),
      });
      uploaded.push(plan);
    } catch (error) {
      failures.push({
        slug: plan.slug,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { uploaded, failures };
};

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

  // short ごとに 1 fetch。この規模なら十分で、ずれる可能性のある index ではなく manifest 自体から
  // feed を導ける。リストが長くなったら単一の index blob に替える。
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

/** 完成した short を新しい順に返す。Web app が scroll する feed。 */
export const listShorts = async (): Promise<ShortSummary[]> =>
  usingBlob() ? listFromBlob() : listFromDisk();

const deleteFromDisk = async (slug: string) => {
  // path を構築する前に、意図して slug の検証を済ませる。
  const dir = paths.projectDir(slug);
  if (!fs.existsSync(dir)) {
    // 存在しないプロジェクトは client error。成功と返すと、タイプミスと実際に行われた不可逆な
    // 削除を区別できなくなる。
    throw new ProjectDeleteError("project not found", 404);
  }
  await fs.promises.rm(dir, { recursive: true });
};

const deleteFromBlob = async (slug: string) => {
  const { del, list } = await import("@vercel/blob");
  // 末尾スラッシュにより、`lesson` のような有効 slug が別プロジェクトの `lesson-two` の
  // ファイルまで一致させることを防ぐ。
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
    // disk 側の意味と合わせる。古い card や誤入力 slug を、起きなかった削除として成功報告せず
    // 呼び出し元が見つけられるようにする。
    throw new ProjectDeleteError("project not found", 404);
  }

  // manifest.json だけでなくプロジェクト prefix 全体を列挙し、全シーンのナレーションと
  // 将来のプロジェクト専用補助ファイルも削除する。
  await del(blobs.map((blob) => blob.url));
};

/** 生成した short 1 本と所属するすべてのファイルを削除する。 */
export const deleteProject = async (slug: string): Promise<void> => {
  assertDeletableSlug(slug);
  return usingBlob() ? deleteFromBlob(slug) : deleteFromDisk(slug);
};
