import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/remotion/index.ts");
Config.setRspack(true);

/**
 * `src/` の server 側コードは相対 import に必ず `.js` を書く（deploy 先の serverless は素の
 * Node ESM で走り、拡張子を補わないため。scripts/check-module-specifiers.ts 参照）。
 * `formulaLines.ts` のように Remotion と共有するファイルもその規則に従うので、bundler 側で
 * `.js` を TypeScript の実体へ解決させる。web は vite が同じ変換を最初から行う。
 */
Config.overrideRspackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
}));
