import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config, paths } from "./config.js";
import { isProjectSlug } from "./storage.js";

const ledgerFile = path.join(paths.root, ".railway-synced.json");

type Project = {
  slug: string;
  files: number;
  bytes: number;
};

type CommandResult = {
  code: number | null;
  error?: Error;
  stdout?: string;
  stderr: string;
};

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const commandError = (label: string, result: CommandResult) => {
  const detail = result.error?.message ?? result.stderr.trim();
  return new Error(
    detail ? `${label}: ${detail}` : `${label} exited with code ${result.code ?? "unknown"}`,
  );
};

const waitFor = (child: ReturnType<typeof spawn>): Promise<CommandResult> =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let error: Error | undefined;

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (cause: Error) => {
      error = cause;
    });
    child.on("close", (code) => {
      resolve({ code, error, stdout, stderr });
    });
  });

const waitForStderr = (child: ReturnType<typeof spawn>): Promise<CommandResult> =>
  new Promise((resolve) => {
    let stderr = "";
    let error: Error | undefined;

    // tar の stdout はアーカイブ本体なので、文字列へ復号せず pipe のバイト列を保つ。
    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (cause: Error) => {
      error = cause;
    });
    child.on("close", (code) => {
      resolve({ code, error, stderr });
    });
  });

const run = async (command: string, args: string[]) => {
  const result = await waitFor(spawn(command, args));
  if (result.error || result.code !== 0) {
    throw commandError(command, result);
  }
  return result.stdout ?? "";
};

const sizeOf = (dir: string): Omit<Project, "slug"> => {
  let files = 0;
  let bytes = 0;

  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(file).size;
      }
    }
  };

  visit(dir);
  return { files, bytes };
};

const localProjects = (): Project[] => {
  if (!fs.existsSync(paths.projects)) {
    return [];
  }

  return fs.readdirSync(paths.projects, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || !isProjectSlug(entry.name)) {
      return [];
    }
    return [{ slug: entry.name, ...sizeOf(path.join(paths.projects, entry.name)) }];
  });
};

const readLedger = () => {
  if (!fs.existsSync(ledgerFile)) {
    return new Set<string>();
  }

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(ledgerFile, "utf-8"));
    if (!Array.isArray(parsed) || !parsed.every((slug) => typeof slug === "string")) {
      throw new Error("slug の配列ではありません");
    }
    return new Set(parsed.filter(isProjectSlug));
  } catch (error) {
    // 台帳は最適化用の端末ローカル状態なので、壊れても push 自体を止めない。
    console.error(
      `WARNING: .railway-synced.json を読めないため空の台帳として続行します: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Set<string>();
  }
};

const writeLedger = (ledger: ReadonlySet<string>) => {
  const temporary = `${ledgerFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify([...ledger].sort(), null, 2)}\n`);
  fs.renameSync(temporary, ledgerFile);
};

const remoteSlugs = async (host: string) => {
  const stdout = await run("ssh", [
    host,
    "if [ -d /data/public/projects ]; then find /data/public/projects -mindepth 1 -maxdepth 1 -type d -printf '%f\\n'; fi",
  ]);
  return new Set(stdout.split("\n").filter(isProjectSlug));
};

const remoteBytes = async (host: string, slug: string) => {
  const stdout = await run("ssh", [
    host,
    `find /data/public/projects/${slug} -type f -printf '%s\\n'`,
  ]);
  return stdout.split("\n").reduce((total, raw) => {
    if (!raw) {
      return total;
    }
    const bytes = Number(raw);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`remote size is invalid: ${raw}`);
    }
    return total + bytes;
  }, 0);
};

const transfer = async (host: string, project: Project) => {
  const tar = spawn(
    "tar",
    ["cf", "-", "--no-xattrs", "-C", paths.projects, project.slug],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  const ssh = spawn("ssh", [
    host,
    "mkdir -p /data/public/projects && tar xf - -C /data/public/projects",
  ]);
  const tarDone = waitForStderr(tar);
  const sshDone = waitFor(ssh);

  // 接続断で stdin が先に閉じても tar 側の例外を未処理にせず、両方の終了結果を集める。
  ssh.stdin?.on("error", () => undefined);
  tar.stdout?.pipe(ssh.stdin!);

  const [tarResult, sshResult] = await Promise.all([tarDone, sshDone]);
  if (tarResult.error || tarResult.code !== 0) {
    throw commandError("tar", tarResult);
  }
  if (sshResult.error || sshResult.code !== 0) {
    throw commandError("ssh", sshResult);
  }

  const bytes = await remoteBytes(host, project.slug);
  if (bytes !== project.bytes) {
    throw new Error(
      `byte count differs (local ${project.bytes}, Railway ${bytes})`,
    );
  }
};

const parseArgs = () => {
  const force = new Set<string>();
  let dryRun = false;

  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--force") {
      const slug = process.argv[index + 1];
      if (!slug || !isProjectSlug(slug)) {
        throw new Error("--force には ^[a-zA-Z0-9-]+$ を満たす slug が必要です");
      }
      force.add(slug);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  return { dryRun, force };
};

const main = async () => {
  const { dryRun, force } = parseArgs();
  const projects = localProjects();
  const local = new Map(projects.map((project) => [project.slug, project]));
  for (const slug of force) {
    if (!local.has(slug)) {
      console.error(`WARNING: --force の対象がローカルにありません: ${slug}`);
    }
  }

  const host = config.railwaySshHost;
  let existing: Set<string>;
  try {
    existing = await remoteSlugs(host);
  } catch (error) {
    console.error(
      `WARNING: Railway の状態を確認できなかったため同期していません: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("手動で再実行: npm run sync:railway");
    return;
  }

  const ledger = readLedger();
  const incomplete = new Set<string>();
  for (const project of projects) {
    if (existing.has(project.slug)) {
      try {
        if ((await remoteBytes(host, project.slug)) === project.bytes) {
          ledger.add(project.slug);
        } else {
          incomplete.add(project.slug);
        }
      } catch (error) {
        console.error(
          `WARNING: Railway 上の ${project.slug} を検証できなかったため同期していません: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error("手動で再実行: npm run sync:railway");
        return;
      }
    }
  }

  const targets = projects.filter((project) =>
    force.has(project.slug) ||
    incomplete.has(project.slug) ||
    (!existing.has(project.slug) && !ledger.has(project.slug)),
  );
  if (dryRun) {
    for (const project of targets) {
      console.log(project.slug);
    }
    console.log(`Dry run: ${targets.length} projects`);
    return;
  }

  const uploaded: Project[] = [];
  const failures: { slug: string; error: Error }[] = [];
  for (const project of targets) {
    try {
      await transfer(host, project);
      ledger.add(project.slug);
      uploaded.push(project);
    } catch (error) {
      failures.push({
        slug: project.slug,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  try {
    writeLedger(ledger);
  } catch (error) {
    console.error(
      `WARNING: 同期台帳を書けなかったため次回に再確認します: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const files = uploaded.reduce((total, project) => total + project.files, 0);
  const bytes = uploaded.reduce((total, project) => total + project.bytes, 0);
  console.log(`Uploaded: ${uploaded.length} projects / ${files} files / ${formatBytes(bytes)}`);
  if (failures.length > 0) {
    console.error(`WARNING: ${failures.length} project(s) were not synchronized:`);
    for (const failure of failures) {
      console.error(`  ${failure.slug}: ${failure.error.message}`);
    }
    console.error("手動で再実行: npm run sync:railway");
  }
};

void main().catch((error: unknown) => {
  console.error(
    `WARNING: Railway 同期を実行できませんでした: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error("手動で再実行: npm run sync:railway");
});
