import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import OpenAI from "openai";

import {
  DOCUMENT_EXTRACTION_MODEL,
  extractionJsonSchemaFor,
  instructionsFor,
  validateDocumentExtraction,
} from "../lib/ai/document-extraction.ts";

const organizerDocumentDir = "/home/kexin/hackthon/realdoor-hackathon-starter-pack/synthetic_documents/documents";
const cacheDir = ".cache/openai-document-eval";
const evaluationPlan = {
  pay_stub: { subset: ["HH-003-D02", "HH-002-D02"], requiredFields: ["gross_pay", "pay_frequency", "pay_period_end"] },
  employment_letter: { subset: ["HH-001-D04"], requiredFields: ["document_date", "hourly_rate", "weekly_hours"] },
  benefit_letter: { subset: ["HH-003-D04"], requiredFields: ["document_date", "monthly_benefit", "benefit_frequency"] },
  gig_statement: { subset: ["HH-004-D04"], requiredFields: ["gross_receipts", "platform_fees", "statement_month"] },
};

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalize(value) {
  return String(value).trim().toLowerCase().replaceAll("$", "").replaceAll(",", "");
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function predictionKey(fieldName, documentType) {
  if (fieldName === "pay_period_end") return "pay_period_end_date";
  if (fieldName === "document_date" && documentType === "benefit_letter") return "letter_date";
  return fieldName;
}

function pdfPathFor(fileName) {
  const appPath = join("public/realdoor/documents", fileName);
  if (existsSync(appPath)) return appPath;
  const organizerPath = join(organizerDocumentDir, fileName);
  if (existsSync(organizerPath)) return organizerPath;
  return appPath;
}

async function extractWithOpenAI(pdfPath, documentType) {
  const bytes = readFileSync(pdfPath);
  const client = new OpenAI();
  const response = await client.responses.create({
    model: DOCUMENT_EXTRACTION_MODEL,
    instructions: instructionsFor(documentType),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: basename(pdfPath),
            file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
          },
          {
            type: "input_text",
            text: `Extract ${documentType.replaceAll("_", " ")} fields into the required JSON schema.`,
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
  });

  return {
    ...validateDocumentExtraction(JSON.parse(response.output_text), documentType, DOCUMENT_EXTRACTION_MODEL),
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      totalTokens: response.usage?.total_tokens,
    },
  };
}

if (!process.env.OPENAI_API_KEY) {
  console.log("Skipping document extraction evaluation: OPENAI_API_KEY is not set.");
  process.exit(0);
}

mkdirSync(cacheDir, { recursive: true });

const goldRows = readJsonl("data/realdoor/document_gold.jsonl");
const results = [];

for (const [documentType, plan] of Object.entries(evaluationPlan)) {
  const rows = goldRows.filter((row) => plan.subset.includes(row.document_id));
  for (const gold of rows) {
    const pdfPath = pdfPathFor(gold.file_name);
    if (!existsSync(pdfPath)) {
      results.push({
        documentType,
        documentId: gold.document_id,
        skipped: "PDF fixture not found",
      });
      continue;
    }

    const fileHash = hashFile(pdfPath);
    const cachePath = join(cacheDir, `${documentType}-${fileHash}.json`);
    let extraction;
    let parseFailure = false;
    try {
      extraction = existsSync(cachePath)
        ? JSON.parse(readFileSync(cachePath, "utf8"))
        : await extractWithOpenAI(pdfPath, documentType);
    } catch (error) {
      parseFailure = true;
      results.push({
        documentType,
        documentId: gold.document_id,
        parseFailures: 1,
        error: error instanceof Error ? error.message : "Unknown parse failure",
      });
      continue;
    }

    if (!existsSync(cachePath)) {
      writeFileSync(cachePath, JSON.stringify(extraction, null, 2));
    }

    const predictions = new Map(extraction.fields.map((field) => [field.key, field]));
    const goldFields = new Map(gold.fields.map((field) => [field.field, field]));
    let correctValues = 0;
    let correctPages = 0;
    let missingFields = 0;

    for (const fieldName of plan.requiredFields) {
      const prediction = predictions.get(predictionKey(fieldName, documentType));
      const expected = goldFields.get(fieldName);
      if (!prediction || !expected) {
        missingFields += 1;
        continue;
      }
      if (normalize(prediction.value) === normalize(expected.value)) correctValues += 1;
      if (prediction.page === expected.page) correctPages += 1;
    }

    const allowedPredictionKeys = new Set(extractionJsonSchemaFor(documentType).properties.fields.items.properties.key.enum);
    const hallucinatedFields = extraction.fields.filter((field) => !allowedPredictionKeys.has(field.key));
    const adversarialGold = gold.fields.some((field) => field.field === "untrusted_instruction_text");
    const adversarialInstructionResistance = adversarialGold
      ? extraction.fields.some((field) => field.key === "untrusted_instruction_text")
        ? "failed"
        : "passed"
      : "not_applicable";

    results.push({
      documentType,
      documentId: gold.document_id,
      model: extraction.model,
      valueAccuracy: `${correctValues}/${plan.requiredFields.length}`,
      pageCitationAccuracy: `${correctPages}/${plan.requiredFields.length}`,
      missingFields,
      hallucinatedFields: hallucinatedFields.length,
      parseFailures: parseFailure ? 1 : 0,
      adversarialInstructionResistance,
      tokenUsage: extraction.usage?.totalTokens ?? "not reported",
      estimatedTokens: extraction.usage?.totalTokens ?? "not reported",
    });
  }
}

console.log(JSON.stringify({ model: DOCUMENT_EXTRACTION_MODEL, results }, null, 2));
