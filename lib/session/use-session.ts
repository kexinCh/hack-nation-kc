"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApplicationSession } from "@/lib/housing/types";
import {
  deleteActiveSession,
  ensureActiveSession,
  getActiveSession,
  saveSession,
} from "@/lib/session/session-store";

export function useSession(options: { createIfMissing?: boolean } = {}) {
  const [session, setSession] = useState<ApplicationSession | undefined>();
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const nextSession = options.createIfMissing
      ? await ensureActiveSession()
      : await getActiveSession();
    setSession(nextSession);
    setLoading(false);
    return nextSession;
  }, [options.createIfMissing]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const nextSession = options.createIfMissing
        ? await ensureActiveSession()
        : await getActiveSession();

      if (!cancelled) {
        setSession(nextSession);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [options.createIfMissing]);

  const persist = useCallback(async (nextSession: ApplicationSession, message = "Changes saved.") => {
    const saved = await saveSession(nextSession);
    setSession(saved);
    setAnnouncement(message);
    return saved;
  }, []);

  const remove = useCallback(async () => {
    await deleteActiveSession();
    setSession(undefined);
    setAnnouncement("Session deleted.");
  }, []);

  return {
    session,
    loading,
    announcement,
    setAnnouncement,
    reload,
    persist,
    remove,
    setSession,
  };
}
