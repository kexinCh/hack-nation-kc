import type {
  DocumentExtractionResult,
  DocumentRecord,
  DocumentType,
  ExtractedFieldKey,
  FieldValue,
  RenterConfirmation,
} from "./types.ts";

type IdentityField = {
  key: ExtractedFieldKey;
  value: FieldValue;
};

function compact(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function valueMap(fields: IdentityField[]) {
  return new Map(fields.map((field) => [field.key, String(field.value).trim().toLowerCase()]));
}

export function buildDocumentIdentity(documentType: DocumentType, fields: IdentityField[]) {
  const values = valueMap(fields);
  if (documentType === "pay_stub" || documentType === "employment_letter") {
    return [
      documentType,
      compact(values.get("employee_name") ?? values.get("person_name")),
      compact(values.get("employer_name") ?? values.get("employer")),
      compact(values.get("pay_period_start")),
      compact(values.get("pay_period_end_date")),
      compact(values.get("pay_date")),
    ].join("|");
  }
  if (documentType === "benefit_letter") {
    return [
      documentType,
      compact(values.get("person_name")),
      compact(values.get("benefit_type")),
      compact(values.get("letter_date")),
      compact(values.get("monthly_benefit") ?? values.get("benefit_amount")),
    ].join("|");
  }
  if (documentType === "gig_statement") {
    return [
      documentType,
      compact(values.get("person_name")),
      compact(values.get("statement_month")),
      compact(values.get("gross_receipts")),
    ].join("|");
  }
  return "";
}

export function findDuplicateUploadedDocument(
  documents: DocumentRecord[],
  confirmations: RenterConfirmation[],
  candidate: {
    actualDocumentType: DocumentType;
    fileHash: string;
    contentHash?: string;
    extraction?: DocumentExtractionResult;
  },
) {
  if (documents.length === 0) return undefined;
  const identity = candidate.extraction
    ? buildDocumentIdentity(candidate.extraction.documentType, candidate.extraction.fields)
    : "";

  return documents.find((document) => {
    if (document.fileHash && document.fileHash === candidate.fileHash) return true;
    if (document.uploadHash && document.uploadHash === candidate.fileHash) return true;
    if (candidate.contentHash && document.contentHash === candidate.contentHash) return true;
    if (!identity || document.type !== candidate.actualDocumentType) return false;

    const documentIdentity = buildDocumentIdentity(
      document.type,
      confirmations
        .filter((confirmation) => confirmation.documentId === document.id)
        .map((confirmation) => ({
          key: confirmation.fieldKey,
          value: confirmation.value ?? confirmation.originalValue,
        })),
    );
    return documentIdentity === identity;
  });
}
