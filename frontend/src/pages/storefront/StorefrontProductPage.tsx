import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  Store,
  Tag,
  XCircle,
} from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useAuth } from "../../hooks/useAuth";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { toAbsoluteMediaUrl } from "../../services/media";
import {
  checkoutStorefront,
  getStorefrontProduct,
  submitStorefrontPayment,
} from "../../services/storefrontService";
import {
  STOREFRONT_CATEGORIES,
  type BuyerOrder,
  type CheckoutResponse,
} from "../../types/storefront";

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
    </div>
  );
}

export default StorefrontProductPage;