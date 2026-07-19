"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { housingProgram } from "@/lib/housing/program";
import { ruleCitations } from "@/lib/housing/rules-2026";
import { useTranslations } from "@/lib/i18n";

export default function UnderstandPage() {
  const { tr } = useTranslations();

  return (
    <AppShell>
      <PageHeader eyebrow={tr("understandEyebrow")} title={tr("understandTitle")}>
        <p>{tr("understandIntro")}</p>
      </PageHeader>

      <div className="grid gap-5">
        <section className="rounded-lg border border-[#d8d0bf] bg-[#fffdf7] p-5">
          <h2 className="text-xl font-semibold text-[#172026]">{housingProgram.ruleVersion}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-[#172026]">{tr("metro")}</dt>
              <dd className="mt-1 text-[#52616b]">{housingProgram.metroName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#172026]">{tr("hudArea")}</dt>
              <dd className="mt-1 text-[#52616b]">{housingProgram.hudAreaCode}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#172026]">{tr("program")}</dt>
              <dd className="mt-1 text-[#52616b]">{housingProgram.programName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#172026]">{tr("ruleVersion")}</dt>
              <dd className="mt-1 text-[#52616b]">{housingProgram.ruleVersion}</dd>
            </div>
          </dl>
        </section>

        {ruleCitations.map((citation) => (
          <article key={citation.id} className="rounded-lg border border-[#d8d0bf] bg-white p-5">
            <h2 className="text-xl font-semibold text-[#172026]">{citation.title}</h2>
            <p className="mt-3 text-base leading-7 text-[#334e68]">
              {citation.plainLanguageSummary}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-[#172026]">{tr("officialCitation")}</dt>
                <dd className="mt-1">
                  <a
                    href={citation.sourceUrl}
                    className="text-[#1b5e8c] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
                  >
                    {citation.sourceName}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("effectiveDate")}</dt>
                <dd className="mt-1 text-[#52616b]">{citation.effectiveDate}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#172026]">{tr("ruleVersion")}</dt>
                <dd className="mt-1 text-[#52616b]">{citation.ruleVersion}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
