import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 20;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return errorResponse("OPENAI_API_KEY is not configured on the server.", 503);
  }

  const payload = (await request.json().catch(() => undefined)) as
    | {
        documentTitle?: string;
        fileName?: string;
        confirmedFields?: Array<{ label: string; value: string | number; status: string }>;
        unresolvedFields?: string[];
      }
    | undefined;

  if (!payload || !Array.isArray(payload.confirmedFields)) {
    return errorResponse("Confirmed fields are required.", 400);
  }

  const client = new OpenAI();

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_PAYSTUB_MODEL ?? "gpt-5-nano",
      instructions: [
        "Write a concise reviewer-facing description of one uploaded application document.",
        "Use only the confirmed or corrected facts provided in JSON.",
        "Mention unresolved fields if any are provided.",
        "Do not provide legal conclusions, eligibility decisions, approval decisions, denial decisions, ranking, prioritization, or probability.",
        "Return plain text only, no markdown.",
      ].join("\n"),
      input: JSON.stringify({
        documentTitle: payload.documentTitle,
        fileName: payload.fileName,
        confirmedFields: payload.confirmedFields,
        unresolvedFields: payload.unresolvedFields ?? [],
      }),
    });

    return Response.json({
      description: response.output_text.slice(0, 1200),
      model: process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_PAYSTUB_MODEL ?? "gpt-5-nano",
    });
  } catch {
    return errorResponse("Document description generation failed.", 502);
  }
}
