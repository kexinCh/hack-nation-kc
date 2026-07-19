import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import JSZip from "jszip";

import {
  annualize,
  calculateAnnualizedIncomeFromConfirmedFields,
  compareToFrozenThreshold,
} from "../lib/housing/calculations.ts";
import { buildIncomeSourceGroups, normalizeEmployerName } from "../lib/housing/income-sources.ts";
import { buildDocumentIdentity, findDuplicateUploadedDocument } from "../lib/housing/document-deduplication.ts";
import { describeDocument } from "../lib/housing/document-descriptions.ts";
import {
  buildChecklistText,
  buildIncomeCalculationText,
  generatePreparationBundle,
} from "../lib/housing/preparation-bundle.ts";
import { getScenarioThreshold } from "../lib/housing/scenario.ts";
import { checklistForIncomeSources } from "../lib/housing/checklist.ts";
import {
  extractionJsonSchemaFor,
  supportedExtractionTypes,
  validateDocumentExtraction,
} from "../lib/ai/document-extraction.ts";
import { translate } from "../lib/i18n.ts";

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readCsv(path) {
  const [headerLine, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.match(/(".*?"|[^,]+)/g)?.map((value) => value.replace(/^"|"$/g, "")) ?? [];
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function confirmation(overrides) {
  return {
    id: "field",
    documentId: "document",
    fieldId: "field",
    fieldKey: "gross_pay",
    sourceField: "gross_pay",
    label: "Gross pay",
    originalValue: 0,
    status: "extracted",
    page: 1,
    bbox: [0, 1, 2, 3],
    bboxUnits: "pdf_points_bottom_left_origin",
    sourceDocumentId: "HH-003-D02",
    householdId: "HH-003",
    fileName: "hh-003_d02_pay_stub.pdf",
    synthetic: true,
    ...overrides,
  };
}

function confirmedField(documentId, fieldKey, value, extras = {}) {
  return confirmation({
    id: `${documentId}-${fieldKey}`,
    documentId,
    fieldId: `${documentId}-${fieldKey}`,
    fieldKey,
    sourceField: fieldKey,
    label: fieldKey,
    originalValue: value,
    value,
    status: "confirmed",
    sourceDocumentId: documentId,
    fileName: `${documentId}.pdf`,
    ...extras,
  });
}

function payStub(documentId, employer, amount, start, end, extras = {}) {
  return [
    confirmedField(documentId, "employee_name", "Avery Moss"),
    confirmedField(documentId, "employer_name", employer),
    confirmedField(documentId, "gross_pay", amount),
    confirmedField(documentId, "pay_frequency", "biweekly"),
    confirmedField(documentId, "hourly_rate", 20),
    confirmedField(documentId, "pay_period_start", start),
    confirmedField(documentId, "pay_period_end_date", end),
    ...Object.entries(extras).map(([key, value]) => confirmedField(documentId, key, value)),
  ];
}

function employmentLetter(documentId, employer, annualIncome = 60000) {
  return [
    confirmedField(documentId, "employee_name", "Avery Moss"),
    confirmedField(documentId, "employer_name", employer),
    confirmedField(documentId, "annual_income", annualIncome),
    confirmedField(documentId, "document_date", "2026-06-01"),
  ];
}

function mockSession(overrides = {}) {
  const document = {
    id: "doc-pay",
    sampleId: "HH-003-D02",
    sourceDocumentId: "HH-003-D02",
    householdId: "HH-003",
    type: "pay_stub",
    title: "Official RealDoor synthetic pay stub",
    fileName: "hh-003_d02_pay_stub.pdf",
    pdfUrl: "/realdoor/documents/hh-003_d02_pay_stub.pdf",
    synthetic: true,
    status: "confirmed",
    addedAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };

  return {
    id: "session",
    schemaVersion: 3,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    setup: {
      householdSize: 3,
      incomeSources: ["employment", "benefits"],
      metroProgramId: "boston-lihtc-2026",
      preferredLanguage: "english",
      deadline: "",
    },
    documents: [document],
    confirmations: [
      confirmation({
        id: "confirmed-gross",
        documentId: "doc-pay",
        fieldKey: "gross_pay",
        value: 1155,
        status: "confirmed",
      }),
      confirmation({
        id: "confirmed-frequency",
        documentId: "doc-pay",
        fieldKey: "pay_frequency",
        sourceField: "pay_frequency",
        label: "Pay frequency",
        originalValue: "biweekly",
        value: "biweekly",
        status: "corrected",
      }),
    ],
    checklist: {
      "pay-stub-task": "confirmed",
      "benefit-letter-task": "DO_NOT_HAVE",
    },
    calculations: [],
    ...overrides,
  };
}

function uploadedDocument(overrides = {}) {
  return {
    id: "doc-1",
    sampleId: "UPLOAD-1",
    sourceDocumentId: "UPLOAD-1",
    householdId: "USER-UPLOADED",
    type: "pay_stub",
    actualDocumentType: "pay_stub",
    expectedDocumentType: "pay_stub",
    sourceSlotId: "slot-1",
    title: "Uploaded pay stub",
    fileName: "stub.pdf",
    pdfUrl: "blob:test",
    synthetic: false,
    isUploaded: true,
    uploadHash: "file-hash-1",
    fileHash: "file-hash-1",
    contentHash: "content-hash-1",
    classificationConfidence: 0.9,
    extractionStatus: "needs_review",
    confirmed: false,
    fileSize: 100,
    status: "needs_review",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function extraction(documentType = "pay_stub", fields = []) {
  return {
    documentType,
    actualDocumentType: documentType,
    expectedDocumentType: documentType,
    classificationConfidence: 0.9,
    model: "test-model",
    fields,
    unresolvedFields: [],
    warnings: [],
  };
}

test("annualization mirrors organizer reference frequencies", () => {
  assert.equal(annualize(1000, "weekly"), 52000);
  assert.equal(annualize(2000, "biweekly"), 52000);
  assert.equal(annualize(1000, "semimonthly"), 24000);
  assert.equal(annualize(1000, "monthly"), 12000);
  assert.equal(annualize(52000, "annual"), 52000);
});

test("frozen threshold comparison mirrors organizer reference", () => {
  assert.equal(compareToFrozenThreshold(92580, 3), "below_or_equal");
  assert.equal(compareToFrozenThreshold(92580.01, 3), "above");
  assert.equal(compareToFrozenThreshold(1, 9), "no_frozen_threshold");
});

test("scenario threshold explanation is loaded from imported RealDoor data", () => {
  const threshold = getScenarioThreshold(3);
  assert.equal(threshold?.hudArea, "Boston-Cambridge-Quincy, MA-NH HMFA");
  assert.equal(threshold?.amiPercent, 60);
  assert.equal(threshold?.effectiveDate, "2026-05-01");
  assert.equal(threshold?.thresholdAmount, 92580);
});

test("prepare page does not hardcode the canonical threshold amount", () => {
  const sources = [
    readFileSync("app/prepare/page.tsx", "utf8"),
    readFileSync("lib/housing/calculations.ts", "utf8"),
  ].join("\n");
  assert.equal(sources.includes("92580"), false);
  assert.equal(sources.includes("$92,580"), false);
});

test("calculation consumes confirmed and corrected fields only", () => {
  const result = calculateAnnualizedIncomeFromConfirmedFields("session", 3, [
    confirmation({
      id: "raw-gross",
      fieldKey: "gross_pay",
      originalValue: 999999,
      value: undefined,
      status: "extracted",
    }),
    confirmation({
      id: "confirmed-gross",
      fieldKey: "gross_pay",
      value: 1155,
      status: "confirmed",
    }),
    confirmation({
      id: "confirmed-frequency",
      fieldKey: "pay_frequency",
      sourceField: "pay_frequency",
      label: "Pay frequency",
      originalValue: "biweekly",
      value: "biweekly",
      status: "corrected",
    }),
    confirmation({
      id: "benefit-amount",
      documentId: "benefit",
      fieldKey: "monthly_benefit",
      sourceField: "monthly_benefit",
      label: "Monthly benefit",
      originalValue: 850,
      value: 850,
      status: "confirmed",
    }),
    confirmation({
      id: "benefit-frequency",
      documentId: "benefit",
      fieldKey: "benefit_frequency",
      sourceField: "benefit_frequency",
      label: "Benefit frequency",
      originalValue: "monthly",
      value: "monthly",
      status: "confirmed",
    }),
  ]);

  assert.equal(result.annualizedIncome, 40230);
  assert.equal(result.annualizedLines.length, 2);
  assert.equal(result.thresholdComparison, "below_or_equal");
  assert.equal(result.readinessStatus, "READY_TO_REVIEW");
});

test("two pay stubs from the same employer count once using averaged pay periods", () => {
  const confirmations = [
    ...payStub("stub-1", "Bright Path LLC", 1000, "2026-06-01", "2026-06-14"),
    ...payStub("stub-2", "Bright Path, L.L.C.", 1200, "2026-06-15", "2026-06-28"),
  ];
  const groups = buildIncomeSourceGroups(confirmations);
  const result = calculateAnnualizedIncomeFromConfirmedFields("session", 3, confirmations);
  assert.equal(groups.length, 1);
  assert.equal(result.annualizedIncome, 28600);
  assert.equal(result.annualizedLines.length, 1);
});

test("duplicate pay-period stubs are not counted twice", () => {
  const confirmations = [
    ...payStub("stub-1", "Bright Path LLC", 1000, "2026-06-01", "2026-06-14"),
    ...payStub("stub-duplicate", "Bright Path LLC", 5000, "2026-06-01", "2026-06-14"),
  ];
  const result = calculateAnnualizedIncomeFromConfirmedFields("session", 3, confirmations);
  assert.equal(result.annualizedIncome, 26000);
  assert.match(result.warnings.join("\n"), /Duplicate or overlapping pay period/);
});

test("pay stub plus employment letter for the same job count once", () => {
  const confirmations = [
    ...payStub("stub-1", "Bright Path LLC", 1000, "2026-06-01", "2026-06-14"),
    ...employmentLetter("letter-1", "Bright Path LLC", 99000),
  ];
  const result = calculateAnnualizedIncomeFromConfirmedFields("session", 3, confirmations);
  assert.equal(result.annualizedIncome, 26000);
  assert.equal(result.annualizedLines.length, 1);
});

test("pay stubs from two employers count as two jobs", () => {
  const confirmations = [
    ...payStub("stub-1", "Bright Path LLC", 1000, "2026-06-01", "2026-06-14"),
    ...payStub("stub-2", "Harbor Care Inc", 800, "2026-06-01", "2026-06-14"),
  ];
  const groups = buildIncomeSourceGroups(confirmations);
  const result = calculateAnnualizedIncomeFromConfirmedFields("session", 3, confirmations);
  assert.equal(groups.length, 2);
  assert.equal(result.annualizedIncome, 46800);
});

test("similar employer names normalize but genuinely different employers remain reviewable", () => {
  assert.equal(normalizeEmployerName("Bright Path, LLC"), normalizeEmployerName("bright path"));
  assert.notEqual(normalizeEmployerName("Bright Path East"), normalizeEmployerName("Bright Path West"));
});

test("user merge and split overrides persist through grouping input", () => {
  const confirmations = [
    ...payStub("stub-1", "Bright Path LLC", 1000, "2026-06-01", "2026-06-14"),
    ...payStub("stub-2", "Harbor Care Inc", 800, "2026-06-01", "2026-06-14"),
  ];
  const merged = buildIncomeSourceGroups(confirmations, [
    { id: "merged", name: "User merged source", documentIds: ["stub-1", "stub-2"] },
  ]);
  const split = buildIncomeSourceGroups(confirmations, [
    { id: "split-a", documentIds: ["stub-1"] },
    { id: "split-b", documentIds: ["stub-2"] },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "User merged source");
  assert.equal(split.length, 2);
});

test("DO_NOT_HAVE remains an unresolved checklist status", () => {
  const session = mockSession();
  const checklist = buildChecklistText(session);
  assert.match(checklist, /Do not have/);
  assert.match(checklist, /remains unresolved/);
  assert.match(checklist, /alternative is accepted/);
});

test("deterministic document descriptions summarize confirmed fields", () => {
  const session = mockSession();
  const description = describeDocument(session, session.documents[0]);
  assert.match(description, /deterministic template/i);
  assert.match(description, /Gross pay: 1155/);
  assert.match(description, /Pay frequency: biweekly/);
  assert.match(description, /not AI-generated text/i);
});

test("income calculation explanation is scenario-driven", () => {
  const calculation = calculateAnnualizedIncomeFromConfirmedFields(
    "session",
    3,
    mockSession().confirmations,
  );
  const text = buildIncomeCalculationText(calculation);
  assert.match(text, /Boston-Cambridge-Quincy/);
  assert.match(text, /AMI percentage: 60%/);
  assert.match(text, /Effective|effective|Threshold effective date: 2026-05-01/);
  assert.match(text, /average gross per biweekly pay period x 26/);
  assert.match(text, /Income source calculation: annual/);
  assert.match(text, /Frozen threshold comparison: below_or_equal/);
});

test("official source records preserve schema and valid page boxes", () => {
  const rows = readJsonl("data/realdoor/document_gold.jsonl");
  assert.ok(rows.length >= 20);

  for (const row of rows) {
    assert.ok(row.document_id);
    assert.ok(row.household_id);
    assert.ok(row.document_type);
    assert.ok(row.file_name);
    assert.equal(row.synthetic, true);
    const [width, height] = row.page_size_points;

    for (const field of row.fields) {
      assert.ok(field.field);
      assert.ok("value" in field);
      assert.equal(field.page, 1);
      assert.equal(field.bbox_units, "pdf_points_bottom_left_origin");
      const [x1, y1, x2, y2] = field.bbox;
      assert.ok(0 <= x1 && x1 < x2 && x2 <= width, `${row.document_id} ${field.field}`);
      assert.ok(0 <= y1 && y1 < y2 && y2 <= height, `${row.document_id} ${field.field}`);
    }
  }
});

test("imported RealDoor files needed by Milestone 1 exist", () => {
  const manifest = readCsv("data/realdoor/document_manifest.csv");
  assert.ok(manifest.some((row) => row.document_id === "HH-003-D02"));
  assert.ok(manifest.some((row) => row.document_id === "HH-003-D04"));
  assert.ok(existsSync("public/realdoor/documents/hh-003_d02_pay_stub.pdf"));
  assert.ok(existsSync("public/realdoor/documents/hh-003_d04_benefit_letter.pdf"));
});

test("official adversarial fixtures cover prompt injection and decision overreach", () => {
  const adversarial = readJsonl("data/realdoor/adversarial_tests.jsonl");
  assert.ok(adversarial.some((row) => row.category === "prompt_injection"));
  assert.ok(adversarial.some((row) => row.category === "eligibility_overreach"));

  const gold = readJsonl("data/realdoor/document_gold.jsonl");
  assert.ok(
    gold.some((row) =>
      row.fields.some((field) => field.field === "untrusted_instruction_text"),
    ),
  );
});

test("preparation ZIP includes summaries, citations, and selected documents", async () => {
  const session = mockSession({
    calculations: [
      calculateAnnualizedIncomeFromConfirmedFields("session", 3, mockSession().confirmations),
    ],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }), { status: 200 });

  try {
    const bundle = await generatePreparationBundle(session);
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const names = Object.keys(zip.files);

    assert.ok(names.includes("00-readiness-summary.pdf"));
    assert.ok(names.includes("01-document-checklist.pdf"));
    assert.ok(names.includes("02-income-calculation.pdf"));
    assert.ok(names.includes("03-document-descriptions.pdf"));
    assert.ok(names.includes("04-application-summary.pdf"));
    assert.ok(names.includes("citations/rule-citations.txt"));
    assert.ok(names.includes("documents/hh-003_d02_pay_stub.pdf"));
    assert.ok(names.includes("data/confirmed-fields.json"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("income sources support multiple selections and relevant document requests", () => {
  const employmentOnly = checklistForIncomeSources(["employment"]).map((task) => task.documentType);
  assert.ok(employmentOnly.includes("pay_stub"));
  assert.ok(employmentOnly.includes("employment_letter"));
  assert.equal(employmentOnly.includes("benefit_letter"), false);

  const mixed = checklistForIncomeSources(["employment", "benefits", "gig_self_employment", "gifts_support"]).map(
    (task) => task.documentType,
  );
  assert.ok(mixed.includes("pay_stub"));
  assert.ok(mixed.includes("benefit_letter"));
  assert.ok(mixed.includes("gig_statement"));
  assert.ok(mixed.includes("support_letter"));
});

test("document page requires explicit upload and typed extraction actions", () => {
  const source = readFileSync("app/documents/page.tsx", "utf8");
  const i18n = readFileSync("lib/i18n.ts", "utf8");
  assert.match(i18n, /uploadPayStub: "Upload pay stub"/);
  assert.match(i18n, /uploadEmploymentLetter: "Upload employment letter"/);
  assert.match(i18n, /uploadBenefitLetter: "Upload benefit letter"/);
  assert.match(i18n, /uploadGigStatement: "Upload gig statement"/);
  assert.match(source, /uploadAndExtract/);
  assert.match(source, /body\.append\("documentType", task\.documentType\)/);
  assert.match(source, /onChange=\{\(event\) => void selectFile\(task, slot/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => void submitFile/);
});

test("two pay stubs can be uploaded as separate document instances", () => {
  const documentsPage = readFileSync("app/documents/page.tsx", "utf8");
  const store = readFileSync("lib/session/session-store.ts", "utf8");
  assert.match(documentsPage, /addAnother/);
  assert.match(store, /const recordId = crypto\.randomUUID\(\)/);
});

test("adding another repeatable document remains available after resolution", () => {
  const documentsPage = readFileSync("app/documents/page.tsx", "utf8");
  const checklist = readFileSync("lib/housing/checklist.ts", "utf8");
  assert.match(checklist, /allowsMultiple: true/);
  assert.match(documentsPage, /task\.allowsMultiple/);
  assert.match(documentsPage, /addUploadSlot\(task\)/);
  assert.match(documentsPage, /crypto\.randomUUID\(\)/);
  assert.match(documentsPage, /slot\.slotId/);
  assert.doesNotMatch(documentsPage, /status !== "confirmed".*addAnother/s);
});

test("setup blocks missing required fields before creating an application", () => {
  const setup = readFileSync("app/setup/page.tsx", "utf8");
  assert.match(setup, /function validateSetup/);
  assert.match(setup, /missingIncomeSource/);
  assert.match(setup, /missingGiftDescription/);
  assert.match(setup, /missingOtherDescription/);
  assert.match(setup, /resolveNoIncomeConflict/);
  assert.match(setup, /if \(!validateSetup\(\)\)/);
  assert.match(setup, /createSession\(setup\)/);
});

test("new applications start without confirmed documents and remain isolated", () => {
  const source = readFileSync("lib/session/session-store.ts", "utf8");
  assert.match(source, /documents: \[\]/);
  assert.match(source, /confirmations: \[\]/);
  assert.match(source, /applicationId: session\.id/);
  assert.match(source, /extractionCacheKey\(fileHash, documentType\)/);
});

test("all four organizer document types have strict extraction schemas", () => {
  const supported = supportedExtractionTypes().sort();
  assert.deepEqual(supported, ["benefit_letter", "employment_letter", "gig_statement", "pay_stub"].sort());
  const sampleFieldByType = {
    benefit_letter: "person_name",
    employment_letter: "employee_name",
    gig_statement: "person_name",
    pay_stub: "employee_name",
  };

  for (const documentType of supported) {
    const schema = extractionJsonSchemaFor(documentType);
    assert.ok(schema.properties.documentType.enum.includes(documentType));
    assert.equal(schema.properties.expectedDocumentType.enum[0], documentType);
    assert.ok(schema.properties.fields.items.properties.key.enum.length > 0);
    const field = sampleFieldByType[documentType];
    const result = validateDocumentExtraction(
      {
        documentType,
        expectedDocumentType: documentType,
        classificationConfidence: 0.9,
        classificationReason: "Test fixture",
        fields: [
          {
            key: field,
            label: "Test field",
            value: "visible value",
            confidence: 0.8,
            uncertainty: "",
            sourceSnippet: "Test field: visible value",
            page: 1,
            bbox: null,
            bboxUnits: null,
          },
        ],
        unresolvedFields: [],
        warnings: [],
      },
      documentType,
      "test-model",
    );
    assert.equal(result.documentType, documentType);
    assert.equal(result.fields[0].key, field);
  }
});

test("classification schema can return actual document type different from expected slot", () => {
  const schema = extractionJsonSchemaFor("benefit_letter");
  assert.ok(schema.properties.documentType.enum.includes("pay_stub"));
  const result = validateDocumentExtraction(
    {
      documentType: "pay_stub",
      expectedDocumentType: "benefit_letter",
      classificationConfidence: 0.92,
      classificationReason: "Pay stub heading and gross pay fields are visible.",
      fields: [
        {
          key: "employer",
          label: "Employer",
          value: "Blue Acorn Foods",
          confidence: 0.9,
          uncertainty: "",
          sourceSnippet: "Blue Acorn Foods",
          page: 1,
          bbox: null,
          bboxUnits: null,
        },
      ],
      unresolvedFields: ["benefit_type", "monthly_benefit", "employer_address"],
      warnings: [],
    },
    "benefit_letter",
    "test-model",
  );
  assert.equal(result.documentType, "pay_stub");
  assert.equal(result.expectedDocumentType, "benefit_letter");
  assert.equal(result.fields[0].key, "employer_name");
  assert.deepEqual(result.unresolvedFields, ["employer_address"]);
});

test("empty deduplication input does not report duplicates", () => {
  const duplicate = findDuplicateUploadedDocument([], [], {
    actualDocumentType: "pay_stub",
    fileHash: "hash",
    extraction: extraction("pay_stub"),
  });
  assert.equal(duplicate, undefined);
});

test("same uploaded document deduplicates by exact file hash and not filename", () => {
  assert.equal(
    buildDocumentIdentity("pay_stub", [
      { key: "employee_name", value: "Avery Moss" },
      { key: "employer_name", value: "Blue Acorn Foods, LLC" },
      { key: "pay_period_start", value: "2026-06-10" },
      { key: "pay_period_end_date", value: "2026-06-23" },
    ]),
    "pay_stub|averymoss|blueacornfoodsllc|20260610|20260623|",
  );
  const duplicate = findDuplicateUploadedDocument([uploadedDocument({ fileName: "first-name.pdf" })], [], {
    actualDocumentType: "pay_stub",
    fileHash: "file-hash-1",
    extraction: extraction("pay_stub"),
  });
  assert.equal(duplicate?.id, "doc-1");
});

test("same uploaded document with a different filename deduplicates by content hash", () => {
  const duplicate = findDuplicateUploadedDocument([uploadedDocument({ fileName: "first-name.pdf" })], [], {
    actualDocumentType: "pay_stub",
    fileHash: "renamed-file-hash",
    contentHash: "content-hash-1",
    extraction: extraction("pay_stub"),
  });
  assert.equal(duplicate?.id, "doc-1");
});

test("two legitimate pay stubs from different pay periods are not deduplicated", () => {
  const confirmations = [...payStub("doc-1", "Blue Acorn Foods", 1155, "2026-06-10", "2026-06-23")];
  const duplicate = findDuplicateUploadedDocument([uploadedDocument({ id: "doc-1" })], confirmations, {
    actualDocumentType: "pay_stub",
    fileHash: "different-file-hash",
    contentHash: "different-content-hash",
    extraction: extraction("pay_stub", [
      { key: "employee_name", value: "Avery Moss" },
      { key: "employer_name", value: "Blue Acorn Foods" },
      { key: "pay_period_start", value: "2026-06-24" },
      { key: "pay_period_end_date", value: "2026-07-07" },
      { key: "pay_date", value: "2026-07-11" },
    ]),
  });
  assert.equal(duplicate, undefined);
});

test("duplicate pay stub identity is detected across upload slots", () => {
  const confirmations = [...payStub("doc-1", "Blue Acorn Foods", 1155, "2026-06-10", "2026-06-23")];
  const duplicate = findDuplicateUploadedDocument([uploadedDocument({ id: "doc-1" })], confirmations, {
    actualDocumentType: "pay_stub",
    fileHash: "different-file-hash",
    contentHash: "different-content-hash",
    extraction: extraction("pay_stub", [
      { key: "employee_name", value: "Avery Moss" },
      { key: "employer_name", value: "Blue Acorn Foods" },
      { key: "pay_period_start", value: "2026-06-10" },
      { key: "pay_period_end_date", value: "2026-06-23" },
      { key: "pay_date", value: "" },
    ]),
  });
  assert.equal(duplicate?.id, "doc-1");
});

test("documents page keeps persisted upload slots and guards stale async responses", () => {
  const source = readFileSync("app/documents/page.tsx", "utf8");
  assert.ok(source.includes("UploadSlotRecord"));
  assert.ok(source.includes("requestId"));
  assert.ok(source.includes("isCurrentRequest"));
  assert.ok(source.includes("resetUploadSlot"));
  assert.equal(source.includes("fileName === file.name"), false);
});

test("extraction route exposes specific upload error codes", () => {
  const source = readFileSync("app/api/extract/document/route.ts", "utf8");
  for (const code of [
    "MISSING_FILE",
    "INVALID_PDF",
    "EXTRACTION_FAILURE",
    "VALIDATION_FAILURE",
    "BUFFER_FAILURE",
    "MISSING_API_CONFIGURATION",
  ]) {
    assert.ok(source.includes(code), `${code} is missing`);
  }
});

test("documents page records storage and database failures separately", () => {
  const source = readFileSync("app/documents/page.tsx", "utf8");
  assert.ok(source.includes("STORAGE_FAILURE"));
  assert.ok(source.includes("DATABASE_FAILURE"));
});

test("language selector drives shell copy across pages", () => {
  const home = readFileSync("app/page.tsx", "utf8");
  const shell = readFileSync("components/app-shell.tsx", "utf8");
  const i18n = readFileSync("lib/i18n.ts", "utf8");
  assert.match(home, /home-language/);
  assert.match(home, /setLanguage/);
  assert.match(shell, /useTranslations/);
  assert.match(i18n, /spanish/);
  assert.match(i18n, /chinese/);
});

test("every application page uses centralized translations", () => {
  const pages = [
    "app/page.tsx",
    "app/setup/page.tsx",
    "app/dashboard/page.tsx",
    "app/documents/page.tsx",
    "app/documents/[id]/review/page.tsx",
    "app/prepare/page.tsx",
    "app/privacy/page.tsx",
    "app/understand/page.tsx",
  ];
  for (const page of pages) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /useTranslations|<AppShell><p>Loading/);
  }
  const i18n = readFileSync("lib/i18n.ts", "utf8");
  assert.match(i18n, /function translate/);
  assert.match(i18n, /fallback/);
});

test("Chinese document cards use translated titles and explanations", () => {
  assert.equal(translate("chinese", "requestPayStub"), "工资单");
  assert.match(translate("chinese", "requestPayStubDesc"), /工资记录/);
  assert.equal(translate("chinese", "requestEmploymentLetter"), "就业信");
  assert.equal(translate("chinese", "requestBenefitLetter"), "福利信");
  assert.equal(translate("chinese", "requestGigStatement"), "零工收入单");
  assert.equal(translate("chinese", "requestSupportLetter"), "支持信");
  assert.match(translate("chinese", "requestGigStatementDesc"), /零工/);
  const documentsPage = readFileSync("app/documents/page.tsx", "utf8");
  assert.match(documentsPage, /requestDescription\(task\.documentType\)/);
  assert.doesNotMatch(documentsPage, /task\.description/);
});

test("quick tasks open the matching document section", () => {
  const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
  const documents = readFileSync("app/documents/page.tsx", "utf8");
  assert.match(dashboard, /href=\{`\/documents#\$\{task\.id\}`\}/);
  assert.match(documents, /id=\{task\.id\}/);
  assert.match(documents, /scroll-mt-24/);
});

test("continue to prepare appears when current requirements are resolved", () => {
  const documentsPage = readFileSync("app/documents/page.tsx", "utf8");
  assert.match(documentsPage, /requirementsResolved/);
  assert.match(documentsPage, /confirmed.*skipped.*DO_NOT_HAVE.*added/s);
  assert.match(documentsPage, /href=\{`\/prepare\?applicationId=\$\{session\.id\}`\}/);
});

test("refresh recovery requires re-upload before bundle download", () => {
  const review = readFileSync("app/documents/[id]/review/page.tsx", "utf8");
  const prepare = readFileSync("app/prepare/page.tsx", "utf8");
  assert.match(review, /reuploadNeeded/);
  assert.match(prepare, /getUploadedFile\(document\.id, session\.id\)/);
  assert.match(prepare, /reuploadBeforeBundle/);
});

test("manual corrections can be entered for missing extracted fields", () => {
  const review = readFileSync("app/documents/[id]/review/page.tsx", "utf8");
  const store = readFileSync("lib/session/session-store.ts", "utf8");
  assert.match(review, /addManualField/);
  assert.match(store, /addManualConfirmation/);
  assert.match(store, /status: "corrected"/);
});

test("ZIP uses only exact uploaded files for the selected application", async () => {
  const session = mockSession({
    id: "app-one",
    documents: [
      {
        id: "uploaded-pay",
        sampleId: "UPLOAD-ABC",
        sourceDocumentId: "UPLOAD-ABC",
        householdId: "USER-UPLOADED",
        type: "pay_stub",
        title: "Uploaded pay stub",
        fileName: "uploaded-pay.pdf",
        pdfUrl: "blob:local",
        synthetic: false,
        isUploaded: true,
        applicationId: "app-one",
        status: "needs_review",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    ],
  });
  const bundle = await generatePreparationBundle(session);
  const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
  const names = Object.keys(zip.files);
  assert.ok(names.includes("documents/uploaded-pay.pdf.missing.txt"));
  assert.equal(names.includes("documents/hh-003_d02_pay_stub.pdf"), false);
});

test("direct prepare access requires application selection", () => {
  const prepare = readFileSync("app/prepare/page.tsx", "utf8");
  assert.match(prepare, /searchParams\.get\("applicationId"\)/);
  assert.match(prepare, /!session \?/);
  assert.match(prepare, /chooseApplication/);
  assert.match(prepare, /runAnnualizedIncomeCalculationForSession\(session\.id\)/);
  assert.doesNotMatch(prepare, /useSession\(\{\s*createIfMissing: true/s);
});

test("preparation calculations and switching stay scoped to the selected application", () => {
  const prepare = readFileSync("app/prepare/page.tsx", "utf8");
  const store = readFileSync("lib/session/session-store.ts", "utf8");
  assert.match(prepare, /router\.push\(`\/prepare\?applicationId=\$\{applicationId\}`\)/);
  assert.match(prepare, /getSession\(selectedId\)/);
  assert.match(prepare, /buildIncomeSourceGroups\(session\.confirmations, session\.incomeSourceGroupOverrides/);
  assert.match(prepare, /renameGroup/);
  assert.match(prepare, /mergeAllGroups/);
  assert.match(prepare, /splitGroup/);
  assert.match(prepare, /markInactive/);
  assert.match(store, /runAnnualizedIncomeCalculationForSession\(sessionId: string\)/);
  assert.match(store, /const session = await getSession\(sessionId\)/);
  assert.match(store, /session\.incomeSourceGroupOverrides/);
});

test("evaluation reports all requested document extraction metrics", () => {
  const evaluation = readFileSync("scripts/evaluate-paystub-extraction.mjs", "utf8");
  assert.match(evaluation, /pay_stub/);
  assert.match(evaluation, /employment_letter/);
  assert.match(evaluation, /benefit_letter/);
  assert.match(evaluation, /gig_statement/);
  assert.match(evaluation, /valueAccuracy/);
  assert.match(evaluation, /pageCitationAccuracy/);
  assert.match(evaluation, /missingFields/);
  assert.match(evaluation, /hallucinatedFields/);
  assert.match(evaluation, /parseFailures/);
  assert.match(evaluation, /adversarialInstructionResistance/);
  assert.match(evaluation, /tokenUsage/);
  assert.match(evaluation, /estimatedTokens/);
});
