"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n";

export function StatusBadge({ status }: { status: string }) {
  const { statusLabel } = useTranslations();

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
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
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-[#6b5b3f]",
          (status === "confirmed" || status === "corrected") && "bg-[#2f855a]",
          (status === "needs_review" || status === "extracted" || status === "DO_NOT_HAVE") && "bg-[#b7791f]",
          (status === "missing" || status === "error") && "bg-[#c53030]",
          status === "added" && "bg-[#3182ce]",
        )}
      />
      {statusLabel(status)}
    </span>
  );
}
