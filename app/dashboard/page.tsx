"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { checklistForIncomeSources } from "@/lib/housing/checklist";
import { housingProgram } from "@/lib/housing/program";
import { useTranslations } from "@/lib/i18n";
import { useSession } from "@/lib/session/use-session";

export default function DashboardPage() {
  const { session, loading, announcement } = useSession({ createIfMissing: true });
  const { tr, requestTitle, requestDescription } = useTranslations();

  const visibleChecklist = session ? checklistForIncomeSources(session.setup.incomeSources) : [];
  const statuses = visibleChecklist.map((task) => session?.checklist[task.id] ?? "missing");
  const missing = statuses.filter((status) => status === "missing" || status === "DO_NOT_HAVE").length;
  const needsReview = statuses.filter((status) => status === "needs_review").length;
  const confirmed = statuses.filter((status) => status === "confirmed").length;
  const nextTask = visibleChecklist.find((task) => session?.checklist[task.id] !== "confirmed");
  const reviewDocument = session?.documents.find((document) => document.status === "needs_review");

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("dashboardEyebrow")} title={tr("dashboardTitle")}>
        <p>
          {tr("dashboardIntro", {
            program: housingProgram.programName,
            rule: housingProgram.ruleVersion,
          })}
        </p>
      </PageHeader>

      {loading || !session ? (
        <p>{tr("loadingDashboard")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="case-panel case-tab p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-[#172026]">{tr("bestNextStep")}</h2>
            <p className="mt-3 text-base leading-7 text-[#334e68]">
              {reviewDocument
                ? tr("reviewFieldsFrom", { title: reviewDocument.title })
                : nextTask
                  ? tr("addOrResolveTask", { title: requestTitle(nextTask.documentType).toLowerCase() })
                  : tr("reviewPacket")}
            </p>
            <div className="mt-5">
              <Link
                className={buttonVariants({ size: "lg" })}
                href={reviewDocument ? `/documents/${reviewDocument.id}/review` : "/documents"}
              >
                {reviewDocument ? tr("reviewFields") : tr("openDocuments")}
              </Link>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-[#d8d0bf] pt-5">
              <div>
                <dt className="text-xs font-semibold uppercase text-[#52616b]">{tr("missing")}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#172026]">{missing}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#52616b]">{tr("needsReview")}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#172026]">{needsReview}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#52616b]">{tr("confirmed")}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[#172026]">{confirmed}</dd>
              </div>
            </dl>
            <p className="mt-5 text-sm text-[#52616b]">
              {tr("deadline", {
                deadline: session.setup.deadline || tr("noDeadline"),
                date: new Date(session.updatedAt).toLocaleString(),
              })}
            </p>
          </section>

          <section className="case-panel-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <ClipboardList aria-hidden="true" className="size-5 text-[#6b5b3f]" />
              <h2 className="text-xl font-semibold text-[#172026]">{tr("quickTaskList")}</h2>
            </div>
            <div className="mt-5 divide-y divide-[#e5ddcf]">
              {visibleChecklist.length === 0 ? (
                <p className="py-4 text-sm leading-6 text-[#52616b]">
                  {tr("noDocumentRequests")}
                </p>
              ) : null}
              {visibleChecklist.map((task) => (
                <Link
                  key={task.id}
                  href={`/documents#${task.id}`}
                  className="grid gap-3 rounded-md px-3 py-4 outline-none transition hover:bg-[#fffdf7] focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <h3 className="font-semibold text-[#172026]">{requestTitle(task.documentType)}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#52616b]">{requestDescription(task.documentType)}</p>
                  </div>
                  <div className="sm:text-right">
                    <StatusBadge status={session.checklist[task.id] ?? "missing"} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
