import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, RefreshCw, Eye, EyeOff, Star, Reply } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import {
  deleteSellerReviewReply,
  listSellerReviews,
  updateSellerReviewReply,
  updateSellerReviewVisibility,
} from "../../services/sellerService";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import type { ReviewStatus, SellerReview } from "../../types/seller";

const STATUS_OPTIONS: Array<{ value: "" | ReviewStatus; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "published", label: "نمایان" },
  { value: "hidden", label: "مخفی" },
];

const MAX_REPLY_LENGTH = 500;

export function ReviewsSeller() {
  const [status, setStatus] = useState<"" | ReviewStatus>("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<SellerReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SellerReview | null>(null);
  const [replyComment, setReplyComment] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");

  const fetcher = useCallback(
    () =>
      listSellerReviews({
        page,
        limit: 15,
        status: status || undefined,
      }),
    [page, status],
  );
  const { data, isLoading, error, reload } = useSellerFetch(fetcher, {
    dependencies: [page, status],
  });

  useEffect(() => {
    setPage(1);
  }, [status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const toggleReview = async (review: SellerReview) => {
    const next: ReviewStatus = review.status === "published" ? "hidden" : "published";
    setBusy(true);
    try {
      await updateSellerReviewVisibility(review.id, next);
      setTarget(null);
      await reload();
    } catch (e) {
      setTarget(null);
      alert(e instanceof Error ? e.message : "خطا در تغییر وضعیت دیدگاه");
    } finally {
      setBusy(false);
    }
  };

  const openReply = (review: SellerReview) => {
    setReplyTarget(review);
    setReplyComment(review.sellerReply?.comment ?? "");
    setReplyError("");
  };

  const saveReply = async (topic: SellerReview) => {
    if (!replyComment.trim()) {
      setReplyError("متن پاسخ نمی‌تواند خالی باشد");
      return;
    }
    if (replyComment.trim().length > MAX_REPLY_LENGTH) {
      setReplyError(`متن پاسخ نباید بیش از ${MAX_REPLY_LENGTH} کاراکتر باشد`);
      return;
    }
    setReplyBusy(true);
    setReplyError("");
    try {
      await updateSellerReviewReply(topic.id, replyComment.trim());
      setReplyTarget(null);
      await reload();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "ثبت پاسخ ناموفق بود");
    } finally {
      setReplyBusy(false);
    }
  };

  const removeReply = async (topic: SellerReview) => {
    if (!window.confirm("پاسخ فروشگاه به این دیدگاه حذف شود؟")) return;
    setReplyBusy(true);
    setReplyError("");
    try {
      await deleteSellerReviewReply(topic.id);
      setReplyTarget(null);
      await reload();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "حذف پاسخ ناموفق بود");
    } finally {
      setReplyBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">دیدگاه‌ها</h2>
          <p className="text-sm text-[var(--color-muted)]">
            نقد و بررسی خریداران روی محصولات فروشگاه
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | ReviewStatus)}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)]/5 px-4 py-3 text-xs text-[var(--color-muted)]">
        مخفی‌کردن یک دیدگاه، آن را از ویترین محصول حذف می‌کند و در محاسبهٔ امتیاز
        محصول و فروشگاه لحاظ نمی‌شود. نام واقعی خریدار فقط برای شما نمایش داده می‌شود؛
        پاسخ فروشگاه زیر دیدگاه در ویترین نمایش داده می‌شود.
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <MessageSquareText className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">دیدگاهی یافت نشد</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            با ثبت اولین نقد و بررسی توسط خریداران، اینجا نمایش داده می‌شود.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">محصول</th>
                <th className="px-4 py-3 text-start">دیدگاه</th>
                <th className="px-4 py-3 text-center">امتیاز</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-center">ثبت</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(data?.items ?? []).map((r) => (
                <ReviewRow
                  key={r.id}
                  review={r}
                  onToggle={setTarget}
                  onReply={openReply}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => {
          setPage(p);
          window.scrollTo({ top: 0 });
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title={target?.status === "published" ? "مخفی‌کردن دیدگاه" : "نمایش دیدگاه"}
        message={
          target
            ? `دیدگاه ${target.isAnonymous ? "(بی‌نام)" : faNumber(target.buyerName)} روی «${target.productTitle}» ${
                target.status === "published" ? "از ویترین مخفی می‌شود" : "دوباره در ویترین نمایش داده می‌شود"
              }.`
            : null
        }
        confirmLabel={target?.status === "published" ? "مخفی کن" : "نمایش بده"}
        busy={busy}
        onConfirm={() => (target ? toggleReview(target) : undefined)}
        onCancel={() => setTarget(null)}
      />

      <ReplyDialog
        review={replyTarget}
        value={replyComment}
        onChange={setReplyComment}
        busy={replyBusy}
        error={replyError}
        onSave={saveReply}
        onRemove={removeReply}
        onClose={() => setReplyTarget(null)}
      />
    </div>
  );
}

function ReviewRow({
  review: r,
  onToggle,
  onReply,
}: {
  review: SellerReview;
  onToggle: (r: SellerReview) => void;
  onReply: (r: SellerReview) => void;
}) {
  const hidden = r.status === "hidden";
  return (
    <tr className={`transition-colors hover:bg-[var(--color-primary)]/5 ${hidden ? "bg-[var(--color-bg)]/50" : ""}`}>
      <td className="max-w-[180px] px-4 py-3">
        <p className="truncate font-semibold text-[var(--color-text)]">{r.productTitle || "—"}</p>
      </td>
      <td className="max-w-[320px] px-4 py-3">
        <p className={`line-clamp-2 text-[var(--color-text)] ${hidden ? "opacity-60" : ""}`}>
          {r.comment || "—"}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {r.isAnonymous ? "خریدار (بی‌نام)" : r.buyerName || "خریدار"}
        </p>
        {r.sellerReply ? (
          <p className="mt-2 line-clamp-1 rounded-lg bg-[var(--color-primary)]/5 px-2 py-1 text-xs text-[var(--color-primary)]">
            <span className="font-semibold">پاسخ شما:</span> {r.sellerReply.comment}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className="inline-flex items-center gap-1 font-semibold text-[var(--color-text)]"
          title={faNumber(r.rating)}
        >
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          {faNumber(r.rating)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge label={hidden ? "مخفی" : "نمایان"} tone={hidden ? "gray" : "green"} />
      </td>
      <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
        {formatDateTime(r.createdAt)}
      </td>
      <td className="px-4 py-3 text-end">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onReply(r)}
            title={r.sellerReply ? "ویرایش پاسخ" : "ثبت پاسخ"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Reply className="h-4 w-4" />
            <span className="hidden xl:inline">{r.sellerReply ? "ویرایش" : "پاسخ"}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggle(r)}
            className={
              hidden
                ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                : "inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            }
          >
            {hidden ? (
              <>
                <Eye className="h-4 w-4" />
                <span className="hidden xl:inline">نمایش</span>
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4" />
                <span className="hidden xl:inline">مخفی</span>
              </>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

function ReplyDialog({
  review,
  value,
  onChange,
  busy,
  error,
  onSave,
  onRemove,
  onClose,
}: {
  review: SellerReview | null;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  error: string;
  onSave: (r: SellerReview) => void;
  onRemove: (r: SellerReview) => void;
  onClose: () => void;
}) {
  if (!review) return null;
  const hasReply = Boolean(review.sellerReply);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-[var(--color-text)]">
          {hasReply ? "ویرایش پاسخ فروشگاه" : "پاسخ به دیدگاه"}
        </h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          «{review.comment || "بدون متن"}» ✕ {faNumber(review.rating)} ستاره —{" "}
          {review.isAnonymous ? "خریدار (بی‌نام)" : review.buyerName || "خریدار"}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_REPLY_LENGTH}
          rows={5}
          placeholder="پاسخ شما زیر دیدگاه در ویترین محصول نمایش داده می‌شود..."
          className="mt-4 w-full resize-none rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>{error ? <span className="text-red-600">{error}</span> : null}</span>
          <span dir="ltr">{faNumber(value.length)} / {faNumber(MAX_REPLY_LENGTH)}</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {hasReply ? (
            <button
              type="button"
              onClick={() => onRemove(review)}
              disabled={busy}
              className="me-auto rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              حذف پاسخ
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => onSave(review)}
            disabled={busy}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "در حال ذخیره..." : hasReply ? "به‌روزرسانی پاسخ" : "ثبت پاسخ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
          <div className="h-8 w-24 animate-pulse rounded bg-[var(--color-border)]/40" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-[var(--color-border)]/50" />
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--color-border)]/40" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded bg-[var(--color-border)]/40" />
          <div className="h-9 w-20 animate-pulse rounded bg-[var(--color-border)]/40" />
          <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)] opacity-0" />
        </div>
      ))}
    </div>
  );
}

export default ReviewsSeller;