"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { checklistForIncomeSources, frozenChecklist } from "@/lib/housing/checklist";
import { calculateAnnualizedIncomeFromConfirmedFields } from "@/lib/housing/calculations";
import { findDuplicateUploadedDocument } from "@/lib/housing/document-deduplication";
import type {
  ApplicationSession,
  DocumentExtractionResult,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  ExtractedField,
  HouseholdSetup,
  RenterConfirmation,
  SyntheticDocument,
  UploadSlotRecord,
} from "@/lib/housing/types";

export const SESSION_SCHEMA_VERSION = 6;
const DB_NAME = "renter-readiness-copilot";
const STORE_NAME = "sessions";
const ACTIVE_SESSION_KEY = "renter-readiness.activeSessionId";

type SessionDB = DBSchema & {
  sessions: {
    key: string;
    value: ApplicationSession;
    indexes: { "by-updated": string };
  };
  extractionCache: {
    key: string;
    value: DocumentExtractionResult & { cacheKey: string; fileHash: string; cachedAt: string };
  };
};

let dbPromise: Promise<IDBPDatabase<SessionDB>> | undefined;

function getDb() {
  dbPromise ??= openDB<SessionDB>(DB_NAME, SESSION_SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
      }
      if (oldVersion > 0 && oldVersion < 5 && db.objectStoreNames.contains("extractionCache")) {
        db.deleteObjectStore("extractionCache");
      }
      if (!db.objectStoreNames.contains("extractionCache")) {
        db.createObjectStore("extractionCache", { keyPath: "cacheKey" });
      }
    },
  });

  return dbPromise;
}

export function getActiveSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

function setActiveSessionId(sessionId: string) {
  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
}

function clearActiveSessionId() {
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function nowIso() {
  return new Date().toISOString();
}

function defaultSetup(): HouseholdSetup {
  return {
    householdSize: 3,
    incomeSources: [],
    giftSupportDescription: "",
    otherIncomeDescription: "",
    metroProgramId: "boston-lihtc-2026",
    preferredLanguage: "english",
    deadline: "",
  };
}

function checklistForSetup(setup: HouseholdSetup): Record<string, DocumentStatus> {
  const requested = checklistForIncomeSources(setup.incomeSources);
  return Object.fromEntries(
    requested.map((task) => [task.id, "missing" satisfies DocumentStatus]),
  ) as Record<string, DocumentStatus>;
}

function migrateSetup(setup: Partial<HouseholdSetup> & { incomeSource?: string } | undefined): HouseholdSetup {
  const base = defaultSetup();
  if (!setup) return base;
  let incomeSources = setup.incomeSources;
  if (!incomeSources && setup.incomeSource) {
    incomeSources =
      setup.incomeSource === "both"
        ? ["employment", "benefits"]
        : setup.incomeSource === "not_sure"
          ? []
          : [setup.incomeSource as HouseholdSetup["incomeSources"][number]];
  }

  return {
    ...base,
    ...setup,
    incomeSources: incomeSources ?? base.incomeSources,
    metroProgramId: setup.metroProgramId ?? base.metroProgramId,
    preferredLanguage:
      setup.preferredLanguage === "spanish" || setup.preferredLanguage === "chinese"
        ? setup.preferredLanguage
        : "english",
  };
}

function normalizeSession(session: ApplicationSession): ApplicationSession {
  const setup = migrateSetup(session.setup as HouseholdSetup & { incomeSource?: string });
  const relevantTasks = checklistForIncomeSources(setup.incomeSources);
  const checklist = Object.fromEntries(
    relevantTasks.map((task) => [task.id, session.checklist?.[task.id] ?? "missing"]),
  ) as Record<string, DocumentStatus>;

  return {
    ...session,
    schemaVersion: SESSION_SCHEMA_VERSION,
    setup,
    documents: session.documents ?? [],
    uploadSlots: session.uploadSlots ?? [],
    confirmations: session.confirmations ?? [],
    incomeSourceGroupOverrides: session.incomeSourceGroupOverrides ?? [],
    checklist,
    calculations: session.calculations ?? [],
  };
}

export function createEmptySession(setupPatch: Partial<HouseholdSetup> = {}): ApplicationSession {
  const timestamp = nowIso();
  const setup = migrateSetup({ ...defaultSetup(), ...setupPatch });
  return {
    id: crypto.randomUUID(),
    schemaVersion: SESSION_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    setup,
    documents: [],
    uploadSlots: [],
    confirmations: [],
    incomeSourceGroupOverrides: [],
    checklist: checklistForSetup(setup),
    calculations: [],
  };
}

export async function createSession(setupPatch: Partial<HouseholdSetup> = {}) {
  const db = await getDb();
  const session = createEmptySession(setupPatch);
  await db.put(STORE_NAME, session);
  setActiveSessionId(session.id);
  return session;
}

export async function saveSession(session: ApplicationSession) {
  const db = await getDb();
  const nextSession = {
    ...session,
    schemaVersion: SESSION_SCHEMA_VERSION,
    updatedAt: nowIso(),
  };
  await db.put(STORE_NAME, nextSession);
  setActiveSessionId(nextSession.id);
  return nextSession;
}

export async function getSession(sessionId: string) {
  const db = await getDb();
  const session = await db.get(STORE_NAME, sessionId);
  return session ? normalizeSession(session) : undefined;
}

export async function listSessions() {
  const db = await getDb();
  const sessions = await db.getAll(STORE_NAME);
  return sessions.map(normalizeSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function activateSession(sessionId: string) {
  const session = await getSession(sessionId);
  if (session) {
    setActiveSessionId(session.id);
  }
  return session;
}

export async function getActiveSession() {
  const sessionId = getActiveSessionId();
  if (!sessionId) {
    return undefined;
  }

  return getSession(sessionId);
}

export async function ensureActiveSession() {
  const activeSession = await getActiveSession();
  if (activeSession) {
    return activeSession;
  }

  return createSession();
}

export async function deleteActiveSession() {
  const sessionId = getActiveSessionId();
  if (!sessionId) {
    return;
  }

  const db = await getDb();
  await db.delete(STORE_NAME, sessionId);
  clearActiveSessionId();
}

export async function deleteSession(sessionId: string) {
  const db = await getDb();
  await db.delete(STORE_NAME, sessionId);
  if (getActiveSessionId() === sessionId) {
    clearActiveSessionId();
  }
}

export async function deleteAllSessions() {
  const db = await getDb();
  await db.clear(STORE_NAME);
  await db.clear("extractionCache");
  clearActiveSessionId();
}

export async function updateSetup(patch: Partial<HouseholdSetup>) {
  const session = await ensureActiveSession();
  const setup = migrateSetup({
    ...session.setup,
    ...patch,
  });
  const relevantTaskIds = new Set(checklistForIncomeSources(setup.incomeSources).map((task) => task.id));
  const checklist = Object.fromEntries(
    frozenChecklist
      .filter((task) => relevantTaskIds.has(task.id))
      .map((task) => [task.id, session.checklist[task.id] ?? "missing"]),
  ) as Record<string, DocumentStatus>;
  return saveSession({
    ...session,
    setup,
    checklist,
  });
}

export async function saveUploadSlot(slot: UploadSlotRecord) {
  const session = await ensureActiveSession();
  const uploadSlots = [
    ...(session.uploadSlots ?? []).filter((item) => item.slotId !== slot.slotId),
    { ...slot, updatedAt: nowIso() },
  ];
  return saveSession({ ...session, uploadSlots });
}

export async function removeUploadSlot(slotId: string) {
  const session = await ensureActiveSession();
  return saveSession({
    ...session,
    uploadSlots: (session.uploadSlots ?? []).filter((slot) => slot.slotId !== slotId),
  });
}

export async function resetUploadSlot(slotId: string, patch: Pick<UploadSlotRecord, "taskId" | "expectedDocumentType">) {
  return saveUploadSlot({
    slotId,
    taskId: patch.taskId,
    expectedDocumentType: patch.expectedDocumentType,
    status: "not_uploaded",
    updatedAt: nowIso(),
  });
}

function taskIdForDocumentType(type: DocumentRecord["type"]) {
  return frozenChecklist.find((task) => task.documentType === type)?.id;
}

function confirmationsForDocument(sample: SyntheticDocument, recordId: string): RenterConfirmation[] {
  return sample.fields.map((field: ExtractedField) => ({
    id: `${recordId}-${field.id}`,
    documentId: recordId,
    fieldId: field.id,
    fieldKey: field.key,
    sourceField: field.sourceField,
    label: field.label,
    originalValue: field.value,
    value: undefined,
    status: "extracted",
    confidence: field.confidence,
    page: field.page ?? 1,
    bbox: field.bbox,
    bboxUnits: field.bboxUnits,
    sourceDocumentId: field.sourceDocumentId,
    householdId: field.householdId,
    fileName: field.fileName,
    synthetic: true,
    uncertainty: field.uncertainty,
    sourceSnippet: field.sourceSnippet,
    extractionMethod: field.extractionMethod,
  }));
}

export async function addSyntheticDocument(sample: SyntheticDocument) {
  const session = await ensureActiveSession();
  const existing = session.documents.find((document) => document.sampleId === sample.id);
  if (existing) {
    return session;
  }

  const timestamp = nowIso();
  const recordId = crypto.randomUUID();
  const documentRecord: DocumentRecord = {
    id: recordId,
    sampleId: sample.id,
    sourceDocumentId: sample.sourceDocumentId,
    householdId: sample.householdId,
    type: sample.type,
    title: sample.title,
    fileName: sample.fileName,
    pdfUrl: sample.pdfUrl,
    synthetic: true,
    status: "needs_review",
    addedAt: timestamp,
    updatedAt: timestamp,
  };
  const taskId = taskIdForDocumentType(sample.type);

  return saveSession({
    ...session,
    documents: [...session.documents, documentRecord],
    confirmations: [...session.confirmations, ...confirmationsForDocument(sample, recordId)],
    checklist: taskId
      ? {
          ...session.checklist,
          [taskId]: "needs_review",
        }
      : session.checklist,
  });
}

function extractionCacheKey(fileHash: string, documentType: DocumentType) {
  return `${documentType}:${fileHash}`;
}

export async function getCachedExtraction(fileHash: string, documentType: DocumentType) {
  const db = await getDb();
  return db.get("extractionCache", extractionCacheKey(fileHash, documentType));
}

export async function saveCachedExtraction(
  fileHash: string,
  documentType: DocumentType,
  extraction: DocumentExtractionResult,
) {
  const db = await getDb();
  const cacheKey = extractionCacheKey(fileHash, documentType);
  await db.put("extractionCache", {
    ...extraction,
    cacheKey,
    fileHash,
    cachedAt: nowIso(),
  });
}

export async function addUploadedDocument({
  actualDocumentType,
  expectedDocumentType,
  sourceSlotId,
  taskId,
  title,
  fileName,
  fileSize,
  fileHash,
  objectUrl,
  extraction,
}: {
  actualDocumentType: DocumentType;
  expectedDocumentType: DocumentType;
  sourceSlotId: string;
  taskId?: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  objectUrl: string;
  extraction?: DocumentExtractionResult;
}) {
  const session = await ensureActiveSession();
  const timestamp = nowIso();
  const contentHash = extraction?.contentHash;
  const duplicate = findDuplicateUploadedDocument(session.documents, session.confirmations, {
    actualDocumentType,
    fileHash,
    contentHash,
    extraction,
  });
  if (duplicate) {
    const uploadSlots = [
      ...(session.uploadSlots ?? []).filter((slot) => slot.slotId !== sourceSlotId),
      {
        slotId: sourceSlotId,
        taskId: taskId ?? taskIdForDocumentType(expectedDocumentType) ?? expectedDocumentType,
        expectedDocumentType,
        filename: fileName,
        fileSize,
        fileHash,
        status: "needs_review" as const,
        documentId: duplicate.id,
        extractedData: extraction,
        updatedAt: timestamp,
      },
    ];
    return {
      session: await saveSession({ ...session, uploadSlots }),
      documentId: duplicate.id,
      duplicateOfDocumentId: duplicate.id,
      duplicate: true,
    };
  }
  const recordId = crypto.randomUUID();
  const sourceDocumentId = `UPLOAD-${fileHash.slice(0, 12).toUpperCase()}`;
  const documentRecord: DocumentRecord = {
    id: recordId,
    sampleId: sourceDocumentId,
    sourceDocumentId,
    householdId: "USER-UPLOADED",
    type: actualDocumentType,
    actualDocumentType,
    expectedDocumentType,
    sourceSlotId,
    title,
    fileName,
    pdfUrl: objectUrl,
    synthetic: false,
    isUploaded: true,
    uploadHash: fileHash,
    fileHash,
    contentHash,
    classificationConfidence: extraction?.classificationConfidence,
    fileSize,
    extractionModel: extraction?.model,
    applicationId: session.id,
    extractionSupported: Boolean(extraction),
    fileAvailable: true,
    extractionStatus: extraction ? "needs_review" : "not_supported",
    confirmed: false,
    status: extraction ? "needs_review" : "added",
    addedAt: timestamp,
    updatedAt: timestamp,
  };
  const confirmations: RenterConfirmation[] = (extraction?.fields ?? []).map((field) => ({
    id: `${recordId}-${field.key}-${crypto.randomUUID()}`,
    documentId: recordId,
    fieldId: `${sourceDocumentId}-${field.key}`,
    fieldKey: field.key,
    sourceField: field.key,
    label: field.label,
    originalValue: field.value,
    value: undefined,
    status: "extracted",
    confidence: field.confidence,
    page: field.page ?? 1,
    bbox: field.bbox,
    bboxUnits: field.bboxUnits,
    sourceDocumentId,
    householdId: "USER-UPLOADED",
    fileName,
    synthetic: false,
    uncertainty: field.uncertainty,
    sourceSnippet: field.sourceSnippet,
    extractionMethod: "openai",
  }));
  const resolvedTaskId = taskIdForDocumentType(actualDocumentType);
  const uploadSlots = [
    ...(session.uploadSlots ?? []).filter((slot) => slot.slotId !== sourceSlotId),
    {
      slotId: sourceSlotId,
      taskId: taskId ?? taskIdForDocumentType(expectedDocumentType) ?? expectedDocumentType,
      expectedDocumentType,
      filename: fileName,
      fileSize,
      fileHash,
      status: extraction ? "needs_review" as const : "not_uploaded" as const,
      documentId: recordId,
      extractedData: extraction,
      updatedAt: timestamp,
    },
  ];

  return {
    session: await saveSession({
      ...session,
      documents: [...session.documents, documentRecord],
      uploadSlots,
      confirmations: [...session.confirmations, ...confirmations],
      checklist: resolvedTaskId
        ? {
            ...session.checklist,
            [resolvedTaskId]: extraction ? "needs_review" : "added",
          }
        : session.checklist,
    }),
    documentId: recordId,
    duplicate: false,
  };
}

export async function setChecklistStatus(taskId: string, status: DocumentStatus) {
  const session = await ensureActiveSession();
  return saveSession({
    ...session,
    checklist: {
      ...session.checklist,
      [taskId]: status,
    },
  });
}

export async function updateConfirmation(
  confirmationId: string,
  status: RenterConfirmation["status"],
  value?: RenterConfirmation["value"],
) {
  const session = await ensureActiveSession();
  const confirmations = session.confirmations.map((confirmation) =>
    confirmation.id === confirmationId
      ? {
          ...confirmation,
          status,
          value: status === "rejected" ? undefined : value,
          confirmedAt: nowIso(),
        }
      : confirmation,
  );
  const changed = confirmations.find((confirmation) => confirmation.id === confirmationId);
  const documentId = changed?.documentId;
  const documentConfirmations = confirmations.filter(
    (confirmation) => confirmation.documentId === documentId,
  );
  const reviewed =
    documentConfirmations.length > 0 &&
    documentConfirmations.every((confirmation) => confirmation.status !== "extracted");
  const documentRecord = session.documents.find((document) => document.id === documentId);
  const taskId = documentRecord ? taskIdForDocumentType(documentRecord.type) : undefined;

  return saveSession({
    ...session,
    confirmations,
    documents: session.documents.map((document) =>
      document.id === documentId
        ? {
            ...document,
            status: reviewed ? "confirmed" : "needs_review",
            extractionStatus: reviewed ? "confirmed" : "needs_review",
            confirmed: reviewed,
            updatedAt: nowIso(),
          }
        : document,
    ),
    uploadSlots: (session.uploadSlots ?? []).map((slot) =>
      slot.documentId === documentId
        ? {
            ...slot,
            status: reviewed ? "confirmed" : "needs_review",
            updatedAt: nowIso(),
          }
        : slot,
    ),
    checklist:
      reviewed && taskId
        ? {
            ...session.checklist,
            [taskId]: "confirmed",
          }
        : session.checklist,
  });
}

export async function addManualConfirmation({
  documentId,
  fieldKey,
  label,
  value,
}: {
  documentId: string;
  fieldKey: RenterConfirmation["fieldKey"];
  label: string;
  value: RenterConfirmation["value"];
}) {
  const session = await ensureActiveSession();
  const documentRecord = session.documents.find((document) => document.id === documentId);
  if (!documentRecord) {
    return session;
  }
  const timestamp = nowIso();
  const confirmation: RenterConfirmation = {
    id: `${documentId}-manual-${crypto.randomUUID()}`,
    documentId,
    fieldId: `${documentId}-manual-${fieldKey}`,
    fieldKey,
    sourceField: fieldKey,
    label,
    originalValue: value ?? "",
    value,
    status: "corrected",
    page: 1,
    sourceDocumentId: documentRecord.sourceDocumentId,
    householdId: documentRecord.householdId,
    fileName: documentRecord.fileName,
    synthetic: documentRecord.synthetic,
    sourceSnippet: "Manual renter entry",
    confirmedAt: timestamp,
  };

  return saveSession({
    ...session,
    confirmations: [...session.confirmations, confirmation],
  });
}

export async function removeDocumentRecord(documentId: string) {
  const session = await ensureActiveSession();
  const documentRecord = session.documents.find((document) => document.id === documentId);
  if (!documentRecord) {
    return session;
  }
  const documents = session.documents.filter((document) => document.id !== documentId);
  const confirmations = session.confirmations.filter((confirmation) => confirmation.documentId !== documentId);
  const taskId = taskIdForDocumentType(documentRecord.type);
  const remainingSameType = documents.some((document) => document.type === documentRecord.type);

  return saveSession({
    ...session,
    documents,
    uploadSlots: (session.uploadSlots ?? []).map((slot) =>
      slot.documentId === documentId
        ? {
            slotId: slot.slotId,
            taskId: slot.taskId,
            expectedDocumentType: slot.expectedDocumentType,
            status: "not_uploaded",
            updatedAt: nowIso(),
          }
        : slot,
    ),
    confirmations,
    checklist:
      taskId && !remainingSameType
        ? {
            ...session.checklist,
            [taskId]: "missing",
          }
        : session.checklist,
  });
}

export async function saveIncomeSourceGroupOverrides(
  overrides: ApplicationSession["incomeSourceGroupOverrides"],
) {
  const session = await ensureActiveSession();
  return saveSession({
    ...session,
    incomeSourceGroupOverrides: overrides ?? [],
  });
}

export async function runAnnualizedIncomeCalculation() {
  const session = await ensureActiveSession();
  return runAnnualizedIncomeCalculationForSession(session.id);
}

export async function runAnnualizedIncomeCalculationForSession(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Application session not found.");
  }
  const result = calculateAnnualizedIncomeFromConfirmedFields(
    session.id,
    session.setup.householdSize,
    session.confirmations,
    undefined,
    session.incomeSourceGroupOverrides ?? [],
  );

  return saveSession({
    ...session,
    calculations: [result],
  });
}
