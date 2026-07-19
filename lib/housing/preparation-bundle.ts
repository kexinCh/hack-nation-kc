import JSZip from "jszip";

import { frozenChecklist } from "./checklist.ts";
import { describeDocuments } from "./document-descriptions.ts";
import { canonicalScenario } from "./scenario.ts";
import { ruleCitations } from "./rules-2026.ts";
import type { ApplicationSession, CalculationResult, DocumentStatus } from "./types.ts";
import { getUploadedFile } from "../session/uploaded-file-registry.ts";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusDescriptions: Record<DocumentStatus, string> = {
  not_uploaded: "Not uploaded",
  file_selected: "File selected",
  uploading: "Uploading",
  extracting: "Extracting",
  available: "Available",
  added: "Added",
  needs_review: "Needs review",
  confirmed: "Confirmed",
  missing: "Missing",
  DO_NOT_HAVE:
    "Do not have. This item remains unresolved; ask the housing provider whether it is required or whether an alternative is accepted.",
  skipped: "Skipped for now",
  error: "Error",
  reupload_needed: "Re-upload needed",
};

function escapePdfText(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function createSimplePdf(title: string, body: string) {
  const lines = [title, "", ...body.split("\n")].flatMap((line) => {
    const max = 88;
    if (line.length <= max) return [line];
    const chunks = [];
    for (let index = 0; index < line.length; index += max) {
      chunks.push(line.slice(index, index + max));
    }
    return chunks;
  });
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 760 Td",
    "16 TL",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function buildReadinessSummary(session: ApplicationSession, calculation?: CalculationResult) {
  return [
    `Scenario: ${canonicalScenario.label}`,
    `Household ID: ${canonicalScenario.selectedHouseholdId}`,
    `Household size: ${session.setup.householdSize}`,
    `Readiness summary: ${calculation?.readinessStatus ?? "NEEDS_REVIEW"}`,
    "",
    "This preparation bundle organizes renter-confirmed information for human review.",
    "It is not an eligibility or approval decision.",
    "",
    `Frozen threshold comparison: ${calculation?.thresholdComparison ?? "no_frozen_threshold"}`,
    `Total annualized income: ${
      calculation ? currency.format(calculation.annualizedIncome) : "Not calculated"
    }`,
  ].join("\n");
}

function buildDeterministicSituationSummary(session: ApplicationSession) {
  const confirmedFacts = session.confirmations.filter(
    (field) => field.status === "confirmed" || field.status === "corrected",
  );
  return [
    `Application ID: ${session.id}`,
    `Household size: ${session.setup.householdSize}`,
    `Income sources selected: ${session.setup.incomeSources.join(", ") || "none selected"}`,
    `Submitted documents: ${session.documents.map((document) => `${document.title} (${document.status})`).join("; ") || "none"}`,
    `Renter-confirmed facts: ${confirmedFacts.length}`,
    "This factual summary is generated from stored application data. It is not a housing decision.",
  ].join("\n");
}

async function buildAiSituationSummaryText(session: ApplicationSession) {
  const deterministic = buildDeterministicSituationSummary(session);
  const confirmedFacts = session.confirmations
    .filter((field) => field.status === "confirmed" || field.status === "corrected")
    .map((field) => {
      const document = session.documents.find((item) => item.id === field.documentId);
      return {
        label: field.label,
        value: field.value ?? field.originalValue,
        documentTitle: document?.title ?? field.fileName,
      };
    });
  const unresolvedItems = session.documents
    .filter((document) => document.status !== "confirmed")
    .map((document) => `${document.title}: ${document.status}`);

  try {
    const response = await fetch("/api/describe/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdSize: session.setup.householdSize,
        incomeSources: session.setup.incomeSources,
        documents: session.documents.map((document) => ({
          title: document.title,
          fileName: document.fileName,
          status: document.status,
        })),
        confirmedFacts,
        unresolvedItems,
      }),
    });
    if (!response.ok) throw new Error("Summary request failed.");
    const payload = (await response.json()) as { summary?: string; model?: string };
    if (!payload.summary) throw new Error("Summary response was empty.");
    return [
      "AI-generated factual summary",
      `Model: ${payload.model ?? "unknown"}`,
      "Basis: renter-confirmed facts and submitted document statuses only",
      "",
      payload.summary,
      "",
      "Deterministic fallback",
      deterministic,
    ].join("\n");
  } catch {
    return `Deterministic fallback factual summary\n\n${deterministic}`;
  }
}

export function buildChecklistText(session: ApplicationSession) {
  return frozenChecklist
    .map((task) => {
      const status = session.checklist[task.id] ?? "missing";
      return `${task.title}\nStatus: ${statusDescriptions[status]}\n${task.description}`;
    })
    .join("\n\n");
}

export function buildIncomeCalculationText(calculation?: CalculationResult) {
  if (!calculation) {
    return "No annualized income calculation has been generated yet.";
  }

  const lines = calculation.annualizedLines.map((line) =>
    [
      `${line.sourceDocumentId}`,
      `${line.amountLabel}: ${currency.format(line.amount)}`,
      `${line.frequencyLabel}: ${line.frequency}`,
      `Multiplier: ${line.multiplier}`,
      `Annualized result: ${currency.format(line.annualizedAmount)}`,
    ].join("\n"),
  );

  return [
    `HMFA: ${calculation.thresholdHudArea ?? "No frozen threshold area"}`,
    `AMI percentage: ${
      calculation.amiPercent === undefined ? "No frozen threshold" : `${calculation.amiPercent}%`
    }`,
    `Threshold effective date: ${calculation.thresholdEffectiveDate ?? "No frozen threshold"}`,
    `Household size: ${calculation.householdSize}`,
    `Frozen threshold amount: ${
      calculation.thresholdAmount === undefined
        ? "No frozen threshold"
        : currency.format(calculation.thresholdAmount)
    }`,
    "",
    ...lines,
    "",
    `Total annualized income: ${currency.format(calculation.annualizedIncome)}`,
    `Frozen threshold comparison: ${calculation.thresholdComparison}`,
    "",
    "This calculation prepares information for human review and is not an eligibility or approval decision.",
  ].join("\n");
}

export function buildCitationText(calculation?: CalculationResult) {
  const citationIds = calculation?.citationIds ?? ["HUD-MTSP-001", "HUD-MTSP-002", "CH-DECISION-001"];
  return citationIds
    .map((citationId) => ruleCitations.find((citation) => citation.id === citationId))
    .filter((citation) => citation !== undefined)
    .map((citation) =>
      [
        citation.title,
        `Source: ${citation.sourceName}`,
        `URL: ${citation.sourceUrl}`,
        `Effective date: ${citation.effectiveDate}`,
        `Locator: ${citation.sourceLocator ?? "Not provided"}`,
        citation.plainLanguageSummary,
      ].join("\n"),
    )
    .join("\n\n");
}

async function buildDocumentDescriptionsText(session: ApplicationSession) {
  const sections: string[] = [];

  for (const document of session.documents) {
    const deterministic = describeDocuments({
      ...session,
      documents: [document],
    });

    if (!document.isUploaded) {
      sections.push(`Deterministic description\n\n${deterministic}`);
      continue;
    }

    const confirmedFields = session.confirmations
      .filter(
        (field) =>
          field.documentId === document.id &&
          (field.status === "confirmed" || field.status === "corrected"),
      )
      .map((field) => ({
        label: field.label,
        value: field.value ?? field.originalValue,
        status: field.status,
      }));
    const unresolvedFields = session.confirmations
      .filter((field) => field.documentId === document.id && field.status !== "confirmed" && field.status !== "corrected")
      .map((field) => field.label);

    try {
      const response = await fetch("/api/describe/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentTitle: document.title,
          fileName: document.fileName,
          confirmedFields,
          unresolvedFields,
        }),
      });

      if (!response.ok) {
        throw new Error("Description request failed.");
      }

      const payload = (await response.json()) as { description?: string; model?: string };
      if (!payload.description) {
        throw new Error("Description response was empty.");
      }

      sections.push(
        [
          "AI-generated reviewer summary",
          `Model: ${payload.model ?? "unknown"}`,
          "Basis: renter-confirmed or renter-corrected facts only",
          "",
          payload.description,
          "",
          "Fallback deterministic description",
          deterministic,
        ].join("\n"),
      );
    } catch {
      sections.push(`Deterministic fallback description\n\n${deterministic}`);
    }
  }

  return sections.join("\n\n---\n\n");
}

export async function generatePreparationBundle(session: ApplicationSession) {
  const zip = new JSZip();
  const calculation = session.calculations[0];

  zip.file("00-readiness-summary.pdf", createSimplePdf("Readiness summary", buildReadinessSummary(session, calculation)));
  zip.file("01-document-checklist.pdf", createSimplePdf("Document checklist", buildChecklistText(session)));
  zip.file(
    "02-income-calculation.pdf",
    createSimplePdf("Income calculation", buildIncomeCalculationText(calculation)),
  );
  zip.file(
    "03-document-descriptions.pdf",
    createSimplePdf("Document descriptions", await buildDocumentDescriptionsText(session)),
  );
  zip.file(
    "04-application-summary.pdf",
    createSimplePdf("Application factual summary", await buildAiSituationSummaryText(session)),
  );
  zip.file("citations/rule-citations.txt", buildCitationText(calculation));
  zip.file(
    "data/confirmed-fields.json",
    JSON.stringify(
      session.confirmations.filter(
        (field) => field.status === "confirmed" || field.status === "corrected",
      ),
      null,
      2,
    ),
  );
  zip.file("data/session-summary.json", JSON.stringify(session, null, 2));

  for (const document of session.documents) {
    const uploadedFile = document.isUploaded ? getUploadedFile(document.id, session.id) : undefined;
    if (document.isUploaded && uploadedFile) {
      zip.file(`documents/${document.fileName}`, await uploadedFile.arrayBuffer());
    } else if (document.isUploaded) {
      zip.file(
        `documents/${document.fileName}.missing.txt`,
        "Re-upload needed. The exact user-uploaded PDF was unavailable in browser memory when this bundle was generated.",
      );
    } else {
      try {
        const response = await fetch(document.pdfUrl);
        if (response.ok) {
          zip.file(`documents/${document.fileName}`, await response.arrayBuffer());
        }
      } catch {
        zip.file(
          `documents/${document.fileName}.missing.txt`,
          "The selected local synthetic PDF was not available when this bundle was generated.",
        );
      }
    }
  }

  return zip.generateAsync({ type: "blob" });
}
