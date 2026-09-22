import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Package,
  Search,
  Star,
  MapPin,
  Phone,
  Instagram,
  Send,
  Store,
  ArrowRight,
} from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { faNumber, formatDate } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { toAbsoluteMediaUrl } from "../../services/media";
import {
  getStorefront,
  getStorefrontProducts,
} from "../../services/storefrontService";
import {
  STOREFRONT_CATEGORIES,
  type StorefrontProduct,
  type StorefrontSort,
} from "../../types/storefront";
import { Pagination } from "../../components/admin/Pagination";

const SORT_OPTIONS: Array<{ value: StorefrontSort; label: string }> = [
  { value: "newest", label: "جدیدترین" },
  { value: "priceAsc", label: "ارزانترین" },
  { value: "priceDesc", label: "گرانترین" },
];

function categoryLabel(value: string): string {
  return STOREFRONT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function StorefrontPage() {
  const { slug = "" } = useParams<{ slug: string }>();

  const profileFetch = useAsync(() => getStorefront(slug), [slug]);

  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<StorefrontSort>("newest");
  const [page, setPage] = useState(1);

  const productsFetch = useAsync(
    () =>
      getStorefrontProducts(slug, {
        page,
        limit: 9,
        q: debouncedQ || undefined,
        category: category || undefined,
        sort,
      }),
    [slug, page, debouncedQ, category, sort],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, category, sort]);

  const profile = profileFetch.data;
  const totalPages = productsFetch.data
    ? Math.max(1, Math.ceil(productsFetch.data.total / productsFetch.data.limit))
    : 1;

  if (profileFetch.loading) {
    return <StorefrontLoading />;
  }

  if (profileFetch.error || !profile) {
    const notFound = (profileFetch.error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <div className="mx-auto min-h-[60vh] max-w-2xl px-4 py-16 text-center">
        <Store className="mx-auto h-12 w-12 text-[var(--color-muted)]" />
        <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">
          {notFound ? "ویترین پیدا نشد" : "خطا در بارگذاری ویترین"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          {notFound
            ? "این فروشگاه هنوز ویترین عمومی خود را منتشر نکرده است."
            : "بعداً دوباره تلاش کنید."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به خانه
        </Link>
      </div>
    );
  }

  const cover = profile.cover ? toAbsoluteMediaUrl(profile.cover) : "";
  const logo = profile.logo ? toAbsoluteMediaUrl(profile.logo) : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Storefront header */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {cover ? (
          <div className="h-40 w-full overflow-hidden bg-[var(--color-bg)]">
            <img src={cover} alt={profile.storeName} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-40 w-full bg-gradient-to-l from-[var(--color-primary)]/20 to-[var(--color-secondary)]/20" />
        )}
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {logo ? (
                <img
                  src={logo}
                  alt={profile.storeName}
                  className="h-16 w-16 shrink-0 rounded-2xl border border-[var(--color-border)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <Store className="h-8 w-8" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-[var(--color-text)]">{profile.storeName}</h1>
                {profile.description ? (
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--color-muted)]">
                    {profile.description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
                <Package className="h-3.5 w-3.5" />
                {faNumber(profile.stats?.totalProducts ?? 0)} محصول
              </span>
              {(profile.stats?.ratingCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  <Star className="h-3.5 w-3.5" />
                  {faNumber(profile.stats.averageRating)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted)]">
            {profile.location?.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[profile.location.city, profile.location.neighborhood]
                  .filter(Boolean)
                  .join("، ")}
              </span>
            ) : null}
            {profile.contact?.phone ? (
              <a
                href={`tel:${profile.contact.phone}`}
                dir="ltr"
                className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
              >
                <Phone className="h-3.5 w-3.5" />
                {profile.contact.phone}
              </a>
            ) : null}
            {profile.contact?.instagram ? (
              <a
                href={`https://instagram.com/${profile.contact.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
              >
                <Instagram className="h-3.5 w-3.5" />
                {profile.contact.instagram}
              </a>
            ) : null}
            {profile.contact?.telegram ? (
              <a
                href={`https://t.me/${profile.contact.telegram}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
              >
                <Send className="h-3.5 w-3.5" />
                {profile.contact.telegram}
              </a>
            ) : null}
            {profile.createdAt ? (
              <span>از {formatDate(profile.createdAt)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو در محصولات..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pe-3 ps-9 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">همه دسته‌ها</option>
          {STOREFRONT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as StorefrontSort)}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Products grid */}
      {productsFetch.loading ? (
        <StorefrontLoading />
      ) : (productsFetch.data?.items ?? []).length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">محصولی یافت نشد</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            با تغییر فیلترها یا جستجو دوباره تلاش کنید.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(productsFetch.data?.items ?? []).map((p) => (
              <StorefrontCard key={p.id} product={p} slug={slug} />
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

function StorefrontCard({ product: p, slug }: { product: StorefrontProduct; slug: string }) {
  const image = p.images?.[0] ? toAbsoluteMediaUrl(p.images[0]) : "";
  return (
    <Link
      to={`/store/${slug}/p/${p.id}`}
      className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-bg)]">
        {image ? (
          <img
            src={image}
            alt={p.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
            <Package className="h-10 w-10" />
          </div>
        )}
        {p.isOutOfStock ? (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white">
            ناموجود
          </span>
        ) : p.isLowStock ? (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white">
            موجودی محدود
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <p className="truncate font-semibold text-[var(--color-text)]">{p.title}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[var(--color-muted)]">{categoryLabel(p.category)}</span>
          <span className="text-sm font-bold text-[var(--color-primary)]">
            {formatSellerPrice(p.price, p.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function StorefrontLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-sm text-[var(--color-muted)]">در حال بارگذاری ویترین...</div>
    </div>
  );
}

export default StorefrontPage;