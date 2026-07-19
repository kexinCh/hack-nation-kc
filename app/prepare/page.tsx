"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { checklistForIncomeSources } from "@/lib/housing/checklist";
import { generatePreparationBundle } from "@/lib/housing/preparation-bundle";
import { housingProgram } from "@/lib/housing/program";
import { ruleCitations } from "@/lib/housing/rules-2026";
import { canonicalScenario, getScenarioThreshold } from "@/lib/housing/scenario";
import type { ApplicationSession } from "@/lib/housing/types";
import { buildIncomeSourceGroups } from "@/lib/housing/income-sources";
import { useTranslations } from "@/lib/i18n";
import {
  activateSession,
  getSession,
  listSessions,
  runAnnualizedIncomeCalculationForSession,
  saveIncomeSourceGroupOverrides,
} from "@/lib/session/session-store";
import { getUploadedFile } from "@/lib/session/uploaded-file-registry";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function progressFor(session: ApplicationSession) {
  const tasks = checklistForIncomeSources(session.setup.incomeSources);
  const statuses = tasks.map((task) => session.checklist[task.id] ?? "missing");
  return {
    total: tasks.length,
    resolved: statuses.filter((status) =>
      status === "confirmed" || status === "skipped" || status === "DO_NOT_HAVE" || status === "added"
    ).length,
    needsReview: statuses.filter((status) => status === "needs_review").length,
  };
}

function PrepareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("applicationId");
  const { tr, incomeSourceLabel, documentTypeLabel } = useTranslations();
  const [sessions, setSessions] = useState<ApplicationSession[]>([]);
  const [session, setSession] = useState<ApplicationSession | undefined>();
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [bundling, setBundling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const allSessions = await listSessions();
      const selectedSession = selectedId ? await getSession(selectedId) : undefined;
      if (!cancelled) {
        setSessions(allSessions);
        setSession(selectedSession);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const calculation = session?.calculations[0];
  const annualizedLines = calculation?.annualizedLines ?? [];
  const threshold = session ? getScenarioThreshold(session.setup.householdSize) : undefined;
  const reviewedFields =
    session?.confirmations.filter(
      (field) => field.status === "confirmed" || field.status === "corrected",
    ) ?? [];
  const unresolved = useMemo(
    () =>
      session
        ? checklistForIncomeSources(session.setup.incomeSources).filter(
            (task) => !["confirmed", "skipped", "DO_NOT_HAVE", "added"].includes(session.checklist[task.id] ?? "missing"),
          )
        : [],
    [session],
  );
  const incomeGroups = useMemo(
    () => session ? buildIncomeSourceGroups(session.confirmations, session.incomeSourceGroupOverrides ?? []) : [],
    [session],
  );

  async function persistOverrides(overrides: ApplicationSession["incomeSourceGroupOverrides"]) {
    if (!session) return;
    await activateSession(session.id);
    const saved = await saveIncomeSourceGroupOverrides(overrides);
    setSession(saved);
  }

  async function renameGroup(groupId: string) {
    if (!session) return;
    const group = incomeGroups.find((item) => item.id === groupId);
    const name = window.prompt(tr("rename"), group?.name ?? "");
    if (!name) return;
    const existing = session.incomeSourceGroupOverrides ?? [];
    const next = [
      ...existing.filter((override) => override.id !== groupId),
      {
        id: groupId,
        name,
        documentIds: group?.documents.map((document) => document.documentId) ?? [],
        inactive: group?.inactive,
      },
    ];
    await persistOverrides(next);
  }

  async function mergeAllGroups() {
    if (!session || incomeGroups.length < 2) return;
    const documentIds = incomeGroups.flatMap((group) => group.documents.map((document) => document.documentId));
    await persistOverrides([{ id: `merged-${session.id}`, name: "Merged income source", documentIds }]);
  }

  async function splitGroup(groupId: string) {
    if (!session) return;
    const group = incomeGroups.find((item) => item.id === groupId);
    if (!group) return;
    const existing = (session.incomeSourceGroupOverrides ?? []).filter((override) => override.id !== groupId);
    const split = group.documents.map((document) => ({
      id: `${groupId}:${document.documentId}`,
      name: `${group.name} - ${document.fileName}`,
      documentIds: [document.documentId],
    }));
    await persistOverrides([...existing, ...split]);
  }

  async function markInactive(groupId: string) {
    if (!session) return;
    const group = incomeGroups.find((item) => item.id === groupId);
    if (!group) return;
    const existing = session.incomeSourceGroupOverrides ?? [];
    const next = [
      ...existing.filter((override) => override.id !== groupId),
      {
        id: groupId,
        name: group.name,
        documentIds: group.documents.map((document) => document.documentId),
        inactive: true,
      },
    ];
    await persistOverrides(next);
  }

  async function selectApplication(applicationId: string) {
    await activateSession(applicationId);
    router.push(`/prepare?applicationId=${applicationId}`);
  }

  async function calculate() {
    if (!session) return;
    const saved = await runAnnualizedIncomeCalculationForSession(session.id);
    setSession(saved);
    setAnnouncement(tr("calculationUpdated"));
  }

  async function downloadBundle() {
    if (!session) return;
    const missingUploads = session.documents.filter(
      (document) => document.isUploaded && !getUploadedFile(document.id, session.id),
    );
    if (missingUploads.length > 0) {
      setAnnouncement(tr("reuploadBeforeBundle", { files: missingUploads.map((document) => document.fileName).join(", ") }));
      return;
    }
    setBundling(true);
    const saved = await runAnnualizedIncomeCalculationForSession(session.id);
    setSession(saved);
    const bundle = await generatePreparationBundle(saved);
    const url = URL.createObjectURL(bundle);
    const link = document.createElement("a");
    link.href = url;
    link.download = `realdoor-preparation-bundle-${saved.id.slice(0, 8)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setAnnouncement(tr("bundleGenerated"));
    setBundling(false);
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("prepareEyebrow")} title={tr("prepareTitle")}>
        <p>{tr("prepareIntro")}</p>
      </PageHeader>

      {loading ? (
        <p>{tr("loadingApplications")}</p>
      ) : !session ? (
        <section className="case-panel-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-[#172026]">{tr("chooseApplication")}</h2>
          <p className="mt-2 text-sm leading-6 text-[#52616b]">{tr("chooseApplicationIntro")}</p>
          {sessions.length === 0 ? (
            <p className="mt-4 text-sm text-[#52616b]">{tr("noSavedApplications")}</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {sessions.map((item) => {
                const progress = progressFor(item);
                return (
                  <article key={item.id} className="field-card bg-[#fffdf7] p-4">
                    <h3 className="font-semibold text-[#172026]">
                      {tr("applicationShort", { id: item.id.slice(0, 8) })}
                    </h3>
                    <p className="mt-1 text-sm text-[#52616b]">
                      {housingProgram.metroName}. {item.setup.incomeSources.map(incomeSourceLabel).join(", ") || tr("incomeSources")}.
                    </p>
                    <p className="mt-1 text-sm text-[#52616b]">
                      {progress.resolved}/{progress.total} {tr("documents")}. {tr("needsReview")}: {progress.needsReview}. {new Date(item.updatedAt).toLocaleString()}.
                    </p>
                    <Button type="button" className="mt-3" onClick={() => void selectApplication(item.id)}>
                      {tr("selectApplication")}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-5">
          <section className="case-panel-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#172026]">{tr("selectedApplication")}</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-[#172026]">{tr("selectedApplication")}</dt>
                    <dd className="mt-1 text-[#334e68]">{tr("applicationShort", { id: session.id.slice(0, 8) })}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#172026]">{tr("metroProgramLabel")}</dt>
                    <dd className="mt-1 text-[#334e68]">{housingProgram.metroName} - {housingProgram.programName}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#172026]">{tr("confirmedIncomeSources")}</dt>
                    <dd className="mt-1 text-[#334e68]">
                      {session.setup.incomeSources.map(incomeSourceLabel).join(", ") || tr("incomeSources")}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#172026]">{tr("includedDocuments")}</dt>
                    <dd className="mt-1 text-[#334e68]">
                      {session.documents.length > 0
                        ? session.documents.map((document) => `${documentTypeLabel(document.type)}: ${document.fileName}`).join("; ")
                        : tr("noFileSelected")}
                    </dd>
                  </div>
                </dl>
              </div>
              <Link className={buttonVariants({ variant: "outline" })} href="/prepare">
                {tr("switchApplication")}
              </Link>
            </div>
          </section>

          <section className="case-panel-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-[#172026]">{tr("frozenScenario")}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="font-semibold text-[#172026]">{tr("metroHmfa")}</dt><dd className="mt-1 text-[#334e68]">{threshold?.hudArea ?? canonicalScenario.label}</dd></div>
              <div><dt className="font-semibold text-[#172026]">{tr("amiPercentage")}</dt><dd className="mt-1 text-[#334e68]">{threshold ? `${threshold.amiPercent}%` : tr("noFrozenThreshold")}</dd></div>
              <div><dt className="font-semibold text-[#172026]">{tr("householdSize")}</dt><dd className="mt-1 text-[#334e68]">{session.setup.householdSize}</dd></div>
              <div><dt className="font-semibold text-[#172026]">{tr("thresholdAmount")}</dt><dd className="mt-1 text-[#334e68]">{threshold ? currency.format(threshold.thresholdAmount) : tr("noFrozenThreshold")}</dd></div>
              <div><dt className="font-semibold text-[#172026]">{tr("effectiveDate")}</dt><dd className="mt-1 text-[#334e68]">{threshold?.effectiveDate ?? tr("noFrozenThreshold")}</dd></div>
              <div><dt className="font-semibold text-[#172026]">{tr("sourceFile")}</dt><dd className="mt-1 text-[#334e68]">{canonicalScenario.thresholdSourceFile}</dd></div>
            </dl>
          </section>

          <section className="case-panel-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#172026]">{tr("incomeSourcesReview")}</h2>
                <p className="mt-2 text-sm leading-6 text-[#52616b]">{tr("incomeSourcesReviewIntro")}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void mergeAllGroups()} disabled={incomeGroups.length < 2}>
                {tr("merge")}
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {incomeGroups.map((group, index) => (
                <article key={group.id} className="field-card bg-[#fffdf7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-[#172026]">
                        {group.name || `${tr("incomeSourcesReview")} ${index + 1}`}
                      </h3>
                      <p className="mt-1 text-sm text-[#52616b]">
                        {group.documents.length} {tr("supportingDocuments")}. {group.explanation}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#334e68]">{tr("supportingDocuments")}</p>
                      <ul className="mt-1 grid gap-1 text-sm text-[#52616b]">
                        {group.documents.map((document) => (
                          <li key={document.documentId}>
                            {document.fileName} - {document.sourceDocumentId}
                          </li>
                        ))}
                      </ul>
                      {group.warnings.length > 0 ? (
                        <div className="mt-3 rounded-md border border-[#b7791f] bg-[#fff8db] p-3 text-sm text-[#744210]">
                          <p className="font-semibold">{tr("proposedSameJobQuestion")}</p>
                          <p>{tr("sameJobSignals")}</p>
                          <ul className="mt-2 list-disc pl-5">
                            {group.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div className="action-row">
                      <Button type="button" variant="outline" onClick={() => void renameGroup(group.id)}>{tr("rename")}</Button>
                      <Button type="button" variant="outline" onClick={() => void splitGroup(group.id)} disabled={group.documents.length < 2}>{tr("split")}</Button>
                      <Button type="button" variant="ghost" onClick={() => void markInactive(group.id)}>{tr("markInactive")}</Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="case-panel case-tab p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Calculator aria-hidden="true" className="mt-1 size-6 text-[#6b5b3f]" />
              <div>
                <h2 className="text-xl font-semibold text-[#172026]">{tr("annualizedIncome")}</h2>
                <p className="mt-2 text-sm leading-6 text-[#52616b]">{tr("calculationDisclaimer")}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button type="button" size="lg" onClick={() => void calculate()}>
                {tr("calculateConfirmed")}
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={() => void downloadBundle()} disabled={bundling}>
                {bundling ? tr("buildingBundle") : tr("downloadBundle")}
              </Button>
            </div>
          </section>

          {unresolved.length > 0 ? (
            <section className="case-panel border-[#b7791f] bg-[#fff8db] p-5">
              <h2 className="text-xl font-semibold text-[#172026]">{tr("unresolvedInformation")}</h2>
              <ul className="mt-3 grid gap-2 text-sm text-[#744210]">
                {unresolved.map((task) => (
                  <li key={task.id}>{task.title}: <StatusBadge status={session.checklist[task.id] ?? "missing"} /></li>
                ))}
              </ul>
            </section>
          ) : null}

          {reviewedFields.length === 0 ? (
            <EmptyState title={tr("noConfirmedFieldsTitle")}>
              <p>{tr("noConfirmedFieldsBody")}</p>
              <p className="mt-3">
                <Link href="/documents" className="font-semibold underline">{tr("openDocuments")}</Link>
              </p>
            </EmptyState>
          ) : null}

          {calculation ? (
            <section className="case-panel-white p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-[#172026]">{tr("result", { amount: currency.format(calculation.annualizedIncome) })}</h2>
              <p className="mt-2 text-base font-semibold text-[#172026]">{tr("frozenThresholdComparison", { comparison: calculation.thresholdComparison })}</p>
              <p className="mt-1 text-sm text-[#52616b]">{tr("reviewHandoffStatus", { status: calculation.readinessStatus })}</p>
              <p className="mt-2 text-sm text-[#52616b]">{tr("calculatedAt", { date: new Date(calculation.calculatedAt).toLocaleString() })}</p>
              <dl className="mt-5 grid gap-3 text-sm">
                <div>
                  <dt className="font-semibold text-[#172026]">{tr("frozenAmiThreshold")}</dt>
                  <dd className="mt-1 text-[#334e68]">
                    {calculation.thresholdAmount
                      ? `${calculation.amiPercent}% AMI, ${currency.format(calculation.thresholdAmount)}, ${tr("effectiveDate")} ${calculation.thresholdEffectiveDate}`
                      : tr("noThresholdForSize")}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#172026]">{tr("annualizedLines")}</dt>
                  <dd className="mt-2">
                    {annualizedLines.length > 0 ? (
                      <ul className="grid gap-2">
                        {annualizedLines.map((line) => (
                          <li key={`${line.documentId}-${line.amountLabel}-${line.frequency}`} className="evidence-box text-[#334e68]">
                            <span className="font-semibold">{line.sourceDocumentId}</span>: {line.amountLabel} {currency.format(line.amount)} x {line.multiplier} ({line.frequency}) = {currency.format(line.annualizedAmount)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[#52616b]">{tr("noAmountFrequencyPairs")}</span>
                    )}
                  </dd>
                </div>
                <div><dt className="font-semibold text-[#172026]">{tr("formula")}</dt><dd className="mt-1 text-[#334e68]">{calculation.formula}</dd></div>
                <div>
                  <dt className="font-semibold text-[#172026]">{tr("inputsUsed")}</dt>
                  <dd className="mt-2">
                    {calculation.inputs.length > 0 ? (
                      <ul className="grid gap-2">
                        {calculation.inputs.map((input, index) => (
                          <li key={`${input.documentId}-${input.fieldKey}-${index}`} className="evidence-box text-[#334e68]">
                            {input.label}: {String(input.value)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[#52616b]">{tr("noAmountFrequencyPairs")}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#172026]">{tr("citation")}</dt>
                  <dd className="mt-2 grid gap-2">
                    {calculation.citationIds.map((citationId) => {
                      const citation = ruleCitations.find((item) => item.id === citationId);
                      return citation ? (
                        <a key={citation.id} href={citation.sourceUrl} className="text-[#1b5e8c] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40">
                          {citation.title}
                        </a>
                      ) : null;
                    })}
                  </dd>
                </div>
              </dl>
              {calculation.warnings.length > 0 ? (
                <div className="mt-5 rounded-md border border-[#b7791f] bg-[#fff8db] p-3 text-sm text-[#744210]">
                  <h3 className="font-semibold">{tr("calculationNotes")}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {calculation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

export default function PreparePage() {
  return (
    <Suspense fallback={<AppShell><p>Loading preparation.</p></AppShell>}>
      <PrepareContent />
    </Suspense>
  );
}
