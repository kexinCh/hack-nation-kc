import type { ApplicationSession, DocumentRecord, RenterConfirmation } from "./types.ts";

function confirmedFieldsForDocument(session: ApplicationSession, documentId: string) {
  return session.confirmations.filter(
    (field) =>
      field.documentId === documentId &&
      (field.status === "confirmed" || field.status === "corrected"),
  );
}

function fieldList(fields: RenterConfirmation[]) {
  if (fields.length === 0) {
    return "No fields have been confirmed or corrected yet.";
  }

  return fields.map((field) => `${field.label}: ${String(field.value)}`).join("; ");
}

export function describeDocument(session: ApplicationSession, document: DocumentRecord) {
  const fields = confirmedFieldsForDocument(session, document.id);
  const fieldCount = fields.length;
  const typeLabel = document.type.replaceAll("_", " ");

  return [
    `${document.title}`,
    `Official document ID: ${document.sourceDocumentId}`,
    `File: ${document.fileName}`,
    document.isUploaded
      ? `This is a renter-uploaded ${typeLabel} PDF stored only in this browser session.`
      : `This is a bundled official synthetic ${typeLabel} from the RealDoor challenge pack.`,
    `It appears in the preparation bundle because the renter selected it for review in this browser-local session.`,
    `Confirmed or corrected fields (${fieldCount}): ${fieldList(fields)}`,
    "This description is generated from a deterministic template. It is not AI-generated text.",
  ].join("\n");
}

export function describeDocuments(session: ApplicationSession) {
  if (session.documents.length === 0) {
    return "No synthetic documents have been selected for this session.";
  }

  return session.documents.map((document) => describeDocument(session, document)).join("\n\n---\n\n");
}
