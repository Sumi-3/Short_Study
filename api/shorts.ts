import { listShorts } from "../src/storage.js";

export default async function handler(): Promise<Response> {
  return Response.json(await listShorts(), {
    headers: { "cache-control": "no-store" },
  });
}
