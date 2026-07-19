import OpenAI from "openai";

import {
  DOCUMENT_EXTRACTION_MODEL,
  DOCUMENT_MAX_BYTES,
  extractionJsonSchemaFor,
  instructionsFor,
  isSupportedExtractionType,
  validateDocumentExtraction,
} from "@/lib/ai/document-extraction";
import type { DocumentType } from "@/lib/housing/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ErrorCode =
  | "MISSING_API_CONFIGURATION"
  | "INVALID_FORM_DATA"
  | "MISSING_FILE"
  | "INVALID_PDF"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_FAILURE"
  | "PARSE_FAILURE"
  | "VALIDATION_FAILURE"
  | "BUFFER_FAILURE";

function logExtractionFailure(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[document-extraction:${stage}] ${message}`);
}

function errorResponse(code: ErrorCode, message: string, status: number, stage: string) {
  return Response.json({ code, error: message, stage }, { status });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return errorResponse(
      "MISSING_API_CONFIGURATION",
      "OPENAI_API_KEY is not configured on the server.",
      503,
      "configuration",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logExtractionFailure("form-data", error);
    return errorResponse("INVALID_FORM_DATA", "Invalid multipart form data.", 400, "form-data");
  }

  const rawDocumentType = formData.get("documentType");
  const documentType = typeof rawDocumentType === "string" ? (rawDocumentType as DocumentType) : undefined;
  if (!documentType || !isSupportedExtractionType(documentType)) {
    return errorResponse(
      "UNSUPPORTED_DOCUMENT_TYPE",
      "This document type does not have a validated extraction schema.",
      400,
      "document-type",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("MISSING_FILE", "A PDF file is required.", 400, "file");
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return errorResponse("INVALID_PDF", "Only PDF documents are supported.", 415, "file-validation");
  }

  if (file.size <= 0 || file.size > DOCUMENT_MAX_BYTES) {
    return errorResponse(
      "INVALID_PDF",
      "PDF must be larger than 0 bytes and no more than 8 MB.",
      413,
      "file-validation",
    );
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 55_000);

  try {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      logExtractionFailure("buffer", error);
      return errorResponse("BUFFER_FAILURE", "PDF bytes could not be read.", 400, "buffer");
    }
    if (bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
      return errorResponse("INVALID_PDF", "The selected file is not a valid PDF.", 415, "pdf-signature");
    }
    const client = new OpenAI();
    let response;
    try {
      response = await client.responses.create(
        {
          model: DOCUMENT_EXTRACTION_MODEL,
          instructions: instructionsFor(documentType),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_file",
                  filename: file.name,
                  file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
                },
                {
                  type: "input_text",
                  text: `Expected upload category: ${documentType}. Classify the actual document type from the PDF, then extract fields for the actual type into the required JSON schema. Return no legal conclusions or housing decisions.`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: `${documentType}_extraction`,
              strict: true,
              schema: extractionJsonSchemaFor(documentType),
            },
          },
        },
        { signal: abortController.signal },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        logExtractionFailure("timeout", error);
        return errorResponse(
          "EXTRACTION_TIMEOUT",
          "OpenAI extraction timed out. Try a smaller or clearer PDF.",
          504,
          "openai",
        );
      }
      logExtractionFailure("openai", error);
      return errorResponse("EXTRACTION_FAILURE", "Document extraction failed.", 502, "openai");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.output_text);
    } catch (error) {
      logExtractionFailure("parse", error);
      return errorResponse("PARSE_FAILURE", "Extraction response could not be parsed.", 502, "parse");
    }

    let extraction;
    try {
      extraction = validateDocumentExtraction(parsed, documentType, DOCUMENT_EXTRACTION_MODEL);
    } catch (error) {
      logExtractionFailure("validation", error);
      return errorResponse("VALIDATION_FAILURE", "Extraction response failed validation.", 502, "validation");
    }

    return Response.json({
      ...extraction,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    });
  } catch (error) {
    logExtractionFailure("route", error);
    return errorResponse("EXTRACTION_FAILURE", "Document extraction failed.", 502, "route");
  } finally {
    clearTimeout(timeout);
  }
}
