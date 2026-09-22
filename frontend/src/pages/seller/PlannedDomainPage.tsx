import { useSellerFetch } from "../../hooks/useSellerFetch";
import { Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * PlannedDomainPage — honest page for domains that are not implemented on the
 * backend yet (orders, fulfillment, finance, payouts, settings).
 *
 * It fetches the real endpoint (which returns 501 + a "planned" envelope) and
 * renders the server-provided message. If the fetch unexpectedly succeeds in
 * the future, the rendered message comes from the server, never from a
 * fabricated number.
 */
export function PlannedDomainPage({
  fetcher,
  title,
  staticMessage,
}: {
  fetcher: () => Promise<{ status: "planned"; domain: string; message: string }>;
  title: string;
  staticMessage: string;
}) {
  const { data: gap, isLoading, error, reload } = useSellerFetch(fetcher);

  const message = gap?.message || error || staticMessage;

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-dashed border-amber-300 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Clock className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{message}</p>
        {isLoading ? (
          <p className="mt-4 text-xs text-[var(--color-muted)]">در حال بررسی وضعیت دامنه...</p>
        ) : error ? (
          <button
            type="button"
            onClick={reload}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            تلاش مجدد
          </button>
        ) : null}
        <div className="mt-6 flex justify-center">
          <Link
            to="/seller"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            بازگشت به داشبورد
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PlannedDomainPage;