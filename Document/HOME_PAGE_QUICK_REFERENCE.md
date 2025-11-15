# Home Page Redesign - Quick Visual Reference

## Desktop Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│                              NAVBAR                                   │
├─────────────────────────────────────┬──────────────────────────────────┤
│                                     │                                  │
│  SIDEBAR (460px)                    │  MAP (remaining width)           │
│  p-6, gradient bg                   │  rounded-tl-3xl, shadow-lg       │
│                                     │                                  │
│  ┌──────────────────────────────┐   │  [📍 Status Badge]               │
│  │ Title + Results Badge        │   │                                  │
│  │ "آثار هنری"  [24]           │   │                                  │
│  └──────────────────────────────┘   │                                  │
│                                     │                                  │
│  ┌──────────────────────────────┐   │                                  │
│  │ [Sort ▼]  [Search...]        │   │                                  │
│  │ [Active Filter Chips]        │   │                                  │
│  └──────────────────────────────┘   │                                  │
│                                     │                                  │
│  ┌───────────────┬───────────────┐  │                                  │
│  │               │               │  │                                  │
│  │  Card Grid    │    2-Column   │  │                                  │
│  │  gap-4        │    Layout     │  │                                  │
│  │               │               │  │                                  │
│  ├───────────────┼───────────────┤  │                                  │
│  │               │               │  │                                  │
│  │  Each Card:   │  rounded-2xl  │  │                                  │
│  │  - Image      │  shadow-sm    │  │                                  │
│  │  - Title      │  hover:       │  │                                  │
│  │  - Category   │  scale-105    │  │                                  │
│  │  - Location   │  shadow-lg    │  │                                  │
│  │  - Details    │               │  │                                  │
│  │  [Button]     │               │  │                                  │
│  │               │               │  │                                  │
│  └───────────────┴───────────────┘  │                                  │
│                                     │                                  │
│  [Load More Button]                 │                                  │
└─────────────────────────────────────┴──────────────────────────────────┘
```

---

## Card Detail (Single Card)

```
┌─────────────────────────────────┐
│                                 │
│  Image (h-32, object-cover)     │  ← Zoom 110% on hover
│  [placeholder if missing]       │
│                                 │
├─────────────────────────────────┤
│ p-4, space-y-3                  │
│                                 │
│  Title: Bold, text-sm           │
│  "Beautiful Persian Carpet"     │
│  (max 2 lines)                  │
│                                 │
│  [Category Badge]               │
│  bg-gray-100, text-gray-700     │
│  "کاشی‌کاری"                     │
│                                 │
│  Distance (if available):       │
│  [Badge: text-blue-700]         │
│  "3.2 کیلومتر"                  │
│                                 │
│  📍 Location: text-xs           │
│  "مشهد، خراسان"                  │
│                                 │
│  [View Details] Button          │
│  Primary red, pill-shaped       │
│  w-full, text-xs, py-1.5        │
│                                 │
└─────────────────────────────────┘
```

---

## Mobile Layout

```
┌────────────────────────────┐
│      Full-Screen Map       │
│                            │
│  [Status Badge]            │
│  [📍 Location Button]      │
│                            │
│                            │
│                            │
│                            │
│                            │
│    ┌──────────────────┐    │
│    │ Bottom Sheet ▲   │    │
│    │ (Draggable)      │    │
│    │ ┌──┬──┐          │    │
│    │ │  │  │          │    │
│    │ │  │  │          │    │
│    │ ├──┼──┤          │    │
│    │ │  │  │          │    │
│    │ │  │  │          │    │
│    │ └──┴──┘          │    │
│    │ grid-cols-2      │    │
│    │ gap-3            │    │
│    │                  │    │
│    │ [Load More]      │    │
│    └──────────────────┘    │
└────────────────────────────┘

Card dimensions: h-28, rounded-xl
Gap: gap-3 (12px, reduced from gap-4)
Padding: p-3 (12px, reduced from p-4)
```

---

## Color Reference Guide

### Primary Colors

```
Brand Red:        #ef4444 (primary-500)
  - Light:        #fee2e2 (primary-100)
  - Dark:         #dc2626 (primary-600)
  - Used for:     CTA buttons, focus borders
```

### Neutral Grays

```
White:            #ffffff
Gray 50:          #f9fafb (backgrounds)
Gray 100:         #f3f4f6 (badges, subtle fills)
Gray 200:         #e5e7eb (borders, placeholders)
Gray 600:         #4b5563 (secondary text)
Gray 900:         #111827 (headings, primary text)
```

### Accent Colors

```
Blue (Distance):  #3b82f6
  - Background:   #eff6ff (blue-50)
  - Text:         #1e40af (blue-700)

Red (Error):      #ef4444
  - Background:   #fef2f2 (red-50)
  - Text:         #b91c1c (red-700)
```

---

## Spacing Reference

```
Sidebar padding:        p-6  (24px)
Grid gap:              gap-4 (16px)
Card padding:           p-4  (16px)
Card internal space:   space-y-3 (12px)
Mobile padding:         p-4  (16px)
Mobile gap:            gap-3 (12px)

Example card with spacing:
┌─────────────── gap-4 ────────────────┐
│ p-6   ┌─────────────┐     ┌──────────┐
│       │ space-y-3   │     │ space-y-3│
│       │  • Title    │ gap-4│  • Title │
│       │  • Category │     │  • Categ │
│       │  • Location │     │  • Locat │
│       │  • Button   │     │  • Butto │
│       └─────────────┘     └──────────┘
└──────────────────────────────────────┘
```

---

## Typography Scale

```
Headings:
  h2 - "آثار هنری"           text-xl font-bold text-gray-900
  h3 - "Title Bold"          text-sm font-semibold text-gray-900

Labels:
  Category Badge             text-xs font-medium text-gray-700
  Result Count               text-sm font-semibold text-gray-600
  Distance                   text-xs font-medium text-blue-700

Body:
  Secondary Text             text-xs text-gray-600
  Supporting Text            text-xs text-gray-500
```

---

## Rounded Corners (Border Radius)

```
Full Pills:         rounded-full    (9999px)  [badges]
Map Corner:         rounded-tl-3xl  (18px)    [map]
Cards:              rounded-2xl     (16px)    [cards]
Inputs/Buttons:     rounded-xl      (12px)    [controls]
Small Buttons:      rounded-lg      (8px)     [[optional]
```

---

## Shadow System

```
Default (cards):    shadow-sm       0 1px 2px rgba(0,0,0,0.05)
Hover (cards):      shadow-lg       0 10px 15px rgba(0,0,0,0.1)
Status badges:      shadow-md       0 4px 6px rgba(0,0,0,0.1)

Transition: transition-all duration-200
```

---

## Hover & Animation States

```
Card Hover:
  1. Scale: 1.0 → 1.05   (duration-200)
  2. Shadow: sm → lg     (simultaneously)
  3. Image zoom: 1.0 → 1.1 (duration-300)
  Result: Smooth, layered feedback

Button Hover:
  bg-primary-50 → bg-primary-100
  transition-colors duration-200

Input Focus:
  border-gray-300 → border-primary-500
  focus:outline-none
```

---

## Responsive Grid System

### Desktop (≥768px)

```
Grid: grid-cols-[460px_1fr]
- Left: Sidebar 460px fixed
- Right: Map filling remaining space

Inside sidebar:
grid grid-cols-2 gap-4
(2-column card grid)
```

### Mobile (<768px)

```
Grid: Full width stack

Inside bottom sheet:
grid grid-cols-2 gap-3
(2-column card grid, optimized for mobile)

Card height: h-28 (reduced from h-32)
Card radius: rounded-xl (from rounded-2xl)
Card padding: p-3 (from p-4)
```

---

## Key Classes Cheat Sheet

```jsx
// Sidebar Container
"bg-gradient-to-b from-white to-gray-50 flex flex-col p-6"

// Grid Layout
"grid grid-cols-2 gap-4"

// Card Container
"group block bg-white rounded-2xl overflow-hidden
shadow-sm hover:shadow-lg transition-all duration-200 hover:scale-105"

// Image
"w-full h-32 object-cover group-hover:scale-110 transition-transform duration-300"

// Card Content
"p-4 space-y-3"

// Title
"font-semibold text-sm text-gray-900 line-clamp-2"

// Badge
"px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full"

// Button
"w-full text-xs font-semibold text-primary-600 py-1.5 px-3 rounded-lg
border border-primary-200 bg-primary-50 hover:bg-primary-100"

// Distance Badge
"px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium"

// Location Icon + Text
"flex items-center gap-1 text-gray-600"

// Map Section
"relative h-full min-h-0 rounded-tl-3xl overflow-hidden shadow-lg"
```

---

## Common Modifications Quick Reference

### Change Number of Columns

```jsx
// Current: 2 columns
grid-cols-2

// 3 columns:
grid-cols-3

// 1 column (mobile):
md:hidden grid grid-cols-1
```

### Adjust Card Size

```jsx
// Bigger cards: Increase image height
h-32  →  h-40

// Smaller cards: Decrease image height
h-32  →  h-28

// Adjust spacing:
p-4   →  p-6  (bigger)
p-4   →  p-3  (smaller)
```

### Change Animation Speed

```jsx
// Faster:
duration-200  →  duration-150

// Slower:
duration-200  →  duration-300
```

### Adjust Hover Effect

```jsx
// More dramatic:
hover:scale-105  →  hover:scale-110

// Subtle:
hover:scale-105  →  hover:scale-102
```

---

## Common Issues & Solutions

| Issue                    | Solution                                    |
| ------------------------ | ------------------------------------------- |
| Cards not 2-column       | Check `grid-cols-2` present                 |
| Hover effect not working | Verify `hover:scale-105` + `transition-all` |
| Mobile grid broken       | Ensure `md:hidden` on mobile layout         |
| Scrollbar not showing    | Check `overflow-y-auto` on container        |
| Text not truncating      | Verify `line-clamp-2` present               |
| Images distorted         | Confirm `object-cover` set                  |
| Shadows not appearing    | Check `shadow-sm` + `hover:shadow-lg`       |
| Colors different         | Verify color classes match design system    |

---

## Testing Checklist (Quick)

### Desktop

- [ ] 2-column grid visible
- [ ] Cards scale on hover
- [ ] Images zoom smoothly
- [ ] Shadows elevate
- [ ] Search works
- [ ] Sort works
- [ ] Load more works

### Mobile

- [ ] Map full-screen
- [ ] Bottom sheet appears
- [ ] 2-column grid in sheet
- [ ] Scrolling smooth
- [ ] Touch targets sufficient
- [ ] Search works
- [ ] Load more works

### Across All

- [ ] No layout shift
- [ ] Smooth animations
- [ ] Colors correct
- [ ] Text readable
- [ ] Links clickable
- [ ] No console errors
- [ ] Images load properly

---

## Build & Deploy

### Build

```bash
cd frontend
npm run build
```

### Output

```
✓ 133 modules transformed.
dist/index.html                   1.10 kB
dist/assets/index-mCkLnN8G.css   52.55 kB
dist/assets/index-KUMe2Jh_.js   547.80 kB
✓ built in 2.49s
```

### Deploy

- Push to main branch
- No additional configuration needed
- No new dependencies to install
- Production-ready immediately

---

## Documentation Location

All documentation files:

- `HOME_PAGE_REDESIGN_SUMMARY.md` - Full details
- `DESIGN_SYSTEM_HOME_PAGE.md` - Design tokens
- `HOME_PAGE_BEFORE_AFTER.md` - Comparison
- `HOME_PAGE_IMPLEMENTATION_GUIDE.md` - Technical
- `HOME_PAGE_VERIFICATION_CHECKLIST.md` - QA
- `HOME_PAGE_QUICK_REFERENCE.md` - This file

---

**Version**: 1.0  
**Status**: ✅ Production Ready  
**Last Updated**: November 12, 2025
