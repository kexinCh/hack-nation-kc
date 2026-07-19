import type { ExtractedFieldKey, FieldValue, SyntheticDocument } from "./types.ts";

type OfficialField = {
  field: string;
  value: FieldValue;
  page: number;
  bbox: [number, number, number, number];
  bbox_units: string;
};

type OfficialDocumentSeed = {
  document_id: string;
  household_id: string;
  document_type: "pay_stub" | "benefit_letter";
  file_name: string;
  synthetic: true;
  rasterized: boolean;
  contains_adversarial_text: boolean;
  page_count: number;
  page_size_points: [number, number];
  fields: OfficialField[];
};

const officialMilestoneDocuments: OfficialDocumentSeed[] = [
  {
    document_id: "HH-003-D02",
    household_id: "HH-003",
    document_type: "pay_stub",
    file_name: "hh-003_d02_pay_stub.pdf",
    synthetic: true,
    rasterized: false,
    contains_adversarial_text: false,
    page_count: 1,
    page_size_points: [612, 792],
    fields: [
      {
        field: "person_name",
        value: "Avery Moss",
        page: 1,
        bbox: [40, 658, 96.23, 672],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "pay_date",
        value: "2026-06-27",
        page: 1,
        bbox: [330, 658, 385.14, 672],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "pay_period_start",
        value: "2026-06-10",
        page: 1,
        bbox: [40, 608, 95.14, 622],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "pay_period_end",
        value: "2026-06-23",
        page: 1,
        bbox: [200, 608, 255.14, 622],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "pay_frequency",
        value: "biweekly",
        page: 1,
        bbox: [360, 608, 402.34, 622],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "regular_hours",
        value: 60,
        page: 1,
        bbox: [52, 528, 76, 542],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "hourly_rate",
        value: 19.25,
        page: 1,
        bbox: [190, 528, 224.58, 542],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "gross_pay",
        value: 1155,
        page: 1,
        bbox: [340, 528, 397.38, 544],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "net_pay",
        value: 900.9,
        page: 1,
        bbox: [460, 528, 500.14, 542],
        bbox_units: "pdf_points_bottom_left_origin",
      },
    ],
  },
  {
    document_id: "HH-003-D04",
    household_id: "HH-003",
    document_type: "benefit_letter",
    file_name: "hh-003_d04_benefit_letter.pdf",
    synthetic: true,
    rasterized: false,
    contains_adversarial_text: false,
    page_count: 1,
    page_size_points: [612, 792],
    fields: [
      {
        field: "person_name",
        value: "Avery Moss",
        page: 1,
        bbox: [40, 653, 96.23, 667],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "document_date",
        value: "2026-06-13",
        page: 1,
        bbox: [360, 653, 415.14, 667],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "monthly_benefit",
        value: 850,
        page: 1,
        bbox: [40, 498, 94.6, 516],
        bbox_units: "pdf_points_bottom_left_origin",
      },
      {
        field: "benefit_frequency",
        value: "monthly",
        page: 1,
        bbox: [280, 498, 319.01, 512],
        bbox_units: "pdf_points_bottom_left_origin",
      },
    ],
  },
];

const labels: Record<string, string> = {
  person_name: "Person name",
  pay_date: "Pay date",
  pay_period_start: "Pay-period start",
  pay_period_end: "Pay-period end",
  pay_frequency: "Pay frequency",
  regular_hours: "Regular hours",
  hourly_rate: "Hourly rate",
  gross_pay: "Gross pay",
  net_pay: "Net pay",
  document_date: "Letter date",
  monthly_benefit: "Monthly benefit",
  benefit_frequency: "Benefit frequency",
};

function sourceSnippet(field: OfficialField) {
  return `${labels[field.field] ?? field.field}: ${String(field.value)}`;
}

function toExtractedKey(field: string): ExtractedFieldKey {
  if (field === "pay_period_end") {
    return "pay_period_end_date";
  }

  if (field === "document_date") {
    return "letter_date";
  }

  return field as ExtractedFieldKey;
}

function titleForDocument(document: OfficialDocumentSeed) {
  if (document.document_type === "pay_stub") {
    return "Official RealDoor synthetic pay stub";
  }

  return "Official RealDoor synthetic benefit letter";
}

export const syntheticDocuments: SyntheticDocument[] = officialMilestoneDocuments.map((document) => ({
  id: document.document_id,
  sourceDocumentId: document.document_id,
  householdId: document.household_id,
  type: document.document_type,
  title: titleForDocument(document),
  issuer: "RealDoor official synthetic challenge pack",
  sampleDate: document.fields.find((field) => field.field === "pay_date" || field.field === "document_date")
    ?.value as string,
  fileName: document.file_name,
  pdfUrl: `/realdoor/documents/${document.file_name}`,
  synthetic: true,
  rasterized: document.rasterized,
  containsAdversarialText: document.contains_adversarial_text,
  pageCount: document.page_count,
  pageSizePoints: document.page_size_points,
  description:
    "Bundled official synthetic RealDoor challenge document. It is displayed locally and is not uploaded by the renter.",
  fields: document.fields.map((field) => ({
    id: `${document.document_id}-${field.field}`,
    documentId: document.document_id,
    sourceDocumentId: document.document_id,
    householdId: document.household_id,
    fileName: document.file_name,
    synthetic: true,
    key: toExtractedKey(field.field),
    sourceField: field.field,
    label: labels[field.field] ?? field.field,
    value: field.value,
    confidence: 1,
    sourceSnippet: sourceSnippet(field),
    page: field.page,
    bbox: field.bbox,
    bboxUnits: field.bbox_units,
    extractionMethod: "official_gold",
  })),
}));

export function getSyntheticDocument(sampleId: string) {
  return syntheticDocuments.find((document) => document.id === sampleId);
}
