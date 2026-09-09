import type { ReactNode } from "react";
import cn from "classnames";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, icon, hint, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}