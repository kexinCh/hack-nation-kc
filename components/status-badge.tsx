"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n";

export function StatusBadge({ status }: { status: string }) {
  const { statusLabel } = useTranslations();

  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold",
        status === "confirmed" && "border-[#2f855a] bg-[#e6ffed] text-[#22543d]",
        status === "corrected" && "border-[#2f855a] bg-[#e6ffed] text-[#22543d]",
        status === "needs_review" && "border-[#b7791f] bg-[#fff8db] text-[#744210]",
        status === "extracted" && "border-[#b7791f] bg-[#fff8db] text-[#744210]",
        status === "missing" && "border-[#c53030] bg-[#fff5f5] text-[#742a2a]",
        status === "DO_NOT_HAVE" && "border-[#b7791f] bg-[#fff8db] text-[#744210]",
        status === "rejected" && "border-[#4a5568] bg-[#edf2f7] text-[#2d3748]",
        status === "skipped" && "border-[#718096] bg-[#edf2f7] text-[#2d3748]",
        status === "available" && "border-[#718096] bg-white text-[#2d3748]",
        status === "added" && "border-[#3182ce] bg-[#ebf8ff] text-[#2c5282]",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
