"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSyntheticDocument } from "@/lib/housing/synthetic-documents";
import type { ExtractedFieldKey, FieldValue, RenterConfirmation } from "@/lib/housing/types";
import { addManualConfirmation, updateConfirmation } from "@/lib/session/session-store";
import { getUploadedFileUrl } from "@/lib/session/uploaded-file-registry";
import { useSession } from "@/lib/session/use-session";
import { useTranslations } from "@/lib/i18n";

function inputType(value: FieldValue) {
  return typeof value === "number" ? "number" : "text";
}

function displayValue(value: FieldValue | undefined) {
  if (value === undefined) {
    return "";
  }

  return String(value);
}

export default function ReviewDocumentPage() {
  const params = useParams<{ id: string }>();
  const { tr, documentTypeLabel } = useTranslations();
  const documentId = params.id;
  const { session, loading, announcement, setAnnouncement, setSession } = useSession({
    createIfMissing: true,
  });
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [manualLabel, setManualLabel] = useState("");
  const [manualValue, setManualValue] = useState("");

  const documentRecord = session?.documents.find((document) => document.id === documentId);
  const sample = documentRecord ? getSyntheticDocument(documentRecord.sampleId) : undefined;
  const pdfUrl = documentRecord?.isUploaded
    ? getUploadedFileUrl(documentRecord.id, session?.id)
    : documentRecord?.pdfUrl;
  const confirmations = useMemo(
    () => session?.confirmations.filter((confirmation) => confirmation.documentId === documentId) ?? [],
    [documentId, session?.confirmations],
  );

  async function saveField(
    confirmation: RenterConfirmation,
    status: RenterConfirmation["status"],
    fallbackValue?: FieldValue,
  ) {
    const rawValue = draftValues[confirmation.id];
    const value =
      status === "corrected"
        ? typeof confirmation.originalValue === "number"
          ? Number(rawValue)
          : rawValue
        : fallbackValue;
    const saved = await updateConfirmation(confirmation.id, status, value);
    setSession(saved);
    setAnnouncement(
      status === "rejected"
        ? tr("fieldRejected", { label: confirmation.label })
        : tr("fieldSaved", { label: confirmation.label }),
    );
  }

  async function addManualField() {
    if (!documentRecord || !manualLabel.trim() || !manualValue.trim()) return;
    const saved = await addManualConfirmation({
      documentId: documentRecord.id,
      fieldKey: "gross_pay" as ExtractedFieldKey,
      label: manualLabel.trim(),
      value: manualValue.trim(),
    });
    setSession(saved);
    setManualLabel("");
    setManualValue("");
    setAnnouncement(tr("fieldSaved", { label: manualLabel.trim() }));
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("reviewEyebrow")} title={documentRecord?.title ?? tr("reviewDocumentTitle")}>
        <p>{tr("reviewIntro")}</p>
      </PageHeader>

      {loading ? (
        <p>{tr("loadingReview")}</p>
      ) : !documentRecord || (!sample && !documentRecord.isUploaded) ? (
        <EmptyState title={tr("documentNotFound")}>
          <p>{tr("documentNotFoundBody")}</p>
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <section className="case-panel case-tab p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-[#172026]">{tr("documentSource")}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-[#172026]">{tr("officialDocumentId")}</dt>
                <dd className="mt-1 text-[#52616b]">{documentRecord.sourceDocumentId}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("issuer")}</dt>
                <dd className="mt-1 text-[#52616b]">
                  {sample?.issuer ?? tr("uploadedPdfType", { type: documentTypeLabel(documentRecord.type) })}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("fileName")}</dt>
                <dd className="mt-1 text-[#52616b]">{documentRecord.fileName}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("sampleDate")}</dt>
                <dd className="mt-1 text-[#52616b]">
                  {sample?.sampleDate ?? tr("providedBrowserSession")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("documentStatus")}</dt>
                <dd className="mt-1">
                  <StatusBadge status={documentRecord.status} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="case-panel-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-[#172026]">{tr("documentPdf")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#52616b]">
              {documentRecord.isUploaded
                ? tr("uploadedPdfHeld")
                : tr("fixedChallengeAsset")}
            </p>
            {pdfUrl ? (
              <iframe
                title={`${documentRecord.title} PDF`}
                src={pdfUrl}
                className="mt-4 h-[360px] w-full rounded-md border border-[#d8d0bf] bg-[#f8f6f0] sm:h-[520px]"
              />
            ) : (
              <p role="alert" className="mt-4 rounded-md border border-[#b7791f] bg-[#fff8db] p-3 text-sm text-[#744210]">
                {tr("reuploadNeeded")}
              </p>
            )}
          </section>

          <section className="grid gap-4" aria-labelledby="fields-to-review-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="fields-to-review-title" className="text-xl font-semibold text-[#172026]">
                  {tr("fieldsToReview")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#52616b]">{tr("reviewIntro")}</p>
              </div>
              <StatusBadge status={documentRecord.status} />
            </div>

            {confirmations.length === 0 ? (
              <EmptyState title={tr("fieldsToReview")}>
                <p>{tr("noConfirmedFieldsBody")}</p>
              </EmptyState>
            ) : null}

            {confirmations.map((confirmation) => {
              const sampleField = sample?.fields.find((field) => field.id === confirmation.fieldId);
              const draft = draftValues[confirmation.id] ?? displayValue(confirmation.originalValue);

              return (
                <article
                  key={confirmation.id}
                  className="grid rounded-lg border border-[#d8d0bf] bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold text-[#172026]">{confirmation.label}</h2>
                        <StatusBadge status={confirmation.status} />
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm">
                        <div>
                          <dt className="font-semibold text-[#172026]">
                            {confirmation.extractionMethod === "openai"
                              ? tr("aiProvisionalValue")
                              : tr("mockedValue")}
                          </dt>
                          <dd className="mt-1 text-[#334e68]">
                            {displayValue(confirmation.originalValue)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-[#172026]">{tr("confidence")}</dt>
                          <dd className="mt-1 text-[#334e68]">
                            {Math.round((confirmation.confidence ?? sampleField?.confidence ?? 0) * 100)} {tr("percent")}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-[#172026]">{tr("sourcePageBox")}</dt>
                          <dd className="mt-1 text-[#334e68]">
                            {tr("page", { page: confirmation.page })}
                            {confirmation.bbox && confirmation.bboxUnits
                              ? `; box [${confirmation.bbox.join(", ")}] ${confirmation.bboxUnits}`
                              : `; ${tr("noReliableBox")}`}
                          </dd>
                        </div>
                        {confirmation.uncertainty ? (
                          <div>
                            <dt className="font-semibold text-[#172026]">{tr("uncertainty")}</dt>
                            <dd className="mt-1 text-[#334e68]">{confirmation.uncertainty}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="font-semibold text-[#172026]">{tr("sourceSnippet")}</dt>
                          <dd className="evidence-box mt-1 text-[#334e68]">
                            {confirmation.sourceSnippet ?? sampleField?.sourceSnippet ?? tr("noSnippet")}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div>
                      <label
                        htmlFor={`${confirmation.id}-correction`}
                        className="block text-sm font-semibold text-[#172026]"
                      >
                        {tr("correctedValue")}
                      </label>
                      <input
                        id={`${confirmation.id}-correction`}
                        type={inputType(confirmation.originalValue)}
                        value={draft}
                        onChange={(event) =>
                          setDraftValues((current) => ({
                            ...current,
                            [confirmation.id]: event.currentTarget.value,
                          }))
                        }
                        className="form-input mt-2"
                      />
                      <div className="action-row mt-4">
                        <Button
                          type="button"
                          onClick={() =>
                            void saveField(confirmation, "confirmed", confirmation.originalValue)
                          }
                        >
                          {tr("confirm")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void saveField(confirmation, "corrected")}
                        >
                          {tr("correct")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void saveField(confirmation, "rejected")}
                        >
                          {tr("reject")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="case-panel-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-[#172026]">{tr("correctedValue")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#52616b]">
              {tr("noConfirmedFieldsBody")}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block text-sm font-semibold text-[#172026]">
                {tr("fieldLabel")}
                <input
                  value={manualLabel}
                  onChange={(event) => setManualLabel(event.currentTarget.value)}
                  className="form-input mt-2"
                />
              </label>
              <label className="block text-sm font-semibold text-[#172026]">
                {tr("correctedValue")}
                <input
                  value={manualValue}
                  onChange={(event) => setManualValue(event.currentTarget.value)}
                  className="form-input mt-2"
                />
              </label>
              <Button type="button" onClick={() => void addManualField()} disabled={!manualLabel.trim() || !manualValue.trim()}>
                {tr("correct")}
              </Button>
            </div>
          </section>

          <div className="action-row">
            <Link className={buttonVariants({ size: "lg" })} href="/documents">
              {tr("backDocuments")}
            </Link>
            <Link className={buttonVariants({ variant: "outline", size: "lg" })} href={`/prepare?applicationId=${session?.id ?? ""}`}>
              {tr("openPrepare")}
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
