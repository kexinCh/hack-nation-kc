import OpenAI from "openai";

const model = process.env.OPENAI_DOCUMENT_MODEL ?? process.env.OPENAI_PAYSTUB_MODEL ?? "gpt-5-nano";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return errorResponse("OPENAI_API_KEY is not configured on the server.", 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const record = payload as {
    householdSize?: number;
    incomeSources?: string[];
    documents?: Array<{ title: string; fileName: string; status: string }>;
    confirmedFacts?: Array<{ label: string; value: string | number; documentTitle: string }>;
    unresolvedItems?: string[];
  };

  if (!Array.isArray(record.documents) || !Array.isArray(record.confirmedFacts)) {
    return errorResponse("Application summary requires documents and confirmed facts.", 400);
  }

  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model,
      instructions: [
        "Write a concise factual reviewer summary for an affordable-housing application preparation bundle.",
        "Use only the provided renter-confirmed facts, document titles, document statuses, household size, and income source labels.",
        "Clearly mention unresolved items when provided.",
        "Do not make eligibility, qualification, approval, denial, ranking, prioritization, probability, or legal conclusions.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(record),
            },
          ],
        },
      ],
    });

    return Response.json({ summary: response.output_text.slice(0, 1800), model });
  } catch {
    return errorResponse("Application summary generation failed.", 502);
  }
}
