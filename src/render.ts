import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { paths } from "./config";
import { manifestSrc } from "./pipeline/buildManifest";

export const COMPOSITION_ID = "StudyShort";

/** Shells out to `remotion render`, which reads `remotion.config.ts`. */
export const renderVideo = ({ slug }: { slug: string }) => {
  const dir = paths.projectDir(slug);
  if (!fs.existsSync(path.join(dir, "manifest.json"))) {
    throw new Error(`No manifest for "${slug}". Run \`npm run generate\` first.`);
  }

  // Passing props as a file avoids shell-quoting the JSON.
  const propsPath = path.join(dir, "props.json");
  fs.writeFileSync(
    propsPath,
    JSON.stringify({ manifestSrc: manifestSrc(slug) }),
  );

  fs.mkdirSync(paths.out, { recursive: true });
  const outPath = path.join(paths.out, `${slug}.mp4`);

  const result = spawnSync(
    "npx",
    [
      "remotion",
      "render",
      COMPOSITION_ID,
      outPath,
      `--props=${propsPath}`,
      "--log=info",
    ],
    { stdio: "inherit", cwd: paths.root },
  );

  if (result.status !== 0) {
    throw new Error(`remotion render exited with code ${result.status}`);
  }

  return outPath;
};

const isEntryPoint =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (isEntryPoint) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npm run render -- <slug>");
    console.error(
      `Available: ${fs.existsSync(paths.projects) ? fs.readdirSync(paths.projects).join(", ") : "(none)"}`,
    );
    process.exit(1);
  }
  console.log(`✅ ${renderVideo({ slug })}`);
}
