// Route entry only. The implementation is bundled from src/functions/generate.ts
// into api-build/ by `npm run api:build` — see scripts/build-api.mjs for why it
// cannot just be imported from src/ directly.
//
// The `.js` extension is required: this is the one relative import Vercel's
// per-file transpile leaves for Node to resolve under ESM.
// @ts-ignore — generated at build time, absent in a fresh checkout.
export { default } from "../api-build/generate.js";
