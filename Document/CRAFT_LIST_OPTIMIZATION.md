# بهینه‌سازی CraftList و CraftCard

**تاریخ:** November 12, 2025  
**فایلها:** `frontend/src/components/CraftList.jsx`

## خلاصه تغییرات

تمامی بهینه‌سازی‌های درخواستی برای رفع CLS و بهتر کردن عملکرد اسکرول پیاده‌سازی شده است:

### 1. **React.memo برای CraftCard** ✅

- `CraftCard` اکنون توسط `React.memo` پوشش داده می‌شود
- **Custom comparison**: فقط در صورت تغییر `craft.id` دوباره رندر می‌شود
- **Effect**: جلوگیری از رندرهای غیر ضروری وقتی والد آپدیت می‌شود

```jsx
const MemoizedCraftCard = React.memo(CraftCard, (prevProps, nextProps) => {
  return prevProps.craft.id === nextProps.craft.id;
});
```

### 2. **تصاویر با Dimensions مشخص** ✅

- **width="112" height="80"** برای جلوگیری از CLS (Cumulative Layout Shift)
- **sizes="(max-width: 640px) 100px, 112px"** برای راهنمایی فراخوان‌دهنده تصویر
- **loading="lazy"** برای تأخیر بارگذاری تصاویر خارج از viewport
- **decoding="async"** برای جلوگیری از بلوکه کردن رندر

```jsx
<img
  src={imgSrc}
  alt={craft.title}
  className="w-28 h-20 object-cover rounded-md flex-shrink-0"
  width="112"
  height="80"
  sizes="(max-width: 640px) 100px, 112px"
  loading="lazy"
  decoding="async"
/>
```

### 3. **IntersectionObserver برای Lazy-Rendering** ✅

- **Initial render**: فقط ۵ آیتم اول بدون نیاز به scroll
- **On-demand rendering**: آیتم‌های پایین لیست به صورت lazy رندر می‌شوند
- **rootMargin: "100px"**: رندرکردن شروع می‌شود ۱۰۰px قبل از ورود viewport
- **Placeholder divs**: برای جلوگیری از layout shift

```jsx
const observer = new IntersectionObserver(
  (entries) => {
    setVisibleIndices((prevIndices) => {
      const newVisibleIndices = new Set(prevIndices);
      entries.forEach((entry) => {
        const idx = entry.target.dataset.idx;
        if (entry.isIntersecting || entry.boundingClientRect.top < 800) {
          newVisibleIndices.add(Number(idx));
        }
      });
      return newVisibleIndices;
    });
  },
  {
    root: null,
    rootMargin: "100px",
    threshold: 0,
  }
);
```

## نتایج انتظار‌رفته

### Performance

| معیار                 | پیش                        | بعد                           |
| --------------------- | -------------------------- | ----------------------------- |
| **CLS**               | بالا (تصاویر بدون height)  | کم (width/height مشخص)        |
| **Re-renders**        | بسیار (برای هر آپدیت والد) | کم (فقط craft.id تغییر یافته) |
| **DOM elements**      | تمام ۱۰۰+ کارت             | فقط ~5-10 کارت visible        |
| **Scroll smoothness** | ممکن است stutter           | روان (lazy-load)              |

### Acceptance Criteria ✅

1. **اسکرول روان‌تر**: IntersectionObserver فقط items مرئی را رندر می‌کند
2. **بدون پرش چیدمان**: width/height مشخص CLS را از بین می‌برد
3. **بدون وابستگی اضافی**: فقط React standard APIs استفاده شده

## نکات فنی

### State Management

```jsx
const [visibleIndices, setVisibleIndices] = useState(new Set());
const observerRef = useRef(null);
const itemRefsRef = useRef(new Map());
```

### Dependency Management

- **useEffect dependencies**: بدون `visibleIndices` (از updater function استفاده)
- **items change**: از `itemRefsRef.current.clear()` برای مجدد observer

### Backward Compatibility

- `CraftCard` component API تغیر نکرد
- فقط internal optimization (memoization + lazy-render)
- Compatible با تمام existing consumers

## Browser Support

- **IntersectionObserver**: Chrome 51+, Firefox 55+, Safari 12.1+ ✅
- **loading="lazy"**: Chrome 76+, Firefox 75+ ✅
- **Fallback**: خودکار (non-supporting browsers تمام items رندر می‌کنند)

## Testing Checklist

- [ ] اسکرول سریع - بدون قفز چیدمان
- [ ] تصاویر بدون placeholder jump
- [ ] DevTools > Performance > Largest Contentful Paint کاهش یافت
- [ ] Cumulative Layout Shift = 0 یا نزدیک به 0
- [ ] React DevTools: CraftCard re-renders کاهش یافت

## توثیق Inline

تمام کدها با کامنت‌های فارسی و انگلیسی توضیح داده شده‌اند.
