"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { HouseholdSetup, IncomeSource } from "@/lib/housing/types";
import { getStoredLanguage, useTranslations } from "@/lib/i18n";
import { createSession, updateSetup } from "@/lib/session/session-store";
import { useSession } from "@/lib/session/use-session";

const supportedProgram = {
  id: "boston-lihtc-2026",
  label: "Boston-Cambridge-Quincy, MA-NH HMFA - LIHTC 2026",
};

const futurePrograms = [
  "Austin-Round Rock-Georgetown, TX MSA",
  "New York-Jersey City-White Plains, NY-NJ HMFA",
];

const incomeSources: IncomeSource[] = [
  "employment",
  "benefits",
  "gig_self_employment",
  "gifts_support",
  "no_current_income",
  "other",
];

function defaultDraft(): HouseholdSetup {
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

function SetupContent() {
  const router = useRouter();
  const { tr, incomeSourceLabel, incomeSourceDescription } = useTranslations();
  const searchParams = useSearchParams();
  const creatingNew = searchParams.get("new") === "1";
  const { session, loading, announcement, setAnnouncement, setSession } = useSession({
    createIfMissing: false,
  });
  const [draft, setDraft] = useState<HouseholdSetup>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!creatingNew && session) {
      queueMicrotask(() => setDraft(session.setup));
    }
  }, [creatingNew, session]);

  const noIncomeConflict = useMemo(
    () => draft.incomeSources.includes("no_current_income") && draft.incomeSources.length > 1,
    [draft.incomeSources],
  );

  function sourceHasDocuments(source: IncomeSource) {
    if (!session) return false;
    const sourceTypes: Record<IncomeSource, string[]> = {
      employment: ["pay_stub", "employment_letter"],
      benefits: ["benefit_letter"],
      gig_self_employment: ["gig_statement"],
      gifts_support: ["support_letter"],
      other: ["other_income_proof"],
      no_current_income: [],
    };
    return session.documents.some((document) => sourceTypes[source].includes(document.type));
  }

  async function saveDraft(nextDraft: HouseholdSetup) {
    setDraft(nextDraft);
    if (!creatingNew && session) {
      setSaving(true);
      const saved = await updateSetup(nextDraft);
      setSession(saved);
      setAnnouncement(tr("setupSaved"));
      setSaving(false);
    }
  }

  function toggleIncomeSource(source: IncomeSource) {
    const selected = draft.incomeSources.includes(source);
    if (selected && sourceHasDocuments(source) && !window.confirm(tr("removedSourceRetainConfirm"))) {
      return;
    }
    const incomeSources = selected
      ? draft.incomeSources.filter((item) => item !== source)
      : [...draft.incomeSources, source];
    setErrors((current) => ({ ...current, incomeSources: "" }));
    void saveDraft({ ...draft, incomeSources });
  }

  function validateSetup() {
    const nextErrors: Record<string, string> = {};
    if (draft.metroProgramId !== "boston-lihtc-2026") {
      nextErrors.program = tr("missingSetupRequired");
    }
    if (!Number.isFinite(draft.householdSize) || draft.householdSize < 1) {
      nextErrors.householdSize = tr("missingSetupRequired");
    }
    if (draft.incomeSources.length === 0) {
      nextErrors.incomeSources = tr("missingIncomeSource");
    }
    if (noIncomeConflict) {
      nextErrors.incomeSources = tr("resolveNoIncomeConflict");
    }
    if (draft.incomeSources.includes("gifts_support") && !draft.giftSupportDescription?.trim()) {
      nextErrors.giftSupportDescription = tr("missingGiftDescription");
    }
    if (draft.incomeSources.includes("other") && !draft.otherIncomeDescription?.trim()) {
      nextErrors.otherIncomeDescription = tr("missingOtherDescription");
    }
    if (!getStoredLanguage()) {
      nextErrors.preferredLanguage = tr("missingSetupRequired");
    }

    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const element = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstError}"]`);
      element?.scrollIntoView({ block: "center" });
      const input = element?.querySelector<HTMLElement>("input,select,textarea,button");
      input?.focus();
      return false;
    }
    return true;
  }

  async function continueToDashboard() {
    if (!validateSetup()) {
      return;
    }
    setSaving(true);
    const setup = { ...draft, preferredLanguage: getStoredLanguage() };
    const saved = creatingNew || !session ? await createSession(setup) : await updateSetup(setup);
    setSession(saved);
    setAnnouncement(tr("applicationSaved", { id: saved.id.slice(0, 8) }));
    setSaving(false);
    router.push("/dashboard");
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("setupEyebrow")} title={tr("setupTitle")}>
        <p>{tr("setupIntro")}</p>
      </PageHeader>

      {loading && !creatingNew ? (
        <p>{tr("loadingSetup")}</p>
      ) : (
        <form ref={formRef} className="grid gap-5 rounded-lg border border-[#d8d0bf] bg-[#fffdf7] p-5">
          <fieldset data-field="program">
            <legend className="text-sm font-semibold text-[#172026]">{tr("metroProgram")}</legend>
            <div className="mt-3 grid gap-3">
              <label className="flex items-start gap-3 rounded-md border border-[#183b56] bg-white p-3 text-sm">
                <input type="radio" name="program" checked readOnly className="mt-1" />
                <span>
                  <span className="block font-semibold text-[#172026]">{supportedProgram.label}</span>
                  <span className="block text-[#52616b]">{tr("supportedScenario")}</span>
                </span>
              </label>
              {futurePrograms.map((program) => (
                <label key={program} className="flex items-start gap-3 rounded-md border border-[#d8d0bf] bg-[#f3efe4] p-3 text-sm text-[#52616b]">
                  <input type="radio" name="program" disabled className="mt-1" />
                  <span>{program} - {tr("comingSoon")}</span>
                </label>
              ))}
            </div>
            {errors.program ? <p className="mt-2 text-sm text-[#742a2a]" role="alert">{errors.program}</p> : null}
          </fieldset>

          <div data-field="householdSize">
            <label htmlFor="household-size" className="block text-sm font-semibold text-[#172026]">
              {tr("householdSize")}
            </label>
            <input
              id="household-size"
              type="number"
              min={1}
              max={12}
              value={draft.householdSize}
              onChange={(event) =>
                void saveDraft({ ...draft, householdSize: Number(event.currentTarget.value) })
              }
              className="mt-2 h-11 w-full max-w-xs rounded-md border border-[#b8af9d] bg-white px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
            />
            {errors.householdSize ? <p className="mt-2 text-sm text-[#742a2a]" role="alert">{errors.householdSize}</p> : null}
          </div>

          <fieldset data-field="incomeSources">
            <legend className="text-sm font-semibold text-[#172026]">{tr("incomeSources")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {incomeSources.map((source) => (
                <label
                  key={source}
                  className="flex min-h-16 items-start gap-3 rounded-md border border-[#b8af9d] bg-white px-3 py-3 text-sm focus-within:ring-3 focus-within:ring-[#2f80ed]/40"
                >
                  <input
                    type="checkbox"
                    value={source}
                    checked={draft.incomeSources.includes(source)}
                    onChange={() => toggleIncomeSource(source)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-semibold text-[#172026]">{incomeSourceLabel(source)}</span>
                    <span className="block text-[#52616b]">{incomeSourceDescription(source)}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.incomeSources ? <p className="mt-2 text-sm text-[#742a2a]" role="alert">{errors.incomeSources}</p> : null}
          </fieldset>

          {draft.incomeSources.includes("gifts_support") ? (
            <div data-field="giftSupportDescription">
              <label htmlFor="gift-description" className="block text-sm font-semibold text-[#172026]">
                {tr("giftDescription")}
              </label>
              <input
                id="gift-description"
                value={draft.giftSupportDescription ?? ""}
                onChange={(event) =>
                  void saveDraft({ ...draft, giftSupportDescription: event.currentTarget.value })
                }
                className="mt-2 h-11 w-full rounded-md border border-[#b8af9d] bg-white px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
              />
              {errors.giftSupportDescription ? <p className="mt-2 text-sm text-[#742a2a]" role="alert">{errors.giftSupportDescription}</p> : null}
            </div>
          ) : null}

          {draft.incomeSources.includes("other") ? (
            <div data-field="otherIncomeDescription">
              <label htmlFor="other-description" className="block text-sm font-semibold text-[#172026]">
                {tr("otherDescription")}
              </label>
              <input
                id="other-description"
                value={draft.otherIncomeDescription ?? ""}
                onChange={(event) =>
                  void saveDraft({ ...draft, otherIncomeDescription: event.currentTarget.value })
                }
                className="mt-2 h-11 w-full rounded-md border border-[#b8af9d] bg-white px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
              />
              {errors.otherIncomeDescription ? <p className="mt-2 text-sm text-[#742a2a]" role="alert">{errors.otherIncomeDescription}</p> : null}
            </div>
          ) : null}

          {noIncomeConflict ? (
            <p role="alert" className="rounded-md border border-[#b7791f] bg-[#fff8db] p-3 text-sm leading-6 text-[#744210]">
              {tr("noIncomeConflict")}
            </p>
          ) : null}

          <div>
            <label htmlFor="deadline" className="block text-sm font-semibold text-[#172026]">
              {tr("optionalDeadline")}
            </label>
            <input
              id="deadline"
              type="date"
              value={draft.deadline ?? ""}
              onChange={(event) => void saveDraft({ ...draft, deadline: event.currentTarget.value })}
              className="mt-2 h-11 w-full max-w-xs rounded-md border border-[#b8af9d] bg-white px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-[#d8d0bf] pt-5 sm:flex-row sm:items-center">
            <Button type="button" size="lg" onClick={() => void continueToDashboard()} disabled={saving}>
              {tr("continueDashboard")}
            </Button>
            <p role="status" className="text-sm text-[#52616b]">
              {saving
                ? tr("savingBrowser")
                : creatingNew
                  ? tr("newApplicationCreatedOnContinue")
                  : tr("changesAutosave")}
            </p>
          </div>
        </form>
      )}
    </AppShell>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<AppShell><p>Loading setup.</p></AppShell>}>
      <SetupContent />
    </Suspense>
  );
}
