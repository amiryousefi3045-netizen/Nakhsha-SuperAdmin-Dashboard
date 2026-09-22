import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search, Star, Store } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { faNumber } from "../../lib/adminFormat";
import { toAbsoluteMediaUrl } from "../../services/media";
import { listStorefronts } from "../../services/storefrontService";
import {
  type StorefrontDirectorySort,
  type StorefrontProfile,
} from "../../types/storefront";
import { Pagination } from "../../components/admin/Pagination";

const SORT_OPTIONS: Array<{ value: StorefrontDirectorySort; label: string }> = [
  { value: "newest", label: "جدیدترین" },
  { value: "rating", label: "برترین امتیاز" },
  { value: "products", label: "بیشترین محصول" },
];

export function StorefrontDirectoryPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [sort, setSort] = useState<StorefrontDirectorySort>("newest");
  const [page, setPage] = useState(1);

  const fetch = useAsync(
    () =>
      listStorefronts({
        page,
        limit: 9,
        q: debouncedQ || undefined,
        sort,
      }),
    [page, debouncedQ, sort],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  const totalPages = fetch.data
    ? Math.max(1, Math.ceil(fetch.data.total / fetch.data.limit))
    : 1;

  if (fetch.loading && !fetch.data) {
    return <DirectoryLoading />;
  }

  if (fetch.error) {
    return (
      <div className="mx-auto min-h-[50vh] max-w-xl px-4 py-16 text-center">
        <Store className="mx-auto h-12 w-12 text-[var(--color-muted)]" />
        <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">
          خطا در بارگذاری فروشگاه‌ها
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          بعداً دوباره تلاش کنید.
        </p>
      </div>
    );
  }

  const items = fetch.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">فروشگاه‌ها</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          فروشگاه‌های منتشرشدهٔ هنرمندان و صنعتگران نخشا را مرور کنید.
        </p>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی فروشگاه..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pe-3 ps-9 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as StorefrontDirectorySort)}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Store cards */}
      {fetch.loading ? (
        <DirectoryLoading />
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <Store className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">فروشگاهی یافت نشد</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            با تغییر جستجو یا مرتب‌سازی دوباره تلاش کنید.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <StorefrontDirectoryCard key={s.id} profile={s} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function StorefrontDirectoryCard({ profile: s }: { profile: StorefrontProfile }) {
  const logo = s.logo ? toAbsoluteMediaUrl(s.logo) : "";
  return (
    <Link
      to={`/store/${s.slug}`}
      className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-4 p-5">
        {logo ? (
          <img
            src={logo}
            alt={s.storeName}
            className="h-14 w-14 shrink-0 rounded-xl border border-[var(--color-border)] object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Store className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
            {s.storeName}
          </p>
          {s.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-muted)]">
              {s.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
            {s.location?.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[s.location.city, s.location.neighborhood].filter(Boolean).join("، ")}
              </span>
            ) : null}
            <span>
              {faNumber(s.stats?.totalProducts ?? 0)} محصول
            </span>
            {(s.stats?.ratingCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {faNumber(s.stats.averageRating)}
                <span className="text-[var(--color-muted)]">
                  ({faNumber(s.stats.ratingCount)})
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function DirectoryLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-sm text-[var(--color-muted)]">در حال بارگذاری فروشگاه‌ها...</div>
    </div>
  );
}

export default StorefrontDirectoryPage;