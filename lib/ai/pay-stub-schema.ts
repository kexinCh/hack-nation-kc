import type { PayStubExtractionResult } from "@/lib/housing/types";
import {
  DOCUMENT_EXTRACTION_MODEL,
  DOCUMENT_MAX_BYTES,
  extractionJsonSchemaFor,
  validateDocumentExtraction,
} from "./document-extraction";

export const PAY_STUB_MAX_BYTES = DOCUMENT_MAX_BYTES;
export const PAY_STUB_MODEL = DOCUMENT_EXTRACTION_MODEL;
export const payStubExtractionJsonSchema = extractionJsonSchemaFor("pay_stub");

export function validatePayStubExtraction(value: unknown, model: string): PayStubExtractionResult {
  return validateDocumentExtraction(value, "pay_stub", model) as PayStubExtractionResult;
}
