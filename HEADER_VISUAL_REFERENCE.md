# 🎨 Header Enhancement - Visual Reference

## Desktop Layout (md: 768px+)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Navbar - Desktop                              │
├─────────────────────────────────────────────────────────────────────┤
│ py-3 md:py-4                                                        │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │                                                               │  │
│ │  نخشا    [🔍 جستجو......................] [📍 تهران]     │  │
│ │ (logo)   (search - h-11 rounded-full)  (city - h-11)        │  │
│ │                                                               │  │
│ │                                    [ثبت محصول] [آثار من] ... │  │
│ │                                    (action buttons)          │  │
│ │                                                               │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│ Spacing: gap-3 between elements                                    │
│ Heights: Search & City both h-11 (44px) for large touch targets   │
│ Shadows: shadow-sm on search/city, shadow-md on focus             │
│ Colors: Border gray-200, bg-white, text-gray-700                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tablet Layout (sm: 640px - md: 767px)

```
┌──────────────────────────────────────────────────────────────┐
│              Navbar - Tablet                                 │
├──────────────────────────────────────────────────────────────┤
│ py-3                                                         │
│ ┌────────────────────────────────────────────────────────┐  │
│ │                                                        │  │
│ │  نخشا    [🔍 جستجو............] [📍 تهران]  [+] │  │
│ │ (logo)   (search visible)      (city)        (btn)   │  │
│ │                                                        │  │
│ │                                   [ثبت محصول] [ورود] │  │
│ │                                   (text buttons)      │  │
│ │                                                        │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ Search visible (hidden md:flex is active at md)            │
│ City selector visible                                       │
│ Text buttons visible (hidden sm:inline-block)              │
└──────────────────────────────────────────────────────────────┘
```

---

## Mobile Layout (< sm: 640px)

```
┌─────────────────────────────────────────┐
│        Navbar - Mobile (Top Row)       │
├─────────────────────────────────────────┤
│ py-3                                    │
│ ┌───────────────────────────────────┐  │
│ │ نخشا  [🔍] [📍] [➕] [👤]      │  │
│ │ (logo) (search) (city) (create)  │  │
│ │        (icon btns - w-10 h-10)   │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ [🔍 جستجو......................] │  │
│ │ (full-width search - h-11)      │  │
│ └───────────────────────────────────┘  │
│                                         │
│ Icon buttons: rounded-full hover:bg-gray-100
│ Search bar: full width, rounded-full
│ Compact, touch-friendly design
└─────────────────────────────────────────┘
```

---

## Search Input Styling

```
Before:
┌──────────────────────────────┐
│ 🔍 جستجو...                 │  py-2, rounded-md
│ (smaller, sharp corners)     │  border-gray-300
└──────────────────────────────┘

After:
┌────────────────────────────────────┐
│                                    │
│  🔍  جستجو در آثار...            │  h-11, rounded-full
│                                    │  shadow-sm
│                                    │  border-gray-200
└────────────────────────────────────┘  focus-within:ring-2

Features:
- Larger height for better touch target
- Fully rounded corners (modern look)
- Subtle shadow for depth
- Light gray border (not dark)
- Focus ring on container (not input)
- Placeholder: lighter gray (gray-400)
```

---

## City Selector Button

```
Before:
تهران 📍  (inline text with icon)

After:
┌─────────────┐
│  📍  تهران  │  h-11, rounded-full
└─────────────┘  shadow-sm, border-gray-200
  hover:bg-gray-50, focus:ring-2

Features:
- Icon on left (RTL)
- Text on right
- Clickable button with proper states
- Same height as search (h-11)
- Focus ring for accessibility
- Hover background for feedback
```

---

## Icon Buttons (Mobile)

```
Individual Button:
┌────────────┐
│            │
│     🔍     │  w-10 h-10
│            │  rounded-full
└────────────┘  hover:bg-gray-100
                focus-visible:ring-2

Button Row:
[🔍] [📍] [➕] [👤]
  gap-2 between each
  All same size
  All same hover state
  All same focus ring

States:
Idle:    bg-white, text-gray-700
Hover:   bg-gray-100, text-gray-800
Focus:   ring-2 ring-primary-500
Active:  (depends on context)
```

---

## Primary Action Buttons

```
Before:
┌─────────────────┐
│ ثبت محصول       │  px-3 py-1.5, rounded-md
└─────────────────┘  smaller button

After:
┌──────────────────────┐
│                      │
│   ثبت محصول         │  px-4 py-2, rounded-full
│                      │  h-auto but height-aligned
└──────────────────────┘
bg-primary-600
hover:bg-primary-700
focus-visible:ring-2 ring-offset-2

Features:
- Rounded full for modern look
- Larger padding (px-4)
- Ring offset for focus (elevated effect)
- Smooth color transition
- White text for contrast
```

---

## Accessibility Features

### Focus Indicators

```
Search Input Focus:
┌────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← focus-within:ring-2
│  🔍  جستجو...                        │ ← ring-primary-500/30
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← shadow-md added
└────────────────────────────────────────┘

Button Focus:
  ┌─────────────┐
  ┃ ثبت محصول  ┃  ← focus-visible:ring-2
  ┃ ring offset ┃  ← ring-offset-2
  └─────────────┘
```

### ARIA Labels

```
JSX Example:
<button
  aria-label="انتخاب شهر"           // Screen reader
  title="انتخاب شهر"                // Tooltip
  className="...rounded-full..."
>
  📍 تهران
</button>

Enables:
✓ Screen reader accessibility
✓ Keyboard navigation
✓ Tooltip on hover
✓ Semantic meaning
```

---

## Color Palette

### Primary Colors (Action Buttons)

```
Normal:  bg-primary-600  #dc2626 (red)
Hover:   bg-primary-700  #b91c1c (darker red)
Text:    text-white      #ffffff
Focus:   ring-primary-500 #ef4444 (bright red)
```

### Neutral Colors (Inputs)

```
Background:    bg-white     #ffffff
Border:        border-gray-200 #e5e7eb (very light)
Placeholder:   text-gray-400  #9ca3af
Icon:          text-gray-600  #4b5563
Hover bg:      hover:bg-gray-50 #f9fafb
```

### Interactive States

```
Focus Ring:    ring-primary-500 #ef4444
Focus Shadow:  shadow-md
Hover Shadow:  none (added on focus)
Transition:    transition-all duration-200
```

---

## Typography Scale

```
Logo:          text-2xl font-bold       (32px)
Heading:       text-xl font-semibold    (20px)
Button Text:   text-sm font-medium      (14px bold)
Input:         text-sm md:text-base     (14px → 16px)
Secondary:     text-sm                  (14px)
Caption:       text-xs                  (12px)
```

---

## Spacing System

```
Navbar Padding:     py-3 md:py-4     (12px → 16px)
Container Padding:  px-4             (16px)
Gap Between Items:  gap-3            (12px)
Mobile Gap:         gap-2            (8px)
Input Padding:      px-4             (16px)
Button Padding:     px-4 py-2        (16px × 8px)
```

---

## Animation & Transitions

```
All Transitions:    transition-all duration-200

Examples:
- Button hover:     bg-primary-600 → bg-primary-700
- Focus ring:       opacity 0 → 1
- Shadow change:    shadow-sm → shadow-md
- Smooth motion:    easing-linear over 200ms
```

---

## Responsive Design

### Breakpoints (Tailwind)

```
Mobile:   default (< 640px)
Tablet:   sm: 640px
Desktop:  md: 768px
Large:    lg: 1024px
```

### Show/Hide Logic

```
Desktop Search:     hidden md:flex    (show on md+)
Mobile Buttons:     md:hidden         (hide on md+)
Text Buttons:       hidden sm:block   (show on sm+)
Mobile Icons:       sm:hidden         (hide on sm+)

Result:
Mobile:   Compact icon layout + full search below
Tablet:   Transition state with some elements
Desktop:  Full horizontal layout
```

---

## Dark Mode (Future)

```
Potential dark variant:
- bg-gray-900 (dark background)
- border-gray-700 (darker border)
- text-white (light text)
- hover:bg-gray-800 (dark hover)
- focus-visible:ring-primary-400 (lighter ring)

Not implemented currently (light mode only)
```

---

## RTL Considerations

```
✓ Text input: text-right (built-in)
✓ Icon placement: ml-2 becomes mr-2 in RTL
✓ Flexbox gaps: gap-3 handles RTL automatically
✓ Order: Flexbox reverse not needed (natural order works)
✓ Arrow icons: Same SVG path works for RTL

Test RTL with:
<html dir="rtl">
```

---

## Performance Notes

```
No Performance Impact:
- No animations on page load
- CSS transitions only (GPU accelerated)
- No JavaScript in navbar
- No new dependencies
- SVG icons are inline (small)
- Tailwind utilities only

Build Size:
Before:  558.17 KB JS
After:   ~560 KB JS (minimal increase)
CSS:     No bloat (using existing Tailwind)
```

---

**This visual reference can be used for:**

- Designer review
- QA testing
- Developer implementation
- User documentation
- Accessibility verification
