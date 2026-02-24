/**
 * CreateListingWizardPage – 7-step wizard for creating a post / tour / training.
 * Route: /create/new?type=post|tour|training
 *
 * Steps:
 *   0 اطلاعات پایه   Basic Info
 *   1 تصاویر         Media
 *   2 قیمت‌گذاری     Pricing & Capacity
 *   3 زمان‌بندی       Schedule
 *   4 مکان           Location
 *   5 برچسب‌ها        Tags
 *   6 بررسی و انتشار Review & Publish
 */
import { useRef, useState, type ChangeEvent, type FC } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  Plus,
  CheckCircle2,
  MapPin,
  CalendarDays,
  Tag,
  ImageIcon,
  FileText,
  Banknote,
  Video,
  Star,
} from "lucide-react";

import Stepper, { type StepItem } from "../components/Stepper";
import PersianDateTimePicker from "../components/PersianDateTimePicker";
import LocationPickerModal, {
  type LocationPickerResult,
} from "../components/LocationPickerModal";
import {
  WizardProvider,
  useWizard,
  type ListingType,
  type WizardData,
  type MediaItem,
  type WizardMedia,
} from "../context/WizardContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const IRAN_PROVINCES = [
  "آذربایجان شرقی",
  "آذربایجان غربی",
  "اردبیل",
  "اصفهان",
  "البرز",
  "ایلام",
  "بوشهر",
  "تهران",
  "چهارمحال و بختیاری",
  "خراسان جنوبی",
  "خراسان رضوی",
  "خراسان شمالی",
  "خوزستان",
  "زنجان",
  "سمنان",
  "سیستان و بلوچستان",
  "فارس",
  "قزوین",
  "قم",
  "کردستان",
  "کرمان",
  "کرمانشاه",
  "کهگیلویه و بویراحمد",
  "گلستان",
  "گیلان",
  "لرستان",
  "مازندران",
  "مرکزی",
  "هرمزگان",
  "همدان",
  "یزد",
];

const TAG_SUGGESTIONS: Record<ListingType, string[]> = {
  post: [
    "سفالگری",
    "قالیبافی",
    "زیورآلات دست‌ساز",
    "نقاشی روی چرم",
    "منبت‌کاری",
    "آجیده‌دوزی",
    "معرق‌کاری",
    "فیروزه‌کوبی",
    "نقره‌کاری",
    "چرم‌دوزی",
    "گلیم‌بافی",
    "ترمه",
    "مینیاتور",
    "خاتم‌کاری",
    "بلورکاری",
  ],
  tour: [
    "بازدید از کارگاه",
    "گردشگری فرهنگی",
    "بازار سنتی",
    "روستاگردی",
    "طبیعت‌گردی",
    "موزه",
    "تاریخی",
    "غذا و آشپزی ایرانی",
    "صنایع‌دستی",
  ],
  training: [
    "کارگاه آموزشی",
    "سفالگری",
    "نقاشی",
    "خوشنویسی",
    "تذهیب",
    "گلیم‌بافی",
    "کوزه‌گری",
    "گره‌چینی",
    "آموزش هنرهای سنتی",
    "دوره مقدماتی",
  ],
  academy: [
    "آموزشگاه",
    "هنرستان",
    "آموزش فرهنگ و هنر",
    "مرکز خلاقیت",
    "سفالگری",
    "نقاشی",
    "خوشنویسی",
    "صنایع‌دستی",
    "دوره حضوری",
    "مجوزی هنر",
  ],
};

const TYPE_LABELS: Record<ListingType, string> = {
  post: "پست",
  tour: "تور",
  training: "آموزش",
  academy: "آموزشگاه",
};

const WIZARD_STEPS: StepItem[] = [
  { label: "اطلاعات پایه" },
  { label: "تصاویر" },
  { label: "قیمت‌گذاری" },
  { label: "زمان‌بندی" },
  { label: "مکان" },
  { label: "برچسب‌ها" },
  { label: "بررسی" },
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const FieldLabel: FC<{ children: React.ReactNode; required?: boolean }> = ({
  children,
  required,
}) => (
  <label className="block text-sm font-semibold text-[var(--color-text)] mb-1.5">
    {children}
    {required && <span className="text-red-500 mr-1">*</span>}
  </label>
);

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm " +
  "text-[var(--color-text)] placeholder:text-[var(--color-muted)] " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] " +
  "transition-colors duration-150";

// ─── Step 0 – Basic Info ──────────────────────────────────────────────────────

const StepBasicInfo: FC = () => {
  const { data, updateData } = useWizard();
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel required>عنوان</FieldLabel>
        <input
          className={inputCls}
          placeholder="مثال: کوزه‌های سفالین دست‌ساز یزد"
          value={data.title}
          maxLength={120}
          onChange={(e) => updateData({ title: e.target.value })}
        />
        <p className="text-xs text-[var(--color-muted)] mt-1">
          {data.title.length}/120 کاراکتر
        </p>
      </div>
      <div>
        <FieldLabel required>توضیحات</FieldLabel>
        <textarea
          className={inputCls + " min-h-[140px] resize-y"}
          placeholder="توضیح مختصری درباره محصول / تور / دوره‌تان بنویسید…"
          value={data.description}
          maxLength={2000}
          onChange={(e) => updateData({ description: e.target.value })}
        />
        <p className="text-xs text-[var(--color-muted)] mt-1">
          {data.description.length}/2000 کاراکتر
        </p>
      </div>
    </div>
  );
};

// ─── Step 1 – Media ───────────────────────────────────────────────────────────

const MAX_ITEMS = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function fileMediaType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/** Single cell in the media grid */
const MediaCell: FC<{
  item: MediaItem;
  isCover: boolean;
  onRemove: () => void;
  onSetCover: () => void;
}> = ({ item, isCover, onRemove, onSetCover }) => (
  <div
    className={[
      "relative aspect-square rounded-xl overflow-hidden border-2 group transition-all",
      isCover
        ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30"
        : "border-[var(--color-border)]",
    ].join(" ")}
  >
    {item.type === "image" ? (
      <img
        src={item.previewUrl}
        alt=""
        className="w-full h-full object-cover"
      />
    ) : (
      <video
        src={item.previewUrl}
        muted
        preload="metadata"
        className="w-full h-full object-cover"
      />
    )}

    {/* Type badge */}
    <span
      className={[
        "absolute bottom-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none",
        item.type === "video"
          ? "bg-purple-600 text-white"
          : "bg-sky-600 text-white",
      ].join(" ")}
    >
      {item.type === "video" ? "VIDEO" : "IMAGE"}
    </span>

    {/* Cover badge */}
    {isCover && (
      <span className="absolute top-1 right-1 bg-[var(--color-accent)] text-white text-[9px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5 pointer-events-none">
        <Star className="w-2.5 h-2.5" />
        نمایه
      </span>
    )}

    {/* Hover overlay actions */}
    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
      {!isCover && (
        <button
          type="button"
          onClick={onSetCover}
          title="به عنوان نمایه انتخاب شود"
          className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center hover:brightness-110"
        >
          <Star className="w-3.5 h-3.5 text-white" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="حذف"
        className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center hover:brightness-110"
      >
        <X className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  </div>
);

const StepMedia: FC = () => {
  const { data, updateData } = useWizard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const media: WizardMedia = data.media;

  /** Validate and build MediaItems from raw File list. */
  const buildItems = (
    rawFiles: File[],
    currentCount: number,
  ): { items: MediaItem[]; errs: string[] } => {
    const errs: string[] = [];
    const items: MediaItem[] = [];
    for (const file of rawFiles) {
      const mType = fileMediaType(file);
      if (!mType) {
        errs.push(`فرمت پشتیبانی نشده: ${file.name}`);
        continue;
      }
      const limit = mType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > limit) {
        const mb = mType === "video" ? "50" : "8";
        errs.push(`حجم فایل بیشتر از حد مجاز (${mb} MB): ${file.name}`);
        continue;
      }
      items.push({
        id: makeId(),
        file,
        type: mType,
        previewUrl: URL.createObjectURL(file),
      });
    }
    const remaining = MAX_ITEMS - currentCount;
    if (items.length > remaining) {
      errs.push(`حداکثر ${MAX_ITEMS} فایل. برخی فایل‌ها اضافه نشدند.`);
      return { items: items.slice(0, remaining), errs };
    }
    return { items, errs };
  };

  const handleRegularFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const { items: newItems, errs } = buildItems(
      Array.from(e.target.files ?? []),
      media.items.length,
    );
    setErrors(errs);
    if (newItems.length === 0) {
      e.target.value = "";
      return;
    }
    const merged = [...media.items, ...newItems];
    updateData({
      media: {
        items: merged,
        coverId: media.coverId ?? merged[0].id,
      },
    });
    e.target.value = "";
  };

  const handleCoverFile = (e: ChangeEvent<HTMLInputElement>) => {
    const { items: newItems, errs } = buildItems(
      Array.from(e.target.files ?? []).slice(0, 1),
      0,
    );
    setErrors(errs);
    if (newItems.length === 0) {
      e.target.value = "";
      return;
    }
    const coverItem = newItems[0];
    // If already at max, replace the old cover item; otherwise prepend
    const withoutOldCover = media.coverId
      ? media.items.filter((m) => m.id !== media.coverId)
      : media.items;
    const old = media.coverId
      ? media.items.find((m) => m.id === media.coverId)
      : null;
    if (old) URL.revokeObjectURL(old.previewUrl);
    const merged = [coverItem, ...withoutOldCover].slice(0, MAX_ITEMS);
    updateData({ media: { items: merged, coverId: coverItem.id } });
    e.target.value = "";
  };

  const removeItem = (id: string) => {
    const item = media.items.find((m) => m.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    const remaining = media.items.filter((m) => m.id !== id);
    updateData({
      media: {
        items: remaining,
        coverId: media.coverId === id ? remaining[0]?.id : media.coverId,
      },
    });
  };

  const setCover = (id: string) =>
    updateData({ media: { ...media, coverId: id } });

  const coverItem = media.items.find((m) => m.id === media.coverId) ?? null;
  const hasItems = media.items.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Cover section ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-[var(--color-text)]">
              نمایه اصلی
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              تصویر یا ویدیویی که در لیست نمایش داده می‌شود.
            </p>
          </div>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-white
              hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            آپلود نمایه
          </button>
        </div>

        {coverItem ? (
          <div className="flex items-center gap-3">
            <div className="w-20 h-16 rounded-lg overflow-hidden border border-[var(--color-border)] flex-shrink-0">
              {coverItem.type === "image" ? (
                <img
                  src={coverItem.previewUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={coverItem.previewUrl}
                  muted
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--color-text)] truncate">
                {coverItem.file.name}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {coverItem.type === "video" ? "ویدیو" : "تصویر"} •{" "}
                {(coverItem.file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateData({ media: { ...media, coverId: undefined } })
              }
              className="text-[var(--color-muted)] hover:text-red-500 transition-colors"
              title="حذف نمایه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 opacity-50" />
            {hasItems
              ? "روی ستاره (★) هر فایل کلیک کنید یا فایل جدید آپلود کنید."
              : "هنوز فایلی آپلود نشده — اولین فایل بارگذاری‌شده به‌عنوان نمایه انتخاب می‌شود."}
          </p>
        )}
      </div>

      {/* ── Media grid ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-[var(--color-text)]">
            تصاویر و ویدیوها
          </p>
          <span className="text-xs text-[var(--color-muted)]">
            {media.items.length}/{MAX_ITEMS}
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {media.items.map((item) => (
            <MediaCell
              key={item.id}
              item={item}
              isCover={item.id === media.coverId}
              onRemove={() => removeItem(item.id)}
              onSetCover={() => setCover(item.id)}
            />
          ))}

          {media.items.length < MAX_ITEMS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center gap-1
                hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors duration-150
                text-[var(--color-muted)] hover:text-[var(--color-primary)]"
            >
              <Upload className="w-5 h-5" />
              <span className="text-[11px] font-medium">افزودن</span>
            </button>
          )}
        </div>

        {!hasItems && (
          <div className="mt-3 flex flex-col items-center justify-center py-10 border-2 border-dashed border-[var(--color-border)] rounded-2xl text-[var(--color-muted)]">
            <div className="flex gap-3 mb-2 opacity-40">
              <ImageIcon className="w-9 h-9" />
              <Video className="w-9 h-9" />
            </div>
            <p className="text-sm">تصویر یا ویدیو آپلود کنید</p>
            <p className="text-xs mt-1 text-center max-w-[240px]">
              تصویر: JPG، PNG، WebP (حداکثر 8 MB) • ویدیو: MP4، WebM، MOV
              (حداکثر 50 MB)
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 text-sm text-[var(--color-primary)] font-semibold hover:underline"
            >
              انتخاب از دستگاه
            </button>
          </div>
        )}
      </div>

      {/* ── Validation errors ── */}
      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600">
              ⚠️ {err}
            </p>
          ))}
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleRegularFiles}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleCoverFile}
      />
    </div>
  );
};

// ─── Step 2 – Pricing & Capacity ─────────────────────────────────────────────

const StepPricing: FC = () => {
  const { data, updateData } = useWizard();
  const showCapacity = data.type === "tour" || data.type === "training";

  return (
    <div className="space-y-5">
      {/* For-sale toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] bg-white">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            قابل فروش / خرید
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            آیا کاربران می‌توانند این {TYPE_LABELS[data.type]} را خریداری کنند؟
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.forSale}
          onClick={() => updateData({ forSale: !data.forSale })}
          className={[
            "w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30",
            data.forSale
              ? "bg-[var(--color-primary)]"
              : "bg-[var(--color-border)]",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200",
              data.forSale ? "right-0.5" : "left-0.5",
            ].join(" ")}
          />
        </button>
      </div>

      {/* Price */}
      {data.forSale && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FieldLabel required>قیمت</FieldLabel>
            <input
              type="number"
              min={0}
              className={inputCls}
              placeholder="مثلاً 250000"
              value={data.price}
              onChange={(e) => updateData({ price: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>واحد</FieldLabel>
            <select
              className={inputCls}
              value={data.currency}
              onChange={(e) =>
                updateData({
                  currency: e.target.value as WizardData["currency"],
                })
              }
            >
              <option value="تومان">تومان</option>
              <option value="دلار">دلار</option>
            </select>
          </div>
        </div>
      )}

      {/* Capacity – tour / training only */}
      {showCapacity && (
        <div>
          <FieldLabel required>ظرفیت (نفر)</FieldLabel>
          <input
            type="number"
            min={1}
            className={inputCls}
            placeholder="مثلاً 12"
            value={data.capacity}
            onChange={(e) => updateData({ capacity: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

// ─── Step 3 – Schedule ────────────────────────────────────────────────────────

const StepSchedule: FC = () => {
  const { data, updateData } = useWizard();
  // Schedule dates and duration are required only for training;
  // other types may optionally set a start date but it never blocks progress.
  const isScheduled = data.type === "training";

  return (
    <div className="space-y-5">
      {!isScheduled && (
        <div className="p-4 bg-sky-50 rounded-xl text-sm text-sky-700 border border-sky-200">
          برای نوع «پست» تاریخ‌بندی اجباری نیست؛ در صورت تمایل می‌توانید تاریخ
          انتشار را مشخص کنید.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PersianDateTimePicker
          label="تاریخ شروع"
          value={data.startDate}
          onChange={(iso) => updateData({ startDate: iso })}
          required={isScheduled}
          withTime={isScheduled}
          minDateToday
        />
        <PersianDateTimePicker
          label="تاریخ پایان"
          value={data.endDate}
          onChange={(iso) => updateData({ endDate: iso })}
          withTime={isScheduled}
          minDateToday
        />
      </div>

      {isScheduled && (
        <div>
          <FieldLabel>مدت زمان</FieldLabel>
          <input
            className={inputCls}
            placeholder="مثلاً ۳ ساعت یا ۲ روز"
            value={data.duration}
            onChange={(e) => updateData({ duration: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

// ─── Step 4 – Location ────────────────────────────────────────────────────────

const StepLocation: FC = () => {
  const { data, updateData } = useWizard();
  const [mapOpen, setMapOpen] = useState(false);

  /**
   * Try to match a Nominatim state string (e.g. "استان اصفهان")
   * against the IRAN_PROVINCES list ("اصفهان").
   */
  const matchProvince = (state?: string): string | undefined => {
    if (!state) return undefined;
    return IRAN_PROVINCES.find((p) => state.includes(p));
  };

  const handleMapConfirm = (result: LocationPickerResult) => {
    setMapOpen(false);
    const matchedProvince = matchProvince(result.state);
    updateData({
      geo: result.geo,
      // Auto-fill city when the field is still empty
      ...(!data.city && result.city ? { city: result.city } : {}),
      // Auto-fill province if we found a match in IRAN_PROVINCES
      ...(!data.province && matchedProvince
        ? { province: matchedProvince }
        : {}),
      // Always overwrite address with the geocoded result
      ...(result.formattedAddress
        ? { address: result.formattedAddress }
        : result.address
          ? { address: result.address }
          : {}),
    });
  };

  return (
    <div className="space-y-5">
      {/* Map picker button */}
      <button
        type="button"
        onClick={() => setMapOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--color-primary)]/40 text-[var(--color-primary)] text-sm font-medium hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
      >
        <MapPin className="w-4 h-4" />
        انتخاب از نقشه
        {data.geo && (
          <span className="mr-2 text-xs font-normal text-green-600">
            ✓ موقعیت تنظیم شد
          </span>
        )}
      </button>

      <div>
        <FieldLabel required>استان</FieldLabel>
        <select
          className={inputCls}
          value={data.province}
          onChange={(e) => updateData({ province: e.target.value })}
        >
          <option value="">انتخاب استان…</option>
          {IRAN_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel required>شهر</FieldLabel>
        <input
          className={inputCls}
          placeholder="نام شهر را وارد کنید"
          value={data.city}
          onChange={(e) => updateData({ city: e.target.value })}
        />
      </div>

      <div>
        <FieldLabel>آدرس دقیق (اختیاری)</FieldLabel>
        <textarea
          className={inputCls + " min-h-[90px] resize-none"}
          placeholder="مثلاً: بازار قیصریه، راسته مسگرها…"
          value={data.address}
          onChange={(e) => updateData({ address: e.target.value })}
        />
      </div>

      <LocationPickerModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initialGeo={data.geo}
        onConfirm={handleMapConfirm}
      />
    </div>
  );
};

// ─── Step 5 – Tags ────────────────────────────────────────────────────────────

const StepTags: FC = () => {
  const { data, updateData } = useWizard();
  const suggestions = TAG_SUGGESTIONS[data.type];

  const toggleTag = (tag: string) => {
    const exists = data.tags.includes(tag);
    updateData({
      tags: exists ? data.tags.filter((t) => t !== tag) : [...data.tags, tag],
    });
  };

  const addCustomTag = (raw: string) => {
    const tag = raw.trim();
    if (tag && !data.tags.includes(tag) && data.tags.length < 10) {
      updateData({ tags: [...data.tags, tag] });
    }
  };

  return (
    <div className="space-y-5">
      {/* Category */}
      <div>
        <FieldLabel>دسته‌بندی اصلی</FieldLabel>
        <input
          className={inputCls}
          placeholder="مثلاً: سفالگری، بافتنی، گردشگری فرهنگی…"
          value={data.category}
          onChange={(e) => updateData({ category: e.target.value })}
        />
      </div>

      {/* Tag suggestions */}
      <div>
        <FieldLabel>برچسب‌های پیشنهادی</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((tag) => {
            const active = data.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
                  active
                    ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                    : "bg-white border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
                ].join(" ")}
              >
                {active && <span className="ml-1">✓</span>}
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom tag input */}
      <div>
        <FieldLabel>افزودن برچسب دلخواه</FieldLabel>
        <div className="flex gap-2">
          <input
            id="custom-tag-input"
            className={inputCls + " flex-1"}
            placeholder="برچسب جدید…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const input = e.currentTarget;
                addCustomTag(input.value);
                input.value = "";
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById(
                "custom-tag-input",
              ) as HTMLInputElement | null;
              if (input) {
                addCustomTag(input.value);
                input.value = "";
              }
            }}
            className="px-3 py-2 rounded-xl bg-[var(--color-primary)] text-white hover:brightness-110 transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Enter را بزنید یا روی + کلیک کنید.
        </p>
      </div>

      {/* Chosen tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-[var(--color-border)]">
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 pl-2 pr-3 py-1 bg-white text-xs rounded-full border border-[var(--color-border)] text-[var(--color-text)]"
            >
              {tag}
              <button
                type="button"
                onClick={() => toggleTag(tag)}
                className="text-[var(--color-muted)] hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Step 6 – Review & Publish ────────────────────────────────────────────────

interface ReviewRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}
const ReviewRow: FC<ReviewRowProps> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-3 border-b border-[var(--color-border)] last:border-0">
    <span className="mt-0.5 text-[var(--color-primary)] flex-shrink-0">
      {icon}
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-[var(--color-muted)] mb-0.5">{label}</p>
      <p className="text-sm font-medium text-[var(--color-text)] break-words">
        {value || "—"}
      </p>
    </div>
  </div>
);

const StepReview: FC = () => {
  const { data } = useWizard();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-medium">
        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        همه اطلاعات وارد شده است. قبل از انتشار بازبینی کنید.
      </div>

      {/* Cover preview in review */}
      {(() => {
        const coverItem =
          data.media.items.find((m) => m.id === data.media.coverId) ??
          data.media.items[0];
        if (!coverItem) return null;
        return (
          <div className="w-full h-40 rounded-2xl overflow-hidden border border-[var(--color-border)]">
            {coverItem.type === "image" ? (
              <img
                src={coverItem.previewUrl}
                alt="تصویر اصلی"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={coverItem.previewUrl}
                muted
                preload="metadata"
                className="w-full h-full object-cover"
              />
            )}
          </div>
        );
      })()}

      <div className="rounded-2xl border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border)] overflow-hidden">
        <ReviewRow
          icon={<FileText className="w-4 h-4" />}
          label="نوع آگهی"
          value={TYPE_LABELS[data.type]}
        />
        <ReviewRow
          icon={<FileText className="w-4 h-4" />}
          label="عنوان"
          value={data.title}
        />
        <ReviewRow
          icon={<FileText className="w-4 h-4" />}
          label="توضیحات"
          value={
            <span className="line-clamp-3 text-xs text-[var(--color-muted)]">
              {data.description}
            </span>
          }
        />
        <ReviewRow
          icon={<ImageIcon className="w-4 h-4" />}
          label="رسانه"
          value={`${data.media.items.filter((m) => m.type === "image").length} عکس ، ${data.media.items.filter((m) => m.type === "video").length} ویدیو`}
        />
        <ReviewRow
          icon={<Banknote className="w-4 h-4" />}
          label="قیمت"
          value={
            data.forSale
              ? `${Number(data.price).toLocaleString("fa")} ${data.currency}`
              : "رایگان / بدون فروش"
          }
        />
        {(data.type === "tour" || data.type === "training") && (
          <ReviewRow
            icon={<CalendarDays className="w-4 h-4" />}
            label="زمان‌بندی"
            value={
              [data.startDate, data.endDate].filter(Boolean).join(" تا ") ||
              data.duration ||
              "—"
            }
          />
        )}
        <ReviewRow
          icon={<MapPin className="w-4 h-4" />}
          label="مکان"
          value={[data.province, data.city, data.address]
            .filter(Boolean)
            .join("، ")}
        />
        <ReviewRow
          icon={<Tag className="w-4 h-4" />}
          label="برچسب‌ها"
          value={
            data.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {data.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 bg-gray-100 rounded-full text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            )
          }
        />
      </div>
    </div>
  );
};

// ─── Step renderer ────────────────────────────────────────────────────────────

const STEP_COMPONENTS: FC[] = [
  StepBasicInfo,
  StepMedia,
  StepPricing,
  StepSchedule,
  StepLocation,
  StepTags,
  StepReview,
];

// ─── Success screen ───────────────────────────────────────────────────────────

const SuccessScreen: FC<{ onReset: () => void }> = ({ onReset }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-5">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-[var(--color-text)]">
        آگهی با موفقیت ایجاد شد!
      </h2>
      <p className="text-[var(--color-muted)] max-w-xs text-sm">
        آگهی شما در صف بررسی قرار گرفت و به‌زودی منتشر خواهد شد.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:brightness-110 transition"
        >
          بازگشت به صفحه اصلی
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] transition"
        >
          ایجاد آگهی جدید
        </button>
      </div>
    </div>
  );
};

// ─── Inner wizard content (must be inside WizardProvider) ─────────────────────

const WizardContent: FC = () => {
  const {
    currentStep,
    totalSteps,
    data,
    goBack,
    goToStep,
    tryGoNext,
    stepError,
    resetWizard,
  } = useWizard();
  const navigate = useNavigate();

  // published state
  const [published, setPublished] = useState(false);

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (isLast) {
      // TODO: call API here; for now simulate success
      setPublished(true);
    } else {
      tryGoNext();
    }
  };

  const StepPanel = STEP_COMPONENTS[currentStep];

  if (published) {
    return (
      <SuccessScreen
        onReset={() => {
          setPublished(false);
          resetWizard(data.type);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden py-4">
        <Stepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          onStepClick={goToStep}
        />
      </div>

      {/* Step card */}
      <div className="bg-white rounded-2xl border border-[var(--color-border)] shadow-sm p-6">
        {/* Step heading */}
        <div className="mb-5 pb-4 border-b border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-muted)] mb-0.5">
            مرحله {currentStep + 1} از {totalSteps}
          </p>
          <h2 className="text-lg font-extrabold text-[var(--color-text)]">
            {WIZARD_STEPS[currentStep].label}
          </h2>
        </div>

        {/* Step content */}
        <StepPanel />

        {/* Validation error */}
        {stepError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {stepError}
          </div>
        )}
      </div>

      {/* Navigation bar */}
      <div dir="rtl" className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={isFirst ? () => navigate("/create") : goBack}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)]
            hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors duration-150"
        >
          <ChevronRight className="w-4 h-4" />
          {isFirst ? "انتخاب نوع" : "مرحله قبل"}
        </button>

        {/* Step dots (compact) */}
        <div className="hidden sm:flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => i < currentStep && goToStep(i)}
              className={[
                "rounded-full transition-all duration-200",
                i === currentStep
                  ? "w-5 h-2 bg-[var(--color-primary)]"
                  : i < currentStep
                    ? "w-2 h-2 bg-[var(--color-primary)]/50 cursor-pointer"
                    : "w-2 h-2 bg-[var(--color-border)]",
              ].join(" ")}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold
            hover:brightness-110 active:scale-95 transition-all duration-150"
        >
          {isLast ? "انتشار آگهی" : "مرحله بعد"}
          {!isLast && <ChevronLeft className="w-4 h-4" />}
          {isLast && <CheckCircle2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// ─── Page root (wraps provider + reads URL param) ─────────────────────────────

export default function CreateListingWizardPage() {
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get("type") ?? "post";
  const listingType: ListingType = (
    ["post", "tour", "training", "academy"].includes(rawType) ? rawType : "post"
  ) as ListingType;

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[var(--color-text)]">
          ایجاد {TYPE_LABELS[listingType]} جدید
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          مراحل زیر را تکمیل کنید تا آگهی شما در نخشا منتشر شود.
        </p>
      </div>

      <WizardProvider initialType={listingType}>
        <WizardContent />
      </WizardProvider>
    </div>
  );
}
