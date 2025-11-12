# Sticky Filter Header - Quick Reference 🚀

## کد کامل (خلاصه)

### 1️⃣ State + Ref

```jsx
const [filterHeaderHasShadow, setFilterHeaderHasShadow] = useState(false);
const sidebarScrollRef = useRef(null);
```

### 2️⃣ Sticky Header

```jsx
<div
  className={`sticky top-0 z-10 px-6 py-5 border-b border-gray-200/80 space-y-4 backdrop-blur bg-white/90 rounded-t-2xl transition-shadow duration-200 ${
    filterHeaderHasShadow ? "shadow-md" : ""
  }`}
>
  {/* Title, Sort, Search, Chips */}
</div>
```

### 3️⃣ Scroll Listener

```jsx
<div
  ref={sidebarScrollRef}
  onScroll={(e) => {
    const scrollTop = e.currentTarget.scrollTop;
    setFilterHeaderHasShadow(scrollTop > 2);
  }}
  className="flex-1 overflow-y-auto thin-scrollbar"
>
  {/* Content */}
</div>
```

---

## چه کاری انجام شد؟

✅ Desktop sidebar filter header اکنون **sticky**  
✅ توضیح scroll detection: `scrollTop > 2px`  
✅ Shadow fade-in/out با `transition-shadow duration-200`  
✅ Glassmorphism: `backdrop-blur` + `bg-white/90`  
✅ Premium look: `rounded-t-2xl`  
✅ بدون performance impact

---

## Behavior

| State         | Shadow | Appearance          |
| ------------- | ------ | ------------------- |
| scrollTop ≤ 2 | ❌ NO  | Light, floating     |
| scrollTop > 2 | ✅ YES | Elevated, prominent |

---

## UX Flow

```
User opens Home
    ↓
Header (no shadow, semi-transparent)
    ↓
User scrolls down
    ↓
scrollTop > 2 triggered
    ↓
Shadow fades in (200ms)
    ↓
Header stays sticky (always visible)
```

---

## تغییرات فایل

**File**: `frontend/src/pages/Home.jsx`

```diff
+ const [filterHeaderHasShadow, setFilterHeaderHasShadow] = useState(false);
+ const sidebarScrollRef = useRef(null);

- <div className="px-6 py-5 border-b...">
+ <div className={`sticky top-0 z-10 ... ${filterHeaderHasShadow ? "shadow-md" : ""}`}>

- <div className="flex-1 overflow-y-auto...">
+ <div ref={sidebarScrollRef} onScroll={(e) => {
+   setFilterHeaderHasShadow(e.currentTarget.scrollTop > 2);
+ }} className="flex-1 overflow-y-auto...">
```

---

## Build ✅

```
vite build
✓ 134 modules transformed
✓ built in 2.58s
❌ No errors
```

---

## Customization

**تغییر threshold:**

```jsx
setFilterHeaderHasShadow(scrollTop > 10); // Later shadow trigger
```

**تقویت shadow:**

```jsx
filterHeaderHasShadow ? "shadow-lg" : ""; // Stronger shadow
```

**تقویت blur:**

```jsx
backdrop - blur - md; // More blur effect
```

---

## Acceptance ✅

- [x] Sticky filter header
- [x] Scroll-triggered shadow
- [x] Backdrop blur + semi-transparent
- [x] Smooth transition
- [x] Always accessible
- [x] Zero performance issues
- [x] Build successful

---

**Status**: ✅ Ready for Deployment
