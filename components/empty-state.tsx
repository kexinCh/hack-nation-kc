import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#c8bfae] bg-[#fffdf7] p-5">
      <h2 className="text-lg font-semibold text-[#172026]">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-[#52616b]">{children}</div>
    </div>
  );
}
