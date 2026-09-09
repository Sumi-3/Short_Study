import { staticFile } from "remotion";

/**
 * 配信形態を問わず manifest の asset path を解決する。
 *
 * `staticFile()` はパスに static base を足すだけなので、デプロイ済みビルドが blob storage
 * から受け取る絶対 URL を渡すと `/https:/…` になってしまう。一方ローカルの manifest は
 * `public/` 相対パスのままで、これはまさに `staticFile()` 用である。どちらの表記も
 * 動かし、同じ manifest を読む場所にかかわらず再生可能にする必要がある。
 */
export const assetSrc = (src: string) =>
  /^https?:\/\//.test(src) ? src : staticFile(src);
