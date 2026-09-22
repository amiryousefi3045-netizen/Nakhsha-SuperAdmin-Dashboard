import cn from "classnames";

export type BadgeTone =
  | "green"
  | "red"
  | "amber"
  | "blue"
  | "violet"
  | "gray"
  | "gold";

export const badgeTones: Record<BadgeTone, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
  gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}

export function StatusBadge({ label, tone = "gray", className, title }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── Tone mappers ───────────────────────────────────────────────────────────

const ROLE_TONE: Record<string, BadgeTone> = {
  user: "gray",
  creator: "blue",
  seller: "green",
  admin: "violet",
  super_admin: "gold",
};

export function roleTone(role: string): BadgeTone {
  return ROLE_TONE[role] ?? "gray";
}

const LISTING_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "gray",
  pending: "amber",
  published: "green",
  rejected: "red",
  archived: "gray",
};

export function listingStatusTone(status: string): BadgeTone {
  return LISTING_STATUS_TONE[status] ?? "gray";
}

const PROTECTED_TONE: Record<string, BadgeTone> = {
  active: "green",
  suspended: "red",
  pending: "amber",
};

export function providerStatusTone(status: string): BadgeTone {
  return PROTECTED_TONE[status] ?? "gray";
}

const RISK_TONE: Record<string, BadgeTone> = {
  LOW: "green",
  MEDIUM: "blue",
  HIGH: "amber",
  CRITICAL: "red",
};

export function riskTone(risk: string): BadgeTone {
  return RISK_TONE[risk] ?? "gray";
}

// ── Persian labels ─────────────────────────────────────────────────────────

export const ROLE_LABEL: Record<string, string> = {
  user: "کاربر",
  creator: "کریتور",
  seller: "فروشنده",
  admin: "ادمین",
  super_admin: "سوپر ادمین",
};

export const LISTING_STATUS_LABEL: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار",
  published: "منتشرشده",
  rejected: "ردشده",
  archived: "بایگانی",
};

export const LISTING_TYPE_LABEL: Record<string, string> = {
  post: "پست",
  tour: "تور",
  training: "آموزش",
  academy: "آکادمی",
};

export const CRAFT_KIND_LABEL: Record<string, string> = {
  artwork: "اثر هنری",
  class: "کلاس",
  service: "خدمات",
};