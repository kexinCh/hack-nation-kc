"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ApplicationSession, PreferredLanguage } from "@/lib/housing/types";
import { languageOptions, useTranslations } from "@/lib/i18n";
import { activateSession, deleteSession, listSessions } from "@/lib/session/session-store";

export default function Home() {
  const router = useRouter();
  const { language, setLanguage, t, tr } = useTranslations();
  const [sessions, setSessions] = useState<ApplicationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  async function loadSessions() {
    setLoading(true);
    setSessions(await listSessions());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const nextSessions = await listSessions();
      if (!cancelled) {
        setSessions(nextSessions);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openSession(sessionId: string, destination: "/dashboard" | "/setup") {
    await activateSession(sessionId);
    router.push(destination);
  }

  async function removeSession(sessionId: string) {
    await deleteSession(sessionId);
    setAnnouncement(tr("applicationDeleted"));
    await loadSessions();
  }

  function changeLanguage(nextLanguage: PreferredLanguage) {
    setLanguage(nextLanguage);
    setAnnouncement(tr("languageUpdated"));
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("homeEyebrow")} title={tr("homeTitle")}>
        <p>{tr("homeIntro")}</p>
      </PageHeader>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="case-panel case-tab p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-1 size-6 text-[#2f855a]" />
            <div className="w-full">
              <h2 className="text-xl font-semibold text-[#172026]">{tr("whatToolDoes")}</h2>
              <ul className="mt-4 space-y-3 text-base leading-7 text-[#334e68]">
                <li>{tr("homePoint1")}</li>
                <li>{tr("homePoint2")}</li>
                <li>{tr("homePoint3")}</li>
                <li>{tr("homePoint4")}</li>
              </ul>
              <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="home-language" className="block text-sm font-semibold text-[#172026]">
                    {t.language}
                  </label>
                  <select
                    id="home-language"
                    value={language}
                    onChange={(event) => changeLanguage(event.currentTarget.value as PreferredLanguage)}
                    className="form-input mt-2"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Link className={buttonVariants({ size: "lg" })} href="/setup?new=1">
                  {t.startApplication}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="case-panel-white p-6">
          <h2 className="text-xl font-semibold text-[#172026]">{t.savedAttempts}</h2>
          {loading ? (
            <p className="mt-3 text-sm text-[#52616b]">{tr("loadingSaved")}</p>
          ) : sessions.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-[#52616b]">{t.noSavedAttempts}</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {sessions.map((session) => (
                <article key={session.id} className="field-card bg-[#fffdf7] p-4">
                  <h3 className="font-semibold text-[#172026]">
                    {tr("applicationShort", { id: session.id.slice(0, 8) })}
                  </h3>
                  <p className="mt-1 text-sm text-[#52616b]">
                    {tr("updatedHouseholdDocuments", {
                      date: new Date(session.updatedAt).toLocaleString(),
                      size: session.setup.householdSize,
                      count: session.documents.length,
                    })}
                  </p>
                  <div className="action-row mt-4">
                    <Button type="button" onClick={() => void openSession(session.id, "/dashboard")}>
                      {t.resume}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void openSession(session.id, "/setup")}
                    >
                      <Pencil aria-hidden="true" />
                      {t.edit}
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => void removeSession(session.id)}>
                      <Trash2 aria-hidden="true" />
                      {t.delete}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
