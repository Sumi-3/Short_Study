import { build } from "esbuild";

/**
 * Replaces the whisper caption path with a stub.
 *
 * `CAPTION_SOURCE=whisper` cannot run on a deployment at all — whisper.cpp
 * needs a native build and a 1.5GB model. Left in, its `import("ffmpeg-static")`
 * would still be followed by the file tracer and drag a 78MB binary into the
 * bundle for a branch that can never be taken.
 */
const dropWhisper = {
  name: "drop-whisper",
  setup(build) {
    build.onResolve({ filter: /whisperCaptions$/ }, () => ({
      path: "whisper-unavailable",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export const captionsFromWhisper = () => {
        throw new Error(
          "CAPTION_SOURCE=whisper is not available in a deployed build — use the default 'tts'.",
        );
      };`,
    }));
  },
};

/**
 * Bundles each Vercel Function into one self-contained file.
 *
 * Vercel transpiles TypeScript per file rather than bundling it, so the
 * `import "../pipeline/run"` in a handler survives into the deployed JavaScript
 * — and because this package is `"type": "module"`, Node reads it as ESM, where
 * a relative specifier without an extension is not resolvable at all. It works
 * locally only because tsx and Vite fill the extension in. Bundling removes
 * every relative import instead of spelling 142 of them out across the repo.
 *
 * `packages: "external"` keeps node_modules out of the bundle: bare specifiers
 * resolve fine under ESM, and inlining them would break the ones with native
 * or optional dependencies.
 */
await build({
  entryPoints: ["src/functions/generate.ts", "src/functions/shorts.ts"],
  outdir: "api-build",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  plugins: [dropWhisper],
  logLevel: "info",
});
