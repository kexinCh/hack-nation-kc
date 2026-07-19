"use client";

import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n";
import { deleteAllSessions } from "@/lib/session/session-store";
import { useSession } from "@/lib/session/use-session";

export default function PrivacyPage() {
  const { announcement, setAnnouncement, setSession } = useSession();
  const { tr } = useTranslations();
  const points = ["privacyPoint1", "privacyPoint2", "privacyPoint3", "privacyPoint4", "privacyPoint5", "privacyPoint6"];

  async function deleteEverything() {
    await deleteAllSessions();
    setSession(undefined);
    setAnnouncement(tr("allDataDeleted"));
  }

  return (
    <AppShell announcement={announcement}>
      <PageHeader eyebrow={tr("privacyEyebrow")} title={tr("privacyTitle")}>
        <p>{tr("privacyIntro")}</p>
      </PageHeader>

      <section className="case-panel case-tab p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-[#172026]">{tr("storageSafety")}</h2>
        <ul className="mt-4 grid gap-3 text-base leading-7 text-[#334e68]">
          {points.map((point) => (
            <li key={point}>{tr(point)}</li>
          ))}
        </ul>
        <div className="action-row mt-6 border-t border-[#d8d0bf] pt-5">
          <Button type="button" variant="destructive" size="lg" onClick={() => void deleteEverything()}>
            {tr("deleteAllData")}
          </Button>
          <Link className={buttonVariants({ variant: "outline", size: "lg" })} href="/">
            {tr("home")}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
