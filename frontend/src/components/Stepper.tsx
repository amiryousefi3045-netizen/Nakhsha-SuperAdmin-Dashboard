/**
 * Stepper – horizontal RTL progress indicator for multi-step wizards.
 * Steps flow right → left in Persian (step 1 is rightmost).
 * Completed steps show a check-mark and act as back-navigation links.
 */
import type { FC } from "react";
import { Check } from "lucide-react";

export interface StepItem {
  label: string;
}

interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  /** Called when user clicks a completed (past) step. */
  onStepClick?: (index: number) => void;
}

const Stepper: FC<StepperProps> = ({ steps, currentStep, onStepClick }) => {
  return (
    <div dir="rtl" className="w-full overflow-x-auto pb-1">
      <nav
        aria-label="مراحل ایجاد آگهی"
        className="flex items-start justify-center min-w-max mx-auto px-4 py-2 gap-0"
      >
        {steps.map((step, index) => {
          const isDone = index < currentStep;
          const isActive = index === currentStep;
          const isClickable = isDone && !!onStepClick;

          return (
            <div key={index} className="flex items-start">
              {/* ── Node ── */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick!(index)}
                  disabled={!isClickable}
                  aria-current={isActive ? "step" : undefined}
                  className={[
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
                    "border-2 transition-all duration-200 outline-none",
                    isDone
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white cursor-pointer hover:brightness-110"
                      : "",
                    isActive
                      ? "bg-white border-[var(--color-primary)] text-[var(--color-primary)] ring-4 ring-[var(--color-primary)]/15"
                      : "",
                    !isDone && !isActive
                      ? "bg-white border-[var(--color-border)] text-[var(--color-muted)] cursor-default"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>

                {/* Step label */}
                <span
                  className={[
                    "text-[11px] whitespace-nowrap font-medium transition-colors duration-200",
                    isActive
                      ? "text-[var(--color-primary)]"
                      : isDone
                        ? "text-[var(--color-text)]"
                        : "text-[var(--color-muted)]",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>

              {/* ── Connector line between nodes (not after last) ── */}
              {index < steps.length - 1 && (
                <div
                  className={[
                    "h-0.5 w-8 sm:w-14 mx-1 mt-[18px] flex-shrink-0 transition-colors duration-300 rounded-full",
                    isDone
                      ? "bg-[var(--color-primary)]"
                      : "bg-[var(--color-border)]",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default Stepper;
