import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#b8af9d] bg-[#fffdf7] p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#172026]">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-[#52616b]">{children}</div>
    </div>
  );
}
