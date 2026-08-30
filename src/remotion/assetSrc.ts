import { staticFile } from "remotion";

/**
 * Resolves a manifest's asset path for whichever way the project was published.
 *
 * `staticFile()` only prefixes a path with the static base, so handing it the
 * absolute URL a deployed build gets back from blob storage would produce
 * `/https:/…`. Locally the manifest still carries paths relative to `public/`,
 * which is exactly what `staticFile()` is for — so both spellings have to work,
 * and the same manifest stays playable wherever it is read from.
 */
export const assetSrc = (src: string) =>
  /^https?:\/\//.test(src) ? src : staticFile(src);
