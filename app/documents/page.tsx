"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { checklistForIncomeSources } from "@/lib/housing/checklist";
import { syntheticDocuments } from "@/lib/housing/synthetic-documents";
import type { ChecklistTask, DocumentExtractionResult, DocumentType, UploadSlotRecord } from "@/lib/housing/types";
import {
  addSyntheticDocument,
  addUploadedDocument,
  getCachedExtraction,
  getSession,
  removeDocumentRecord,
  resetUploadSlot,
  saveCachedExtraction,
  saveUploadSlot,
  setChecklistStatus,
} from "@/lib/session/session-store";
import {
  registerUploadedFile,
  replaceUploadedFileDocumentId,
} from "@/lib/session/uploaded-file-registry";
import { useTranslations } from "@/lib/i18n";
import { useSession } from "@/lib/session/use-session";

const maxUploadBytes = 8 * 1024 * 1024;

type SelectedFile = { file?: File };

type DocumentMismatch = {
  filename: string;
  expectedType: DocumentType;
  actualType: DocumentType;
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validatePdf(file: File, tr: (key: string) => string) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return tr("uploadPdfOnly");
  }
  if (file.size <= 0 || file.size > maxUploadBytes) {
    return tr("uploadPdfSize");
  }
  return "";
}

function isResolved(status: string) {
  return status === "confirmed" || status === "skipped" || status === "DO_NOT_HAVE" || status === "added";
}

export default function DocumentsPage() {
  const { tr, documentTypeLabel, uploadLabel, statusLabel, requestDescription } = useTranslations();
  const { session, loading, announcement, setAnnouncement, setSession } = useSession({
    createIfMissing: true,
  });
  const [selectedFiles, setSelectedFiles] = useState<Record<string, SelectedFile>>({});
  const [fileInputKeys, setFileInputKeys] = useState<Record<string, number>>({});
  const [documentMismatch, setDocumentMismatch] =useState<DocumentMismatch | null>(null);

  const requestedTasks = useMemo(
    () => (session ? checklistForIncomeSources(session.setup.incomeSources) : []),
    [session],
  );
  const requirementsResolved =
    requestedTasks.length > 0 &&
    requestedTasks.every((task) => isResolved(session?.checklist[task.id] ?? "missing"));

  function primarySlotId(taskId: string) {
    return `${session?.id ?? "pending"}:${taskId}:primary`;
  }

  function defaultSlotFor(task: ChecklistTask): UploadSlotRecord {
    return {
      slotId: primarySlotId(task.id),
      taskId: task.id,
      expectedDocumentType: task.documentType,
      status: "not_uploaded",
      updatedAt: new Date().toISOString(),
    };
  }

  function slotsFor(task: ChecklistTask) {
    const stored = (session?.uploadSlots ?? []).filter((slot) => slot.taskId === task.id);
    return stored.length > 0 ? stored : [defaultSlotFor(task)];
  }

  async function addUploadSlot(task: ChecklistTask) {
    const slot: UploadSlotRecord = {
      slotId: crypto.randomUUID(),
      taskId: task.id,
      expectedDocumentType: task.documentType,
      status: "not_uploaded",
      updatedAt: new Date().toISOString(),
    };
    const saved = await saveUploadSlot(slot);
    setSession(saved);
  }

  async function selectFile(task: ChecklistTask, slot: UploadSlotRecord, file: File | undefined) {
    if (!file) {
      setSelectedFiles((current) => {
        const next = { ...current };
        delete next[slot.slotId];
        return next;
      });
      const saved = await resetUploadSlot(slot.slotId, {
        taskId: task.id,
        expectedDocumentType: task.documentType,
      });
      setFileInputKeys((current) => ({ ...current, [slot.slotId]: (current[slot.slotId] ?? 0) + 1 }));
      setSession(saved);
      return;
    }
    const error = validatePdf(file, tr);
    setSelectedFiles((current) => ({ ...current, [slot.slotId]: { file } }));
    const saved = await saveUploadSlot({
      ...slot,
      filename: file.name,
      fileSize: file.size,
      fileHash: undefined,
      documentId: undefined,
      extractedData: undefined,
      requestId: undefined,
      status: error ? "error" : "file_selected",
      error: error || undefined,
      errorCode: error ? "INVALID_PDF" : undefined,
      updatedAt: new Date().toISOString(),
    });
    setSession(saved);
  }

  async function addSample(sampleId: string) {
    const sample = syntheticDocuments.find((document) => document.id === sampleId);
    if (!sample) return;
    const saved = await addSyntheticDocument(sample);
    setSession(saved);
    setAnnouncement(tr("sampleAdded", { title: sample.title }));
  }

  async function markTask(taskId: string, status: "DO_NOT_HAVE" | "skipped") {
    const saved = await setChecklistStatus(taskId, status);
    setSession(saved);
    setAnnouncement(
      status === "DO_NOT_HAVE"
        ? tr("taskDoNotHave")
        : tr("taskSkipped"),
    );
  }

  async function removeDocument(documentId: string) {
    const saved = await removeDocumentRecord(documentId);
    setSession(saved);
    setAnnouncement(tr("removeDocument"));
  }

  async function submitFile(task: ChecklistTask, slot: UploadSlotRecord) {
    const selected = selectedFiles[slot.slotId];
    const file = selected?.file;
    if (!file || slot.error || !session) return;
    const requestId = crypto.randomUUID();
    const setSlot = async (patch: Partial<UploadSlotRecord>) => {
      const saved = await saveUploadSlot({
        ...slot,
        filename: file.name,
        fileSize: file.size,
        requestId,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      setSession(saved);
      return saved;
    };
    const isCurrentRequest = async () => {
      const latest = await getSession(session.id);
      return latest?.uploadSlots?.find((item) => item.slotId === slot.slotId)?.requestId === requestId;
    };

    const validationError = validatePdf(file, tr);
    if (validationError) {
      await setSlot({ status: "error", error: validationError, errorCode: "INVALID_PDF" });
      return;
    }

    await setSlot({ status: "uploading", error: undefined, errorCode: undefined, documentId: undefined, extractedData: undefined });
    try {
      const fileHash = await sha256(file);
      if (!(await isCurrentRequest())) return;
      const temporaryId = `pending-${task.id}-${fileHash}`;
      let objectUrl: string;
      try {
        objectUrl = registerUploadedFile(temporaryId, file, session.id);
      } catch (error) {
        throw Object.assign(
          new Error(error instanceof Error ? error.message : tr("uploadFailed")),
          { code: "STORAGE_FAILURE", stage: "browser-storage" },
        );
      }
      let extraction: DocumentExtractionResult | undefined;

      if (task.supportedExtraction) {
        await setSlot({ status: "extracting", fileHash });
        const cached = await getCachedExtraction(fileHash, task.documentType);
        extraction = cached;
        if (!extraction) {
          const body = new FormData();
          body.append("file", file);
          body.append("documentType", task.documentType);
          const response = await fetch("/api/extract/document", { method: "POST", body });
          if (!response.ok) {
            const payload = (await response.json().catch(() => undefined)) as
              | { code?: string; error?: string; stage?: string }
              | undefined;
            throw Object.assign(new Error(payload?.error ?? tr("openAiExtractionFailed")), {
              code: payload?.code ?? "EXTRACTION_FAILURE",
              stage: payload?.stage,
            });
          }
          extraction = (await response.json()) as DocumentExtractionResult;
          await saveCachedExtraction(fileHash, task.documentType, extraction);
          if (extraction.actualDocumentType && extraction.actualDocumentType !== task.documentType) {
            await saveCachedExtraction(fileHash, extraction.actualDocumentType, extraction);
          }
        }
      }
      if (!(await isCurrentRequest())) return;

      const classifiedDocumentType = extraction?.actualDocumentType ?? extraction?.documentType ?? task.documentType;
      const classificationConfidence = extraction?.classificationConfidence ?? 1;
      const actualDocumentType =
        classifiedDocumentType !== task.documentType && classificationConfidence < 0.6
          ? task.documentType
          : classifiedDocumentType;
      let documentId;
      let duplicate;
      try {
        const result = await addUploadedDocument({
          actualDocumentType,
          expectedDocumentType: task.documentType,
          sourceSlotId: slot.slotId,
          taskId: task.id,
          title: tr("uploadedDocumentTitle", { type: documentTypeLabel(actualDocumentType) }),
          fileName: file.name,
          fileSize: file.size,
          fileHash,
          objectUrl,
          extraction,
        });
        documentId = result.documentId;
        duplicate = result.duplicate;
      } catch (error) {
        throw Object.assign(
          new Error(error instanceof Error ? error.message : tr("uploadFailed")),
          { code: "DATABASE_FAILURE", stage: "indexeddb" },
        );
      }
      replaceUploadedFileDocumentId(temporaryId, documentId, session.id);
      const resetSaved = await resetUploadSlot(slot.slotId, {
        taskId: task.id,
        expectedDocumentType: task.documentType,
      });
      setSelectedFiles((current) => {
        const next = { ...current };
        delete next[slot.slotId];
        return next;
      });
      setFileInputKeys((current) => ({ ...current, [slot.slotId]: (current[slot.slotId] ?? 0) + 1 }));
      setSession(resetSaved);
      if (classifiedDocumentType !== task.documentType && actualDocumentType === task.documentType) {
        setAnnouncement(tr("lowConfidenceType", {
          actual: documentTypeLabel(classifiedDocumentType),
          expected: documentTypeLabel(task.documentType),
        }));
      } else if (actualDocumentType !== task.documentType) {
        setAnnouncement(
          tr("wrongTypeRouted", {
          actual: documentTypeLabel(actualDocumentType),
          expected: documentTypeLabel(task.documentType),
        }));
        setDocumentMismatch({
          filename: file.name,
          expectedType: task.documentType,
          actualType: actualDocumentType,
        });
      } else if (duplicate) {
        setAnnouncement(tr("duplicateUpload"));
      } else {
        setAnnouncement(extraction ? tr("extractionComplete") : tr("noSchemaAdded"));
      }
    } catch (error) {
      if (!(await isCurrentRequest())) return;
      const err = error as Error & { code?: string; stage?: string };
      const saved = await saveUploadSlot({
        ...slot,
        filename: file.name,
        fileSize: file.size,
        requestId,
        status: "error",
        error: err.message || tr("uploadFailed"),
        errorCode: err.code ?? "EXTRACTION_FAILURE",
        updatedAt: new Date().toISOString(),
      });
      setSession(saved);
    }
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("documentsEyebrow")} title={tr("documentsTitle")}>
        <p>{tr("documentsIntro")}</p>
      </PageHeader>

      {loading || !session ? (
        <p>{tr("loadingDocuments")}</p>
      ) : (
        <div className="grid gap-5">
          {requirementsResolved ? (
            <section className="rounded-lg border-2 border-[#2f855a] bg-[#e6ffed] p-5">
              <h2 className="text-xl font-semibold text-[#172026]">{tr("continuePrepare")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#22543d]">{tr("requirementsResolved")}</p>
              <div className="mt-4">
                <Link className={buttonVariants({ size: "lg" })} href={`/prepare?applicationId=${session.id}`}>
                  {tr("continuePrepare")}
                </Link>
              </div>
            </section>
          ) : null}
          {requestedTasks.length === 0 ? (
            <section className="rounded-lg border border-[#d8d0bf] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#172026]">
                {session.setup.incomeSources.includes("no_current_income")
                  ? tr("noCurrentIncomeGuidanceTitle")
                  : tr("noDocumentRequestsTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#52616b]">
                {session.setup.incomeSources.includes("no_current_income")
                  ? tr("noCurrentIncomeGuidanceDesc")
                  : tr("editSetupForSources")}
              </p>
            </section>
          ) : null}

          {requestedTasks.map((task) => {
            const sample = syntheticDocuments.find((document) => document.type === task.documentType);
            const documents = session.documents.filter((document) => document.type === task.documentType);
            const status = session.checklist[task.id] ?? "missing";
            const slots = slotsFor(task);

            return (
              <section id={task.id} key={task.id} className="scroll-mt-24 rounded-lg border border-[#d8d0bf] bg-[#fffdf7] p-5" aria-labelledby={`${task.id}-title`}>
                <div className="flex flex-wrap items-center gap-3">
                  <FileText aria-hidden="true" className="size-5 text-[#6b5b3f]" />
                  <h2 id={`${task.id}-title`} className="text-xl font-semibold text-[#172026]">
                    {uploadLabel(task.documentType)}
                  </h2>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#52616b]">{requestDescription(task.documentType)}</p>
                <p className="mt-2 text-sm font-semibold text-[#334e68]">
                  {tr("acceptedFormatStatus", {
                    status: status === "missing"
                        ? tr("statusNotUploaded")
                        : statusLabel(status),
                  })}
                </p>

                {slots.map((slot, slotIndex) => {
                  const selected = selectedFiles[slot.slotId];
                  const validFileSelected = Boolean(selected?.file && !slot.error);
                  const busy = slot.status === "uploading" || slot.status === "extracting";
                  return (
                    <div key={slot.slotId} className="mt-4 grid gap-3 rounded-md border border-[#e5ddcf] bg-white p-4">
                      <label htmlFor={`${task.id}-${slot.slotId}-file`} className="text-sm font-semibold text-[#172026]">
                        {tr("choosePdf", { type: documentTypeLabel(task.documentType) })} {slotIndex + 1}
                      </label>
                      <input
                        key={`${slot.slotId}-${fileInputKeys[slot.slotId] ?? 0}`}
                        id={`${task.id}-${slot.slotId}-file`}
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => void selectFile(task, slot, event.currentTarget.files?.[0])}
                        className="block w-full rounded-md border border-[#b8af9d] bg-[#fffdf7] p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#183b56] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
                      />
                      <p className="text-sm text-[#52616b]">
                        {tr("selectedFilename", { name: selected?.file?.name ?? slot.filename ?? tr("noFileSelected") })}
                      </p>
                      <p className="text-sm font-semibold text-[#334e68]">
                        {tr("uploadSlotStatus", { status: statusLabel(slot.status) })}
                      </p>
                      {slot.error ? (
                        <p role="alert" className="rounded-md border border-[#c53030] bg-[#fff5f5] p-3 text-sm text-[#742a2a]">
                          {slot.error}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => void submitFile(task, slot)}
                          disabled={!validFileSelected || busy}
                        >
                          {task.supportedExtraction ? tr("uploadAndExtract") : tr("addPdfToBundle")}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void selectFile(task, slot, undefined)}>
                          {tr("removeOrReplace")}
                        </Button>
                        {sample ? (
                          <Button type="button" variant="ghost" onClick={() => void addSample(sample.id)}>
                            {tr("trySyntheticSample")}
                          </Button>
                        ) : null}
                        <Button type="button" variant="ghost" onClick={() => void markTask(task.id, "DO_NOT_HAVE")}>
                          {tr("doNotHaveThis")}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void markTask(task.id, "skipped")}>
                          {tr("skipForNow")}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {status === "DO_NOT_HAVE" ? (
                  <p className="mt-3 rounded-md border border-[#b7791f] bg-[#fff8db] p-3 text-sm leading-6 text-[#744210]">
                    {tr("doNotHaveGuidance")}
                  </p>
                ) : null}

                {documents.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {documents.map((document, index) => (
                      <article key={document.id} className="grid gap-3 rounded-md border border-[#e5ddcf] bg-white p-4 sm:grid-cols-[1fr_auto]">
                        <div>
                          <h3 className="font-semibold text-[#172026]">
                            {documentTypeLabel(document.type)} {index + 1}: {document.fileName}
                          </h3>
                          <p className="mt-1 text-sm text-[#52616b]">
                            {document.extractionSupported === false
                              ? tr("unsupportedIncluded")
                              : tr("reviewRequired")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <StatusBadge status={document.status} />
                          {document.status === "needs_review" || document.status === "confirmed" ? (
                            <Link className={buttonVariants({ size: "lg" })} href={`/documents/${document.id}/review`}>
                              {tr("reviewExtractedFields")}
                            </Link>
                          ) : null}
                          <Button type="button" variant="ghost" onClick={() => void removeDocument(document.id)}>
                            {tr("removeDocument")}
                          </Button>
                        </div>
                      </article>
                    ))}
                    {task.allowsMultiple ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[#52616b]">
                        <Plus aria-hidden="true" className="size-4" />
                        <Button type="button" variant="outline" onClick={() => void addUploadSlot(task)}>
                          {tr("addAnotherAction", { type: documentTypeLabel(task.documentType) })}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {documents.length === 0 && task.allowsMultiple ? (
                  <div className="mt-4">
                    <Button type="button" variant="outline" onClick={() => void addUploadSlot(task)}>
                      {tr("addAnotherAction", { type: documentTypeLabel(task.documentType) })}
                    </Button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
       )}

      {documentMismatch ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="document-mismatch-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDocumentMismatch(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-[#d8d0bf] bg-white p-6 shadow-xl">
            <h2
              id="document-mismatch-title"
              className="text-xl font-semibold text-[#172026]"
            >
              Wrong document uploaded
            </h2>

            <p className="mt-3 text-sm leading-6 text-[#52616b]">
              <span className="font-semibold text-[#172026]">
                {documentMismatch.filename}
              </span>{" "}
              appears to be a{" "}
              <span className="font-semibold text-[#172026]">
                {documentTypeLabel(documentMismatch.actualType)}
              </span>
              , not a{" "}
              <span className="font-semibold text-[#172026]">
                {documentTypeLabel(documentMismatch.expectedType)}
              </span>
              .
            </p>

            <p className="mt-3 text-sm leading-6 text-[#52616b]">
              We added this file to the{" "}
              <span className="font-semibold text-[#172026]">
                {documentTypeLabel(documentMismatch.actualType)}
              </span>{" "}
              section instead. You still need to upload a{" "}
              <span className="font-semibold text-[#172026]">
                {documentTypeLabel(documentMismatch.expectedType)}
              </span>
              .
            </p>

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => setDocumentMismatch(null)}
                autoFocus
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
