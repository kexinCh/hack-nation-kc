import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6 border-b border-[#d8d0bf] pb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b5b3f]">
        {eyebrow}
      </p>
      <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-[#172026] sm:text-4xl">
        {title}
      </h1>
      <div className="mt-3 max-w-3xl text-base leading-7 text-[#52616b]">{children}</div>
    </div>
  );
}
