import {
  hasBlobWriteToken,
  listBlobFiles,
  planBlobSync,
  syncProjectsToBlob,
} from "./storage.js";

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const totalsOf = (plans: ReturnType<typeof planBlobSync>) => ({
  projects: plans.filter((plan) => plan.missingFiles.length > 0).length,
  files: plans.reduce((total, plan) => total + plan.missingFiles.length, 0),
  bytes: plans.reduce(
    (total, plan) =>
      total + plan.missingFiles.reduce((sum, file) => sum + file.size, 0),
    0,
  ),
});

const printTotals = (label: string, plans: ReturnType<typeof planBlobSync>) => {
  const { projects, files, bytes } = totalsOf(plans);
  console.log(`${label}: ${projects} projects / ${files} files / ${formatBytes(bytes)}`);
};

const runDry = async () => {
  // token のない端末でも、ローカルの全生成物を初回 upload 候補として確認できるようにする。
  const remoteFiles = hasBlobWriteToken() ? await listBlobFiles() : new Map<string, string>();
  const plans = planBlobSync(remoteFiles);
  for (const plan of plans) {
    if (plan.missingFiles.length === 0) {
      continue;
    }
    console.log(
      `${plan.slug}: ${plan.missingFiles.map((file) => file.pathname).join(", ")}`,
    );
  }
  printTotals("Dry run", plans);
};

const main = async () => {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  if (dryRun) {
    await runDry();
    return;
  }

  // BLOB_STORE_ID の OIDC は Vercel の execution environment が発行する。ローカルでは長期
  // token がない限り認証できないため、pre-push を失敗させず何もせず終える。
  if (!hasBlobWriteToken()) {
    return;
  }

  const result = await syncProjectsToBlob();
  printTotals("Uploaded", result.uploaded);
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
