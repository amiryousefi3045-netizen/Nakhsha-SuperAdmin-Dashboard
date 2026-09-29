import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, ShoppingCart, Wallet, History, X, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { subscribeSellerLiveEvents } from "../../services/sellerService";
import type {
  OrderStatus,
  SellerLiveAlert,
  SellerLiveEvent,
} from "../../types/seller";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { formatDateTime } from "../../lib/adminFormat";
import cn from "classnames";

/**
 * Live store notification bell (Phase 31, P1-05).
 *
 * Subscribes once to GET /seller/events/live (SSE over fetch+ReadableStream,
 * since EventSource cannot send the Authorization header) and surfaces order
 * transitions, settlement changes and store activity as a bell badge + toast.
 * The badge is the only source of truth for "unseen" events; the durable record
 * still lives in the activity feed / order pages.
 */

const MAX_ALERTS = 20;

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "در انتظار",
  confirmed: "تأییدشده",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  cancelled: "لغو‌شده",
  returned: "مرجوع‌شده",
};

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  requested: "درخواست‌شده",
  processing: "در حال بررسی",
  paid: "پرداخت‌شده",
  rejected: "ردشده",
  cancelled: "لغوشده",
};

const ACTION_LABEL: Record<string, string> = {
  PRODUCT_CREATED: "ایجاد محصول",
  PRODUCT_STATUS_CHANGED: "تغییر وضعیت محصول",
  PRODUCT_ARCHIVED: "بایگانی محصول",
  STOCK_ADJUSTED: "اصلاح موجودی",
  ORDER_CREATED: "سفارش جدید",
  ORDER_STATUS_CHANGED: "تغییر وضعیت سفارش",
  PAYOUT_REQUESTED: "درخواست تسویه",
  PAYOUT_CANCELLED: "لغو تسویه",
  PAYOUT_STATUS_CHANGED: "تغییر وضعیت تسویه",
  SELLER_SETTINGS_UPDATED: "به‌روزرسانی تنظیمات",
  TEAM_MEMBER_INVITED: "دعوت همکار",
  TEAM_MEMBER_ROLE_CHANGED: "تغییر نقش همکار",
  TEAM_MEMBER_REMOVED: "حذف همکار",
  REVIEW_VISIBILITY_CHANGED: "تغییر نمایش دیدگاه",
  SELLER_REVIEW_REPLIED: "پاسخ به دیدگاه",
  SELLER_REVIEW_REPLY_REMOVED: "حذف پاسخ دیدگاه",
  SELLER_PROFILE_UPDATE: "به‌روزرسانی پروفایل",
};

function alertFromEvent(event: SellerLiveEvent): SellerLiveAlert | null {
  const p = event.payload as Record<string, unknown>;

  if (event.type === "order") {
    const status = String(p.status ?? "");
    const from = p.from ? String(p.from) : null;
    const total = Number(p.total ?? 0);
    return {
      id: `order-${p.id}-${p.at}`,
      type: "order",
      title: `سفارش #${p.orderNumber}`,
      body: from
        ? `${ORDER_STATUS_LABEL[from as OrderStatus] ?? from} ← ${ORDER_STATUS_LABEL[status as OrderStatus] ?? status} · ${formatSellerPrice(total)}`
        : `${ORDER_STATUS_LABEL[status as OrderStatus] ?? status} · ${formatSellerPrice(total)}`,
      at: String(p.at ?? new Date().toISOString()),
    };
  }

  if (event.type === "payout") {
    const status = String(p.status ?? "");
    const amount = Number(p.amount ?? 0);
    return {
      id: `payout-${p.id}-${p.at}`,
      type: "payout",
      title: "تسویه",
      body: `${PAYOUT_STATUS_LABEL[status] ?? status} · ${formatSellerPrice(amount)}`,
      at: String(p.at ?? new Date().toISOString()),
    };
  }

  if (event.type === "activity") {
    const action = String(p.action ?? "");
    return {
      id: `activity-${p.id}`,
      type: "activity",
      title: ACTION_LABEL[action] ?? action,
      body: p.riskLevel === "HIGH" || p.riskLevel === "CRITICAL" ? "رویداد حساس" : "رویداد فروشگاه",
      at: String(p.createdAt ?? new Date().toISOString()),
    };
  }

  return null;
}

const ICONS = {
  order: ShoppingCart,
  payout: Wallet,
  activity: History,
} as const;

function AlertRow({ alert }: { alert: SellerLiveAlert }) {
  const Icon = ICONS[alert.type];
  return (
    <li className="flex items-start gap-2.5 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          alert.type === "payout"
            ? "bg-emerald-100 text-emerald-700"
            : alert.type === "order"
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-600",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{alert.title}</p>
        <p className="truncate text-xs text-[var(--color-muted)]">{alert.body}</p>
        <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">{formatDateTime(alert.at)}</p>
      </div>
    </li>
  );
}

export function SellerLiveBell() {
  const [alerts, setAlerts] = useState<SellerLiveAlert[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toastRef = useRef<SellerLiveAlert | null>(null);

  const pushAlert = useCallback((alert: SellerLiveAlert) => {
    setAlerts((prev) => {
      if (prev.some((a) => a.id === alert.id)) return prev;
      return [alert, ...prev].slice(0, MAX_ALERTS);
    });
    setUnseen((n) => n + 1);
    toastRef.current = alert;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSellerLiveEvents({
      onEvent: (event) => {
        setConnected(true);
        const alert = alertFromEvent(event);
        if (alert) pushAlert(alert);
      },
      onError: () => setConnected(false),
      onClose: () => setConnected(false),
    });
    return unsubscribe;
  }, [pushAlert]);

  // The latest alert doubles as a transient toast; it clears itself.
  useEffect(() => {
    if (!toastRef.current) return;
    const latest = toastRef.current;
    const timer = setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== latest.id));
      if (toastRef.current?.id === latest.id) toastRef.current = null;
    }, 8000);
    return () => clearTimeout(timer);
  }, [alerts]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle() {
    setOpen((v) => {
      if (!v) setUnseen(0);
      return !v;
    });
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        title={connected ? "اتصال زنده فعال است" : "اتصال زنده برقرار نشده است"}
        aria-label="اعلان‌های زنده فروشگاه"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
      >
        {unseen > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unseen > 0 && (
          <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
        <span
          className={cn(
            "absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-slate-300",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">رویدادهای زنده</p>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-1 text-[var(--color-muted)] hover:bg-[var(--color-muted)]/10"
              aria-label="بستن"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {alerts.length === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--color-muted)]">
              رویداد زنده‌ای دریافت نشد.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </ul>
          )}

          <div className="border-t border-[var(--color-border)] px-3 py-2">
            <Link
              to="/seller/activity"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              مشاهدهٔ تاریخچهٔ کامل رویدادها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
