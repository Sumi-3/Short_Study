import { isModelId } from "../src/models.js";
import { extractProblem, isExtractImage } from "../src/pipeline/extractProblem.js";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isExtractImage(body.image)) {
      return Response.json({ error: "JPEG image is required" }, { status: 400 });
    }

    const topic = await extractProblem(
      body.image,
      isModelId(body.model) ? body.model : undefined,
    );
    if (!topic) {
      return Response.json({ error: "問題文を読み取れませんでした。画像を調整して再試行してください。" }, { status: 422 });
    }
    return Response.json({ topic });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
