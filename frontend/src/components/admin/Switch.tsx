import cn from "classnames";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]",
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[26px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}