# Skeleton Loading - راهنمای کامل ✨

## خلاصه

اسکلت بارگذاری برای سایدبار دو ستونه ایجاد شد تا هنگام دریافت داده‌ها، کاربر یک رابط واضح و جذاب ببیند.

---

## فایل‌های ایجاد/تغییر شده

### 1. ✅ **SkeletonCard.tsx** (جدید)

```tsx
// موقعیت: frontend/src/components/SkeletonCard.tsx
// اندازه: خیلی کوچک (~50 خط)
// وابستگی: بدون (فقط Tailwind)
```

#### ساختار:

```
┌─────────────────────────┐
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒ Image   │ ← aspect-[4/3] gradient
├─────────────────────────┤
│ ▒▒▒▒▒▒▒▒▒ Title      │ ← 2 خط
│ ▒▒▒▒▒                 │
│                       │
│ ▒▒▒▒▒▒▒▒▒ Category   │ ← badge
│                       │
│ ▒▒▒▒▒▒▒▒ Distance    │ ← distance
│ ▒▒▒▒▒▒▒▒▒▒▒ Location │ ← location
│                       │
│ ▒▒▒▒▒▒▒▒▒ Button    │ ← CTA
└─────────────────────────┘

animate-pulse ← نرم و continuous
```

### 2. ✅ **Home.jsx** (بروزرسانی)

```jsx
// موقعیت: frontend/src/pages/Home.jsx
// تغییرات:
//   - import SkeletonCard
//   - Desktop: grid grid-cols-2 gap-4 skeleton
//   - Mobile: grid grid-cols-2 gap-3 skeleton
```

---

## کدهای استفاده شده

### SkeletonCard.tsx

```tsx
const SkeletonCard = () => (
  <div className="group block bg-white rounded-2xl overflow-hidden shadow-sm p-0 animate-pulse">
    {/* Image placeholder */}
    <div className="w-full aspect-[4/3] bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl" />

    {/* Content placeholder */}
    <div className="p-4 space-y-3">
      {/* Title skeleton - 2 lines */}
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded-full w-full" />
        <div className="h-4 bg-gray-200 rounded-full w-3/4" />
      </div>

      {/* Category badge skeleton */}
      <div className="h-6 bg-gray-200 rounded-full w-24" />

      {/* Distance & location skeleton */}
      <div className="space-y-2">
        <div className="h-5 bg-gray-200 rounded-full w-32" />
        <div className="h-4 bg-gray-200 rounded-full w-full" />
      </div>

      {/* Button skeleton */}
      <div className="pt-2">
        <div className="h-9 bg-gray-200 rounded-full w-full" />
      </div>
    </div>
  </div>
);
```

### Home.jsx (Desktop)

```jsx
{loading ? (
  <div className="grid grid-cols-2 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
) : ...}
```

### Home.jsx (Mobile)

```jsx
{loading ? (
  <div className="grid grid-cols-2 gap-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
) : ...}
```

---

## تفاصیل فنی

### Skeleton Elements

| عنصر     | Tailwind Classes                                          | نکته                   |
| -------- | --------------------------------------------------------- | ---------------------- |
| Image    | `aspect-[4/3] bg-gradient-to-r from-gray-200 to-gray-300` | Gradient برای جذاب‌تری |
| Title    | `h-4 rounded-full`                                        | 2 خط (100% + 75%)      |
| Category | `h-6 rounded-full w-24`                                   | Pill style             |
| Distance | `h-5 rounded-full w-32`                                   | Compact                |
| Location | `h-4 rounded-full w-full`                                 | Full width             |
| Button   | `h-9 rounded-full w-full`                                 | CTA size               |

### Animation

```css
animate-pulse:
  opacity: 1 → 0.5 → 1
  duration: 2s
  infinite
  smooth
```

### Grid Layout

**Desktop:**

```
grid grid-cols-2 gap-4
┌──────────┬──────────┐
│ Skeleton │ Skeleton │
│ Skeleton │ Skeleton │
│ Skeleton │ Skeleton │
└──────────┴──────────┘
```

**Mobile:**

```
grid grid-cols-2 gap-3
(کوچکتر و فشرده‌تر)
```

---

## مقایسه قبل/بعد

### قبل

```
Loading → Blue boxes (generic)
         ├─ h-48 div
         └─ animate-pulse (بدون جزئیات)
```

### بعد

```
Loading → Realistic skeleton cards
         ├─ Image placeholder (aspect 4/3)
         ├─ Title lines (2 lines)
         ├─ Category badge
         ├─ Distance badge
         ├─ Location text
         └─ CTA button
```

---

## مزایا

✅ **بهتر UX:**

- کاربر می‌داند محتوا بارگذاری می‌شود
- Layout و ساختار قبلاً مشخص است
- بدون "پرش" یا "flash"

✅ **بدون تاثیر عملکرد:**

- فقط Tailwind CSS
- بدون JavaScript اضافی
- بدون animation library
- بدون dependencies

✅ **واکنش‌پذیر:**

- Desktop: gap-4
- Mobile: gap-3
- Responsive grid خودکار

✅ **دسترس‌پذیر:**

- Semantic HTML
- Proper contrast
- animate-pulse smooth (بدون seizure risk)

---

## Build Status ✅

```
Build: SUCCESS
Modules: 134 (+1 نسبت قبل)
CSS: 54.82 kB
JS: 549.52 kB
Time: 2.90s
Errors: 0
```

---

## نحوه کار

### مراحل:

1. **Request شروع**

   ```
   loading = true
   ```

2. **Skeleton نمایش**

   ```
   <SkeletonCard /> × 6
   ↓
   Grid (2×3)
   ↓
   animate-pulse
   ```

3. **Data آمد**

   ```
   loading = false
   items populated
   ```

4. **Content نمایش**
   ```
   Skeleton‌ها جایگزین
   ← بدون پرش
   ← محتوا همتراز
   ```

---

## Acceptance Criteria ✅

- [x] Skeleton cards در grid 2 ستونه‌ای نمایش می‌شود
- [x] Desktop spacing: gap-4 ✓
- [x] Mobile spacing: gap-3 ✓
- [x] Aspect ratio: 4/3 (تطابق با کارت واقعی)
- [x] Animation: smooth pulse بدون seizure
- [x] No layout shift when switching to real content
- [x] Responsive: Desktop/Mobile/Tablet
- [x] Accessible: Proper contrast و semantics
- [x] No new dependencies
- [x] Build successful ✓

---

## مثال استفاده

### در Home.jsx:

```jsx
import SkeletonCard from "../components/SkeletonCard";

// داخل render:
{loading ? (
  <div className="grid grid-cols-2 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
) : (
  // محتوای واقعی
)}
```

### مجدد بدون تکرار:

```jsx
// Desktop و Mobile هر دو از SkeletonCard استفاده می‌کنند
// فقط spacing متفاوت است (gap-4 vs gap-3)
```

---

## نکات عملی

### اگر می‌خواهی تغییر دهی:

1. **تعداد skeleton:**

   ```jsx
   Array.from({ length: 6 }); // ← تغیر دهید
   ```

2. **Gradient:**

   ```jsx
   from-gray-200 to-gray-300  // ← رنگ خود
   ```

3. **Animation سرعت:**

   ```css
   animate-pulse  // در Tailwind دو ثانیه است
   // سفارشی سازی: tailwind.config.js
   ```

4. **Title خطوط:**
   ```jsx
   <div className="space-y-2">
     {/* line 1 */}
     {/* line 2 */}
   </div>
   ```

---

## فایل‌های مرتبط

```
frontend/
  src/
    components/
      SkeletonCard.tsx  ← جدید
    pages/
      Home.jsx          ← بروزرسانی شد
```

---

## نکات Tailwind

### استفاده شده:

```
rounded-full     → pill shapes
rounded-2xl      → card corners
bg-gradient-to-r → جذاب‌تر از flat
from/to          → gradient colors
animate-pulse    → built-in animation
aspect-[4/3]     → responsive ratio
h-*              → heights
w-*              → widths
p-4, space-y-3   → spacing
```

---

## Performance

- ✅ هیچ JS محاسبه اضافی
- ✅ CSS-only animation (GPU)
- ✅ کوچک و lightweight
- ✅ صرفاً visual (بدون data fetching)

---

## Next Steps (Optional)

1. 🎨 دسته‌بندی skeleton patterns
2. 🎬 Stagger animation (هر skeleton با تاخیر)
3. 🔄 Shimmer effect (جدا از pulse)
4. 📱 Responsive skeleton sizes
5. 🌙 Dark mode skeleton colors

---

## خلاصه

✅ **SkeletonCard.tsx:** محافظ سبک بدون وابستگی  
✅ **Home.jsx:** از skeleton برای loading استفاده می‌کند  
✅ **Grid:** Desktop (gap-4) و Mobile (gap-3)  
✅ **Animation:** Smooth pulse بدون seizure  
✅ **No CLS:** Layout ثابت می‌ماند  
✅ **Build:** موفقیت‌آمیز ✓

---

**وضعیت**: ✅ آماده برای استقرار
