import type { FC, ReactNode } from "react";

export interface ListingTypeCardProps {
  /** lucide-react or any ReactNode icon */
  icon: ReactNode;
  title: string;
  description: string;
  /** Tailwind bg class for the icon bubble, e.g. "bg-sky-100" */
  iconBg: string;
  /** Tailwind text class for the icon, e.g. "text-sky-600" */
  iconColor: string;
  /** Tailwind class for the top accent stripe, e.g. "bg-sky-500" */
  accentBar: string;
  onClick: () => void;
  selected?: boolean;
}

const ListingTypeCard: FC<ListingTypeCardProps> = ({
  icon,
  title,
  description,
  iconBg,
  iconColor,
  accentBar,
  onClick,
  selected = false,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      dir="rtl"
      className={[
        // base layout
        "group relative flex flex-col items-start gap-4 w-full text-right",
        "rounded-2xl bg-white border-2 p-6 pt-0",
        "shadow-sm transition-all duration-200 cursor-pointer",
        // hover / focus
        "hover:shadow-lg hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        // selected vs idle border + ring colour
        selected
          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20"
          : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40",
      ].join(" ")}
    >
      {/* Coloured top accent stripe */}
      <div
        className={`${accentBar} w-full h-1.5 rounded-t-2xl absolute top-0 right-0 left-0`}
      />

      {/* Content starts below stripe */}
      <div className="flex flex-col items-start gap-4 w-full mt-6">
        {/* Icon bubble */}
        <div
          className={`${iconBg} ${iconColor} w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0
            group-hover:scale-110 transition-transform duration-200`}
        >
          <span className="w-7 h-7 [&>svg]:w-full [&>svg]:h-full">{icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-[var(--color-text)] mb-1 leading-tight">
            {title}
          </h3>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            {description}
          </p>
        </div>

        {/* Arrow indicator */}
        <div
          className={`mt-1 mr-auto text-xs font-medium flex items-center gap-1 transition-colors duration-200
            ${selected ? "text-[var(--color-primary)]" : "text-[var(--color-muted)] group-hover:text-[var(--color-primary)]"}`}
        >
          <span>انتخاب</span>
          {/* left arrow for RTL "forward" */}
          <svg
            className="w-4 h-4 rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </button>
  );
};

export default ListingTypeCard;
