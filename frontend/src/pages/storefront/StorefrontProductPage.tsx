import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  Star,
  Store,
  Tag,
  Truck,
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
  getShippingProvinces,
  getStorefrontProduct,
  getStorefrontProductReviews,
  quoteStorefrontShipping,
  submitStorefrontPayment,
  submitStorefrontReview,
  validateStorefrontCoupon,
} from "../../services/storefrontService";
import {
  STOREFRONT_CATEGORIES,
  type BuyerOrder,
  type CheckoutResponse,
  type CouponPreview,
  type MyStorefrontReview,
  type ReviewItem,
} from "../../types/storefront";
import { Pagination } from "../../components/admin/Pagination";
import { etaText, type ShippingAddressInput, type ShippingQuote } from "../../types/shipping";

function categoryLabel(value: string): string {
  return STOREFRONT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const PHONE_PATTERN = /^09\d{9}$/;

/**
 * Coupon refusals the server can return at checkout.
 *
 * These all mean the same thing to a buyer — "this code is not usable for this
 * order" — and the one message covers every case deliberately: naming which
 * limit was hit (exhausted, expired, over the per-buyer cap) would turn the
 * checkout into a way to probe a campaign's state.
 */
const COUPON_ERROR_CODES = new Set([
  "COUPON_NOT_FOUND",
  "COUPON_INACTIVE",
  "COUPON_EXPIRED",
  "COUPON_NOT_STARTED",
  "COUPON_EXHAUSTED",
  "COUPON_USER_LIMIT",
  "COUPON_MIN_PURCHASE",
  "COUPON_CODE_TAKEN",
  "COUPON_INVALID",
]);

function isCouponErrorCode(code: string | undefined): boolean {
  return !!code && COUPON_ERROR_CODES.has(code);
}

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
  // The coupon is applied in two steps: a server-priced preview, then the same
  // code handed to checkout. The preview spends nothing, so changing the
  // quantity or retyping the code cannot burn a use.
  const [couponInput, setCouponInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");

  // Delivery (Phase 36). The buyer picks a destination and a method; the server
  // prices both. Nothing in this block computes a shipping amount, and the
  // chosen `key` is the only thing sent to checkout.
  const [address, setAddress] = useState<ShippingAddressInput>({});
  const [provinces, setProvinces] = useState<string[]>([]);
  const [shipping, setShipping] = useState<ShippingQuote | null>(null);
  const [methodKey, setMethodKey] = useState("");
  const [shippingBusy, setShippingBusy] = useState(false);
  const [shippingMessage, setShippingMessage] = useState("");
  // The store's own shipping code (Phase 37). Held separately from the campaign
  // coupon above because the two are validated by different endpoints and can
  // both be active at once: a buyer may use a 10%-off campaign AND a
  // shipping-only code, and neither one may cancel the other.
  const [shippingCodeInput, setShippingCodeInput] = useState("");
  const [shippingCode, setShippingCode] = useState("");

  /**
   * Whether the buyer typed a real destination.
   *
   * An all-blank address means "no address" to the server, which is exactly what
   * a pickup order needs; a half-filled one is a validation error. So the form
   * only sends the field when there is something in it, and lets the server be
   * the judge of partial entries rather than guessing here.
   */
  const hasAddress = Object.values(address).some((v) => String(v ?? "").trim().length > 0);

  const effectiveMax = Math.max(1, Math.min(maxQty || 1, 99));

  // The province list comes from the server that will validate the address, so
  // the dropdown cannot offer a province checkout would then reject.
  useEffect(() => {
    let cancelled = false;
    getShippingProvinces(slug)
      .then((list) => {
        if (!cancelled) setProvinces(list);
      })
      .catch(() => {
        // Fall back to a typed province. The server still validates it; the form
        // simply cannot offer the list for convenience.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  /**
   * Ask the seller engine what this basket costs to deliver to this address.
   *
   * Deliberately not automatic on every keystroke: the endpoint is rate limited
   * and a buyer typing a postal code would otherwise burn the budget on
   * half-finished addresses.
   */
  async function handleQuoteShipping(codeOverride?: string) {
    setShippingBusy(true);
    setShippingMessage("");
    try {
      // The code is passed in rather than read from `shippingCode`: React state
      // is not updated until this component re-renders, so a handler that both
      // stores a new code and quotes in the same tick would send the OLD code
      // and look like the feature is simply broken.
      const code = codeOverride ?? shippingCode;
      const quote = await quoteStorefrontShipping(slug, {
        items: [{ productId, qty }],
        shippingAddress: address,
        ...(code ? { shippingDiscountCode: code } : {}),
      });
      setShipping(quote);
      // Preselect the cheapest option, which is what checkout would have chosen
      // on its own — so a buyer who ignores this step still gets the same order.
      setMethodKey((current) =>
        quote.methods.some((m) => m.key === current) ? current : (quote.methods[0]?.key ?? ""),
      );
    } catch (error) {
      setShipping(null);
      setMethodKey("");
      setShippingMessage(
        (error as { message?: string } | null)?.message ??
          "محاسبهٔ هزینهٔ ارسال ناموفق بود.",
      );
    } finally {
      setShippingBusy(false);
    }
  }

  /**
   * Store the code the buyer typed, then re-price.
   *
   * There is no separate validation call for shipping codes: the quote endpoint
   * runs the same resolve checkout will run, so re-quoting IS the check. A code
   * that does not earn anything comes back as `applied: false` and the quote is
   * still rendered at full price — the buyer is never blocked, and a code that
   * belongs to another store reads exactly like a typo, which is the point.
   */
  function handleApplyShippingCode() {
    const code = shippingCodeInput.trim().toUpperCase();
    setShippingCode(code);
    if (!code) {
      setShippingMessage("");
      return;
    }
    void handleQuoteShipping(code);
  }

  function handleClearShippingCode() {
    setShippingCodeInput("");
    setShippingCode("");
    setShippingMessage("");
    void handleQuoteShipping("");
  }

  /**
   * Ask the server what the code is worth for this exact cart.
   *
   * The amounts that come back are the ones checkout will use, so what the
   * buyer sees here is not a local guess. A refusal is reported verbatim from
   * the server's own Persian message instead of a generic "invalid code", which
   * is the difference between "this code has expired" and "spend more first".
   */
  async function handleApplyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponMessage("");
    setCoupon(null);
    setAppliedCode("");
    try {
      const preview = await validateStorefrontCoupon(slug, code, [{ productId, qty }]);
      setCoupon(preview);
      setAppliedCode(code);
    } catch (error) {
      setCouponMessage(
        (error as { message?: string } | null)?.message ?? "این کد تخفیف پذیرفته نشد.",
      );
    } finally {
      setCouponBusy(false);
    }
  }

  function handleClearCoupon() {
    setCouponInput("");
    setAppliedCode("");
    setCoupon(null);
    setCouponMessage("");
  }

  /**
   * Changing the quantity re-prices the cart, so a preview that was valid for
   * the old quantity is no longer a promise. The applied code is kept (it is
   * still the buyer's code) but its numbers are dropped until re-checked.
   */
  function handleQtyChange(next: number) {
    setQty(next);
    if (appliedCode) {
      setCoupon(null);
      setCouponMessage("تعداد تغییر کرد؛ برای اعمال کد تخفیف دوباره آن را بررسی کنید.");
    }
  }

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
        ...(appliedCode ? { couponCode: appliedCode } : {}),
        // The method KEY and the destination, never an amount. The server prices
        // the delivery again from the seller's own rate card.
        ...(methodKey ? { shippingMethodId: methodKey } : {}),
        // The code, never an amount. A client that posted a number here would
        // have it dropped by the route schema and still be charged the real fee.
        ...(shippingCode ? { shippingDiscountCode: shippingCode } : {}),
        ...(hasAddress ? { shippingAddress: address } : {}),
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
            : isCouponErrorCode(code)
              ? "این کد تخفیف دیگر معتبر نیست؛ بدون کد ادامه دهید یا کد دیگری وارد کنید."
              : "برقراری سفارش موفق نشد؛ دوباره تلاش کنید.",
      );
      // A code can be refused between the preview and the write (its last use
      // went to another buyer), so the failed attempt must not leave a stale
      // discount on screen.
      setCoupon(null);
      setAppliedCode("");
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
    // Starting over must not carry the old discount into the next order: the
    // code's quota was already spent by the one that just completed.
    setCoupon(null);
    setAppliedCode("");
    setCouponMessage("");
    setShipping(null);
    setMethodKey("");
    setShippingMessage("");
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
            handleQtyChange(Math.max(1, Math.min(Number(e.target.value) || 1, effectiveMax)))
          }
          className="w-20 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-center text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <span className="text-xs text-[var(--color-muted)]">
          {faNumber(effectiveMax)} عدد موجود است
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">کد تخفیف (اختیاری)</span>
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="مثلاً SUMMER1404"
              dir="ltr"
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-start text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          {coupon ? (
            <button
              type="button"
              onClick={handleClearCoupon}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-primary)]/5"
            >
              حذف کد
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={couponBusy || couponInput.trim().length < 4}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
              بررسی کد
            </button>
          )}
        </div>

        {couponMessage ? <p className="mt-2 text-xs text-red-600">{couponMessage}</p> : null}

        {coupon ? (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
              <BadgeCheck className="h-4 w-4" />
              کد «{coupon.code}» اعمال شد
              {coupon.type === "percent" ? (
                <span className="text-[var(--color-muted)]">({faNumber(coupon.value)}٪)</span>
              ) : null}
            </span>
            <span className="text-[var(--color-muted)]">
              {formatSellerPrice(coupon.discount, currency)} تخفیف
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
          <Truck className="h-4 w-4" />
          ارسال
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">استان</span>
            {provinces.length > 0 ? (
              <select
                value={address.province ?? ""}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, province: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">— انتخاب کنید —</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={address.province ?? ""}
                onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">شهر</span>
            <input
              value={address.city ?? ""}
              onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">کدپستی</span>
            <input
              value={address.postalCode ?? ""}
              onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
              dir="ltr"
              inputMode="numeric"
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-start text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">نشانی</span>
            <input
              value={address.line1 ?? ""}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleQuoteShipping()}
            disabled={shippingBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
          >
            {shippingBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Truck className="h-4 w-4" />
            )}
            محاسبهٔ هزینهٔ ارسال
          </button>
          <span className="text-xs text-[var(--color-muted)]">
            اگر دریافت حضوری می‌خواهید، آدرس را خالی بگذارید.
          </span>
        </div>

        {shippingMessage ? <p className="mt-2 text-xs text-red-600">{shippingMessage}</p> : null}

        {/* Store shipping code (Phase 37). A lookup key, resolved server-side. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={shippingCodeInput}
            onChange={(e) => setShippingCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApplyShippingCode();
              }
            }}
            placeholder="کد تخفیف ارسال"
            aria-label="کد تخفیف ارسال"
            className="w-44 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          {shippingCode ? (
            <button
              type="button"
              onClick={handleClearShippingCode}
              className="text-xs text-[var(--color-muted)] underline"
            >
              حذف کد
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApplyShippingCode}
              disabled={!shippingCodeInput.trim() || shippingBusy}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-muted)]/10 disabled:opacity-40"
            >
              اعمال کد ارسال
            </button>
          )}
        </div>

        {shipping ? (
          <div className="mt-2 space-y-2">
            {shipping.warning ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {shipping.warning}
              </p>
            ) : null}
            {shipping.discount && !shipping.discount.applied ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                این کد برای سفارش شما اعمال نشد.
              </p>
            ) : null}
            {shipping.methods.length === 0 ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                برای این مقصد روش ارسالی در دسترس نیست.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {shipping.methods.map((m) => (
                  <li key={m.key}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                        methodKey === m.key
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                          : "border-[var(--color-border)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shipping-method"
                        value={m.key}
                        checked={methodKey === m.key}
                        onChange={() => setMethodKey(m.key)}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[var(--color-text)]">{m.title}</span>
                          <span className="font-medium text-[var(--color-text)]">
                            {m.fee === 0
                              ? "رایگان"
                              : formatSellerPrice(m.fee, shipping.currency ?? currency)}
                          </span>
                        </span>
                        {m.discount ? (
                          <span className="mt-0.5 block text-emerald-700">
                            {formatSellerPrice(m.originalFee ?? m.fee, shipping.currency ?? currency)}{" "}
                            با کد {m.discountCode ?? ""} (
                            {formatSellerPrice(m.discount, shipping.currency ?? currency)} تخفیف)
                          </span>
                        ) : null}
                        <span className="block text-[var(--color-muted)]">
                          {etaText(m.eta)}
                          {m.carrier ? ` · ${m.carrier}` : ""}
                        </span>
                        {m.kind === "pickup" && m.pickup ? (
                          <span className="mt-1 block text-[var(--color-muted)]">
                            {[
                              m.pickup.province,
                              m.pickup.city,
                              m.pickup.address,
                              m.pickup.hours,
                            ]
                              .filter(Boolean)
                              .join(" — ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
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
          {formatSellerPrice(coupon ? coupon.total : price * qty, currency)}
        </span>
        {coupon && coupon.discount > 0 ? (
          <span className="text-xs text-[var(--color-muted)]">
            <s>{formatSellerPrice(coupon.subtotal, currency)}</s> · {formatSellerPrice(coupon.discount, currency)} تخفیف
          </span>
        ) : null}
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
      {review.sellerReply?.comment ? (
        <div className="mt-4 rounded-xl bg-[var(--color-primary)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--color-primary)]">پاسخ فروشگاه</p>
          <p className="mt-1.5 text-sm leading-6 text-[var(--color-text)]">
            {review.sellerReply.comment}
          </p>
          {review.sellerReply.createdAt ? (
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              {formatDate(review.sellerReply.createdAt)}
            </p>
          ) : null}
        </div>
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