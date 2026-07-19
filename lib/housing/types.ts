export type IncomeSource =
  | "employment"
  | "benefits"
  | "gig_self_employment"
  | "gifts_support"
  | "no_current_income"
  | "other";

export type PreferredLanguage = "english" | "spanish" | "chinese";

export type MetroProgramId = "boston-lihtc-2026";

export type DocumentType =
  | "application_summary"
  | "pay_stub"
  | "benefit_letter"
  | "employment_letter"
  | "gig_statement"
  | "support_letter"
  | "other_income_proof";

export type DocumentStatus =
  | "not_uploaded"
  | "file_selected"
  | "uploading"
  | "extracting"
  | "available"
  | "added"
  | "needs_review"
  | "confirmed"
  | "missing"
  | "DO_NOT_HAVE"
  | "skipped"
  | "error"
  | "reupload_needed";

export type FieldStatus = "extracted" | "confirmed" | "corrected" | "rejected";

export type FieldValue = string | number;

export type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "annual";

export type ExtractedFieldKey =
  | "person_name"
  | "household_size"
  | "address"
  | "application_date"
  | "gross_pay"
  | "pay_frequency"
  | "employer"
  | "employee_name"
  | "employer_name"
  | "employer_address"
  | "job_title"
  | "pay_date"
  | "pay_period_start"
  | "pay_period_end_date"
  | "regular_hours"
  | "hourly_rate"
  | "net_pay"
  | "benefit_type"
  | "benefit_amount"
  | "monthly_benefit"
  | "benefit_frequency"
  | "letter_date"
  | "document_date"
  | "weekly_hours"
  | "salary"
  | "ytd_gross_income"
  | "gross_receipts"
  | "platform_fees"
  | "statement_month"
  | "annual_income"
  | "untrusted_instruction_text";

export type HouseholdSetup = {
  householdSize: number;
  incomeSources: IncomeSource[];
  giftSupportDescription?: string;
  otherIncomeDescription?: string;
  metroProgramId: MetroProgramId;
  preferredLanguage: PreferredLanguage;
  deadline?: string;
};

export type HousingProgram = {
  metroId: string;
  metroName: string;
  programId: string;
  programName: string;
  ruleSetId: string;
  ruleVersion: string;
  hudAreaCode: string;
  officialSourceUrl: string;
};

export type ScenarioThreshold = {
  fiscalYear: number;
  effectiveDate: string;
  hudArea: string;
  medianFamilyIncome: number;
  householdSize: number;
  amiPercent: number;
  thresholdAmount: number;
  coreChallengeThreshold: number;
  sourcePdfPage: number;
  sourceUrl: string;
};

export type ScenarioConfig = {
  id: string;
  label: string;
  selectedHouseholdId: string;
  selectedDocumentTypes: DocumentType[];
  thresholdSourceFile: string;
  thresholds: ScenarioThreshold[];
};

export type RuleCitation = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  effectiveDate: string;
  ruleVersion: string;
  plainLanguageSummary: string;
  authority?: "official_hud" | "official_federal" | "hackathon_simulation";
  sourceLocator?: string;
};

export type ChecklistTask = {
  id: string;
  documentType: DocumentType;
  title: string;
  description: string;
  incomeSources: IncomeSource[];
  supportedExtraction: boolean;
  allowsMultiple?: boolean;
  ruleCitationIds: string[];
};

export type SyntheticDocument = {
  id: string;
  sourceDocumentId: string;
  householdId: string;
  type: DocumentType;
  title: string;
  issuer: string;
  sampleDate: string;
  fileName: string;
  pdfUrl: string;
  synthetic: boolean;
  rasterized: boolean;
  containsAdversarialText: boolean;
  pageCount: number;
  pageSizePoints: [number, number];
  description: string;
  fields: ExtractedField[];
};

export type ExtractedField = {
  id: string;
  documentId: string;
  sourceDocumentId: string;
  householdId: string;
  fileName: string;
  synthetic: true;
  key: ExtractedFieldKey;
  sourceField: string;
  label: string;
  value: FieldValue;
  confidence: number;
  uncertainty?: string;
  sourceSnippet: string;
  page?: number;
  bbox?: [number, number, number, number];
  bboxUnits?: string;
  extractionMethod?: "official_gold" | "openai";
};

export type DocumentRecord = {
  id: string;
  sampleId: string;
  sourceDocumentId: string;
  householdId: string;
  type: DocumentType;
  actualDocumentType?: DocumentType;
  expectedDocumentType?: DocumentType;
  sourceSlotId?: string;
  title: string;
  fileName: string;
  pdfUrl: string;
  synthetic: boolean;
  isUploaded?: boolean;
  uploadHash?: string;
  fileHash?: string;
  contentHash?: string;
  classificationConfidence?: number;
  duplicateOfDocumentId?: string;
  extractionStatus?: "not_supported" | "needs_review" | "confirmed" | "failed";
  confirmed?: boolean;
  fileSize?: number;
  extractionModel?: string;
  applicationId?: string;
  extractionSupported?: boolean;
  fileAvailable?: boolean;
  status: DocumentStatus;
  addedAt?: string;
  updatedAt: string;
};

export type RenterConfirmation = {
  id: string;
  documentId: string;
  fieldId: string;
  fieldKey: ExtractedFieldKey;
  sourceField: string;
  label: string;
  originalValue: FieldValue;
  value?: FieldValue;
  status: FieldStatus;
  confidence?: number;
  page: number;
  bbox?: [number, number, number, number];
  bboxUnits?: string;
  sourceDocumentId: string;
  householdId: string;
  fileName: string;
  synthetic: boolean;
  uncertainty?: string;
  sourceSnippet?: string;
  extractionMethod?: "official_gold" | "openai";
  confirmedAt?: string;
};

export type DocumentExtractionField = {
  key: ExtractedFieldKey;
  label: string;
  value: FieldValue;
  confidence: number;
  uncertainty?: string;
  sourceSnippet: string;
  page?: number;
  bbox?: [number, number, number, number];
  bboxUnits?: string;
};

export type DocumentExtractionResult = {
  documentType: DocumentType;
  expectedDocumentType?: DocumentType;
  actualDocumentType?: DocumentType;
  classificationConfidence?: number;
  classificationReason?: string;
  contentHash?: string;
  model: string;
  fields: DocumentExtractionField[];
  unresolvedFields: string[];
  warnings: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type PayStubExtractionResult = DocumentExtractionResult & { documentType: "pay_stub" };

export type CalculationInput = {
  documentId: string;
  fieldKey: ExtractedFieldKey;
  label: string;
  value: FieldValue;
};

export type AnnualizedIncomeLine = {
  documentId: string;
  sourceDocumentId: string;
  incomeSourceId?: string;
  incomeSourceName?: string;
  supportingDocumentIds?: string[];
  amountLabel: string;
  amount: number;
  frequencyLabel: string;
  frequency: Frequency;
  multiplier: number;
  annualizedAmount: number;
};

export type CalculationResult = {
  id: string;
  sessionId: string;
  type: "annualized_income";
  inputs: CalculationInput[];
  annualizedLines: AnnualizedIncomeLine[];
  formula: string;
  annualizedIncome: number;
  householdSize: number;
  amiPercent?: number;
  thresholdAmount?: number;
  thresholdEffectiveDate?: string;
  thresholdHudArea?: string;
  thresholdSourceUrl?: string;
  thresholdSourcePdfPage?: number;
  thresholdComparison: "below_or_equal" | "above" | "no_frozen_threshold";
  readinessStatus: "READY_TO_REVIEW" | "NEEDS_REVIEW";
  calculatedAt: string;
  citationIds: string[];
  warnings: string[];
};

export type IncomeSourceGroupOverride = {
  id: string;
  name?: string;
  documentIds: string[];
  inactive?: boolean;
};

export type UploadSlotStatus =
  | "not_uploaded"
  | "file_selected"
  | "uploading"
  | "extracting"
  | "needs_review"
  | "confirmed"
  | "error"
  | "reupload_needed";

export type UploadSlotRecord = {
  slotId: string;
  taskId: string;
  expectedDocumentType: DocumentType;
  filename?: string;
  fileSize?: number;
  fileHash?: string;
  status: UploadSlotStatus;
  error?: string;
  errorCode?: string;
  requestId?: string;
  documentId?: string;
  extractedData?: DocumentExtractionResult;
  updatedAt: string;
};

export type ApplicationSession = {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  setup: HouseholdSetup;
  documents: DocumentRecord[];
  uploadSlots?: UploadSlotRecord[];
  confirmations: RenterConfirmation[];
  incomeSourceGroupOverrides?: IncomeSourceGroupOverride[];
  checklist: Record<string, DocumentStatus>;
  calculations: CalculationResult[];
};
