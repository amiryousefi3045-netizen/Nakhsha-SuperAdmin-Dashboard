import { useParams, Link } from "react-router-dom";
import { ArrowRight, Package, Store, Tag } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { toAbsoluteMediaUrl } from "../../services/media";
import { getStorefrontProduct } from "../../services/storefrontService";
import { STOREFRONT_CATEGORIES } from "../../types/storefront";

function categoryLabel(value: string): string {
  return STOREFRONT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function StorefrontProductPage() {
  const { slug = "", productId = "" } = useParams<{ slug: string; productId: string }>();

  const { data: product, loading, error } = useAsync(
    () => getStorefrontProduct(slug, productId),
    [slug, productId],
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-[var(--color-muted)]">در حال بارگذاری محصول...</div>
      </div>
    );
  }

  if (error || !product) {
    const notFound = (error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <div className="mx-auto min-h-[60vh] max-w-2xl px-4 py-16 text-center">
        <Package className="mx-auto h-12 w-12 text-[var(--color-muted)]" />
        <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">
          {notFound ? "محصول پیدا نشد" : "خطا در بارگذاری محصول"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          {notFound
            ? "این محصول در این فروشگاه در دسترس نیست."
            : "بعداً دوباره تلاش کنید."}
        </p>
        <Link
          to={`/store/${slug}`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به ویترین
        </Link>
      </div>
    );
  }

  const images = (product.images ?? []).map(toAbsoluteMediaUrl);
  const mainImage = images[0] ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to={`/store/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به ویترین
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Images */}
        <div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]">
            {mainImage ? (
              <img src={mainImage} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
                <Package className="h-12 w-12" />
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`${product.title} ${i + 1}`}
                  className="h-20 w-20 shrink-0 rounded-xl border border-[var(--color-border)] object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
              {categoryLabel(product.category)}
            </span>
            {product.isOutOfStock ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                ناموجود
              </span>
            ) : product.isLowStock ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
                موجودی محدود
              </span>
            ) : (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
                موجود
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-bold text-[var(--color-text)]">{product.title}</h1>

          <p className="mt-4 text-2xl font-extrabold text-[var(--color-primary)]">
            {formatSellerPrice(product.price, product.currency)}
          </p>

          {product.description ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">{product.description}</p>
          ) : null}

          {product.tags && product.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-[var(--color-muted)]" />
              {product.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs text-[var(--color-text)]"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {!product.isOutOfStock ? (
            <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm">
              <p className="text-[var(--color-muted)]">
                موجودی موجود:{" "}
                <span className="font-semibold text-[var(--color-text)]">
                  {faNumber(product.availableStock)}
                </span>
              </p>
            </div>
          ) : null}

          <Link
            to={`/store/${slug}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
          >
            <Store className="h-4 w-4" />
            مشاهده سایر محصولات فروشگاه
          </Link>
        </div>
      </div>
    </div>
  );
}

export default StorefrontProductPage;