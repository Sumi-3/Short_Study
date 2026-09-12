import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";
import { hasBlobWriteToken, isProjectSlug, listBlobFiles } from "./storage.js";
import type { Manifest } from "./types.js";

type BlobProject = {
  slug: string;
  manifestUrl: string;
};

type ImportedProject = {
  slug: string;
  files: number;
  bytes: number;
};

type ImportResult = {
  imported: ImportedProject[];
  failures: { slug: string; error: Error }[];
};

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const blobProjects = (files: ReadonlyMap<string, string>): BlobProject[] => {
  const projects = new Map<string, Map<string, string>>();

  for (const [pathname, url] of files) {
    const [, slug, ...parts] = pathname.split("/");
    if (!slug || parts.length === 0 || !isProjectSlug(slug)) {
      continue;
    }
    const project = projects.get(slug) ?? new Map<string, string>();
    project.set(parts.join("/"), url);
    projects.set(slug, project);
  }

  return [...projects.entries()].flatMap(([slug, filesForProject]) => {
    const manifestUrl = filesForProject.get("manifest.json");
    return manifestUrl ? [{ slug, manifestUrl }] : [];
  });
};

const fetchOrThrow = async (url: string, label: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label}: ${response.status} ${response.statusText}`);
  }
  return response;
};

const audioName = (audioSrc: string) => {
  const name = path.basename(new URL(audioSrc).pathname);
  if (!name || name === "." || name === path.sep) {
    throw new Error(`Invalid audio source: ${audioSrc}`);
  }
  return name;
};

const importProject = async (project: BlobProject) => {
  const manifestResponse = await fetchOrThrow(project.manifestUrl, "Manifest download failed");
  const manifest = (await manifestResponse.json()) as Manifest;
  const dir = paths.projectDir(project.slug);
  const importedFiles = new Set<string>();
  let importedBytes = 0;

  fs.mkdirSync(dir, { recursive: true });
  // manifest が見える時点で player が音声を取りに行くため、参照先を先に揃える。
  for (const scene of manifest.scenes) {
    const name = audioName(scene.audioSrc);
    const destination = path.join(dir, name);
    if (!importedFiles.has(name)) {
      const audioResponse = await fetchOrThrow(scene.audioSrc, `Audio download failed (${name})`);
      const audio = Buffer.from(await audioResponse.arrayBuffer());
      fs.writeFileSync(destination, audio);
      importedFiles.add(name);
      importedBytes += audio.length;
    }
    // Blob の絶対 URL は staticFile() で解決できないため、ディスク配信の URL に戻す。
    scene.audioSrc = `${paths.staticProject(project.slug)}/${name}`;
  }

  // 途中で失敗した project を完成品として一覧へ出さないため、最後にだけ置く。
  const manifestContents = JSON.stringify(manifest);
  fs.writeFileSync(path.join(dir, "manifest.json"), manifestContents);
  return {
    files: importedFiles.size + 1,
    bytes: importedBytes + Buffer.byteLength(manifestContents),
  };
};

const printTotals = (label: string, imported: ImportResult["imported"]) => {
  const files = imported.reduce((total, project) => total + project.files, 0);
  const bytes = imported.reduce((total, project) => total + project.bytes, 0);
  console.log(`${label}: ${imported.length} projects / ${files} files / ${formatBytes(bytes)}`);
};

const main = async () => {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  if (!hasBlobWriteToken()) {
    console.error("BLOB_READ_WRITE_TOKEN is required to import projects from Vercel Blob.");
    process.exitCode = 1;
    return;
  }

  const projects = blobProjects(await listBlobFiles()).filter(({ slug }) => {
    // mock は source tree の Player 用であり、永続 Volume の feed へ複製しない。
    return slug !== "mock" && !fs.existsSync(path.join(paths.projectDir(slug), "manifest.json"));
  });

  if (dryRun) {
    for (const { slug } of projects) {
      console.log(slug);
    }
    console.log(`Dry run: ${projects.length} projects`);
    return;
  }

  const result: ImportResult = { imported: [], failures: [] };
  for (const project of projects) {
    try {
      result.imported.push({
        slug: project.slug,
        ...(await importProject(project)),
      });
    } catch (error) {
      result.failures.push({
        slug: project.slug,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  printTotals("Imported", result.imported);
  for (const failure of result.failures) {
    console.error(`${failure.slug}: ${failure.error.message}`);
  }
  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
