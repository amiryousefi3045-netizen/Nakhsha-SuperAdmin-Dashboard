import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  Star,
  Store,
  Tag,
  XCircle,
} from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useAuth } from "../../hooks/useAuth";
import { faNumber, formatDate } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { toAbsoluteMediaUrl } from "../../services/media";
import {
  checkoutStorefront,
  getMyStorefrontReview,
  getStorefrontProduct,
  getStorefrontProductReviews,
  submitStorefrontPayment,
  submitStorefrontReview,
} from "../../services/storefrontService";
import {
  STOREFRONT_CATEGORIES,
  type BuyerOrder,
  type CheckoutResponse,
  type MyStorefrontReview,
  type ReviewItem,
} from "../../types/storefront";
import { Pagination } from "../../components/admin/Pagination";

function categoryLabel(value: string): string {
  return STOREFRONT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const PHONE_PATTERN = /^09\d{9}$/;

type BuyStep = "idle" | "submitting" | "paying" | "success" | "failed";

interface BuyPanelProps {
  slug: string;
  productId: string;
  price: number;
  currency: string;
  maxQty: number;
}

function BuyPanel({ slug, productId, price, currency, maxQty }: BuyPanelProps) {
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<BuyStep>("idle");
  const [refId, setRefId] = useState("");
  const [paidTotal, setPaidTotal] = useState(0);
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [message, setMessage] = useState("");

  const effectiveMax = Math.max(1, Math.min(maxQty || 1, 99));

  async function handleCheckout() {
    if (name.trim().length < 2 || !PHONE_PATTERN.test(phone)) {
      setMessage("نام و شماره موبایل معتبر (09xxxxxxxxx) وارد کنید.");
      return;
    }
    setMessage("");
    setStep("submitting");
    try {
      const result: CheckoutResponse = await checkoutStorefront(slug, {
        customer: { name: name.trim(), phone },
        items: [{ productId, qty }],
        paymentMethod: "card",
      });
      setRefId(result.paymentIntent.refId);
      setPaidTotal(result.paymentIntent.amount);
      setStep("paying");
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      setMessage(
        code === "UNAUTHORIZED"
          ? "برای خرید باید وارد حساب کاربری‌تان شوید."
          : code === "INSUFFICIENT_STOCK"
            ? "موجودی کافی نیست؛ تعداد را کمتر کنید."
            : "برقراری سفارش موفق نشد؛ دوباره تلاش کنید.",
      );
      setStep("idle");
    }
  }

  async function handlePayment(result: "SUCCESS" | "FAIL") {
    setStep("submitting");
    setMessage("");
    try {
      const callback = await submitStorefrontPayment(
        refId,
        result,
        result === "FAIL" ? "کاربر پرداخت را لغو کرد" : "",
      );
      if (result === "SUCCESS" && callback.applied && callback.order.payment.status === "paid") {
        setOrder(callback.order);
        setStep("success");
      } else if (result === "FAIL") {
        setStep("failed");
      } else {
        setStep("paying");
      }
    } catch {
      setMessage("مشکلی در تأیید پرداخت رخ داد؛ دوباره تلاش کنید.");
      setStep("paying");
    }
  }

  function reset() {
    setStep("idle");
    setRefId("");
    setOrder(null);
    setPaidTotal(0);
    setMessage("");
  }

  if (!user) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5 text-sm">
        <p className="font-medium text-[var(--color-text)]">خرید این محصول</p>
        <p className="mt-2 leading-6 text-[var(--color-muted)]">
          برای ثبت سفارش ابتدا وارد حساب کاربری‌تان شوید.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <CreditCard className="h-4 w-4" />
          ورود / ثبت‌نام
        </Link>
      </div>
    );
  }

  if (step === "success" && order) {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="font-bold text-green-800">پرداخت با موفقیت انجام شد</p>
        </div>
        <p className="mt-2 leading-6 text-green-800">
          سفارش شماره <span className="font-bold">{faNumber(order.orderNumber)}</span> به مبلغ{" "}
          <span className="font-bold">{formatSellerPrice(paidTotal, currency)}</span> ثبت شد.
        </p>
        <Link
          to={`/store/orders/${order.id}`}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-white hover:brightness-110"
        >
          مشاهده رسید سفارش
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (step === "failed") {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-600" />
          <p className="font-bold text-red-800">پرداخت ناموفق بود</p>
        </div>
        <p className="mt-2 leading-6 text-red-800">
          سفارش لغو و موجودی به حالت قبل بازگردانده شد؛ می‌توانید دوباره تلاش کنید.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-100"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (step === "paying") {
    return (
      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5 text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
          <p className="font-bold text-[var(--color-text)]">در حال اتصال به درگاه پرداخت</p>
        </div>
        <p className="mt-2 leading-6 text-[var(--color-muted)]">
          مبلغ <span className="font-bold text-[var(--color-text)]">{formatSellerPrice(paidTotal, currency)}</span>{" "}
          (درگاه آزمایشی) آماده پرداخت است.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handlePayment("SUCCESS")}
            disabled={step !== "paying"}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:brightness-110"
          >
            <CheckCircle2 className="h-4 w-4" />
            پرداخت موفق
          </button>
          <button
            type="button"
            onClick={() => handlePayment("FAIL")}
            disabled={step !== "paying"}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" />
            پرداخت ناموفق
          </button>
        </div>
        {message ? <p className="mt-3 text-red-600">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5 text-sm">
      <p className="text-base font-bold text-[var(--color-text)]">خرید این محصول</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">نام خریدار</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نام و نام خانوادگی"
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">شماره موبایل</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxxx"
            inputMode="tel"
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-[var(--color-muted)]">تعداد</span>
        <input
          type="number"
          min={1}
          max={effectiveMax}
          value={qty}
          onChange={(e) =>
            setQty(
              Math.max(1, Math.min(Number(e.target.value) || 1, effectiveMax)),
            )
          }
          className="w-20 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-center text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <span className="text-xs text-[var(--color-muted)]">
          {faNumber(effectiveMax)} عدد موجود است
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={step === "submitting"}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {step === "submitting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          ثبت سفارش و پرداخت
        </button>
        <span className="text-base font-extrabold text-[var(--color-primary)]">
          {formatSellerPrice(price * qty, currency)}
        </span>
      </div>
      {message ? <p className="mt-3 text-red-600">{message}</p> : null}
    </div>
  );
}

function StarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const active = onChange ? hover || value : value;
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
          className="disabled:cursor-default"
          aria-label={`${n} ستاره`}
        >
          <Star
            className={
              active >= n
                ? "h-5 w-5 fill-amber-400 text-amber-400"
                : "h-5 w-5 text-gray-300"
            }
          />
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StarRow value={review.rating} />
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {review.buyerName}
          </span>
        </div>
        {review.createdAt ? (
          <span className="text-xs text-[var(--color-muted)]">{formatDate(review.createdAt)}</span>
        ) : null}
      </div>
      {review.comment ? (
        <p className="mt-3 text-sm leading-7 text-[var(--color-text)]">{review.comment}</p>
      ) : null}
    </div>
  );
}

const REVIEWS_PAGE_SIZE = 5;

function ReviewsSection({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [bump, setBump] = useState(0);

  const list = useAsync(
    () => getStorefrontProductReviews(productId, { page, limit: REVIEWS_PAGE_SIZE }),
    [productId, page, bump],
  );

  const mine = useAsync<MyStorefrontReview | null>(
    () => (user ? getMyStorefrontReview(productId) : Promise.resolve(null)),
    [user?.id, productId, bump],
  );

  function startEdit(review?: ReviewItem) {
    setRating(review?.rating ?? 5);
    setComment(review?.comment ?? "");
    setIsAnonymous(review?.isAnonymous ?? false);
    setFormError("");
    setEditing(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError("");
    try {
      await submitStorefrontReview(productId, {
        rating,
        comment: comment.trim(),
        isAnonymous,
      });
      setEditing(false);
      setBump((b) => b + 1);
      if (page !== 1) setPage(1);
    } catch (err) {
      setFormError(
        (err as { message?: string })?.message ?? "ثبت دیدگاه ناموفق بود؛ دوباره تلاش کنید.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canWrite =
    user && !mine.loading && mine.data
      ? mine.data.canReview || (mine.data.hasDeliveredPurchase && editing)
      : false;
  const myReview = mine.data?.review ?? null;
  const showMyCard = user && !mine.loading && mine.data?.hasDeliveredPurchase && myReview && !editing;
  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / list.data.limit))
    : 1;
  const rating0 = list.data?.rating ?? { average: 0, count: 0 };

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          دیدگاه خریداران
        </h2>
        {rating0.count > 0 ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <StarRow value={rating0.average} />
            {faNumber(rating0.average)} از ۵ — {faNumber(rating0.count)} دیدگاه
          </span>
        ) : null}
      </div>

      {canWrite ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">
            {myReview ? "ویرایش دیدگاه" : "ثبت دیدگاه جدید"}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)]">امتیاز شما</span>
            <StarRow value={rating} onChange={setRating} />
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="تجربه‌ی خود از این محصول را بنویسید... (اختیاری)"
            className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              انتشار با نام «کاربر نخشا»
            </label>
            <div className="flex items-center gap-2">
              {myReview && user ? (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
                >
                  انصراف
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {myReview ? "به‌روزرسانی دیدگاه" : "ثبت دیدگاه"}
              </button>
            </div>
          </div>
          {formError ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>
          ) : null}
        </div>
      ) : null}

      {showMyCard ? (
        <div className="mt-4">
          {myReview ? <ReviewCard review={myReview} /> : null}
          <button
            type="button"
            onClick={() => user && startEdit(myReview ?? undefined)}
            className="mt-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg)]"
          >
            ویرایش دیدگاه‌ام
          </button>
        </div>
      ) : null}

      {list.loading ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          در حال بارگذاری دیدگاه‌ها...
        </div>
      ) : list.data && list.data.items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          هنوز دیدگاهی برای این محصول ثبت نشده است. پس از خرید و تحویل، تجربه‌ی خود را بنویسید.
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {(list.data?.items ?? []).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination className="mt-4" page={page} totalPages={totalPages} onChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
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

          {(product.rating?.count ?? 0) > 0 ? (
            <div className="mt-1 flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-semibold text-[var(--color-text)]">
                {faNumber(product.rating?.average ?? 0)}
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                ({faNumber(product.rating?.count ?? 0)} دیدگاه)
              </span>
            </div>
          ) : null}

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

          {!product.isOutOfStock ? (
            <BuyPanel
              slug={slug}
              productId={product.id}
              price={product.price}
              currency={product.currency}
              maxQty={product.availableStock}
            />
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

      <ReviewsSection productId={product.id} />
    </div>
  );
}

export default StorefrontProductPage;