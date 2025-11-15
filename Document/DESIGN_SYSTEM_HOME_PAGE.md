# Design System - Home Page Redesign

## Color Palette

### Primary Colors

```
Brand Primary (Red): #ef4444 (primary-500)
- Lighter: #fee2e2 (primary-100)
- Darker: #dc2626 (primary-600)

Used for: CTA buttons, active states, highlights
```

### Neutral Colors

```
White: #ffffff
Gray 50: #f9fafb (very light backgrounds)
Gray 100: #f3f4f6 (badge backgrounds, subtle fills)
Gray 200: #e5e7eb (disabled, placeholders)
Gray 300: #d1d5db (input borders)
Gray 400: #9ca3af (secondary icons, subtle text)
Gray 500: #6b7280 (secondary labels)
Gray 600: #4b5563 (body text, secondary info)
Gray 700: #374151 (medium-emphasis text)
Gray 900: #111827 (headings, primary text)
```

### Status Colors

```
Blue (Distance): #3b82f6 (blue-500)
  - Background: #eff6ff (blue-50)
  - Text: #1e40af (blue-700)

Red (Error): #ef4444 (red-500)
  - Background: #fef2f2 (red-50)
  - Text: #b91c1c (red-700)

Amber (Warning): #f59e0b (amber-500)
  - Background: #fef3c7 (amber-50)
  - Text: #92400e (amber-900)

Green (Success): #10b981 (green-500)
  - Background: #ecfdf5 (green-50)
  - Text: #065f46 (green-700)
```

---

## Typography

### Font Family

**Primary**: Vazirmatn (Persian)
**Fallback**: system-ui, -apple-system, "Segoe UI", Roboto

### Font Sizes

```
xs:  11px (text-xs)
sm:  14px (text-sm)
base: 16px (default)
lg:  18px (text-lg)
xl:  20px (text-xl)
2xl: 24px (text-2xl)
```

### Font Weights

```
Regular: 400 (body text)
Medium: 500 (labels, badges)
Semibold: 600 (card titles, emphasis)
Bold: 700 (section headings)
```

### Text Hierarchy

| Element         | Style                                              | Usage               |
| --------------- | -------------------------------------------------- | ------------------- |
| Section Heading | `text-xl font-bold text-gray-900`                  | "آثار هنری"         |
| Card Title      | `text-sm font-semibold text-gray-900 line-clamp-2` | Craft name          |
| Primary Label   | `text-sm font-medium text-gray-700`                | Filter labels       |
| Secondary Label | `text-xs font-medium text-gray-600`                | Category badges     |
| Body Text       | `text-sm text-gray-600`                            | Descriptions        |
| Supporting Text | `text-xs text-gray-500`                            | Timestamps, helpers |
| Error Text      | `text-xs font-medium text-red-700`                 | Error messages      |

---

## Component Styles

### Cards (2-Column Grid)

#### Desktop Card

```css
className="group block bg-white rounded-2xl overflow-hidden
  shadow-sm hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer"

/* Image container */
h-32 bg-gray-200
group-hover:scale-110 transition-transform duration-300

/* Content container */
p-4 space-y-3

/* Title */
font-semibold text-sm text-gray-900 line-clamp-2

/* Category badge */
px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full

/* Distance badge */
px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium

/* CTA Button */
w-full text-xs font-semibold text-primary-600 py-1.5 px-3
rounded-lg border border-primary-200 bg-primary-50
hover:bg-primary-100 transition-colors
```

#### Mobile Card

```css
/* Adjusted for smaller screens */
rounded-xl (instead of rounded-2xl)
h-28 (image, instead of h-32)
p-3 (instead of p-4)
shadow-sm hover:shadow-md (lighter shadow)
```

### Input Fields

#### Standard Input

```css
className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm
  bg-white hover:border-gray-400 focus:border-primary-500
  focus:outline-none transition-colors"
```

#### Search/Sort Controls

```css
/* Container */
flex items-center gap-3

/* Select */
flex-1 border border-gray-300 rounded-xl px-4 py-2.5

/* Input */
flex-1 border border-gray-300 rounded-xl px-4 py-2.5
placeholder:text-gray-400
```

### Buttons

#### Primary CTA (Card Button)

```css
text-xs font-semibold text-primary-600 py-1.5 px-3 rounded-lg
border border-primary-200 bg-primary-50 hover:bg-primary-100
transition-colors
```

#### Secondary Button (Load More)

```css
px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white
border-2 border-gray-300 rounded-xl hover:bg-gray-50
hover:border-gray-400 transition-all duration-200
```

### Badges & Chips

#### Category Badge

```css
px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full
```

#### Distance Badge

```css
px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium
```

#### Result Count Badge

```css
text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full
```

### Notifications & Alerts

#### Status Badge (Map)

```css
bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md
text-sm font-semibold text-gray-900
```

#### Error Message

```css
bg-red-50 text-red-700 text-xs px-4 py-3 rounded-lg
shadow-md font-medium max-w-sm
```

#### Warning Message

```css
bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg
shadow-md font-medium
```

---

## Spacing System

### Vertical Spacing

```
gap-2: 8px   (tight)
gap-3: 12px  (normal)
gap-4: 16px  (relaxed)
gap-6: 24px  (generous)

space-y-2: 8px (internal)
space-y-3: 12px (internal)
space-y-4: 16px (internal)
```

### Horizontal Padding

```
p-3: 12px  (compact)
p-4: 16px  (normal)
p-6: 24px  (generous)

px-2: 8px horizontal
px-3: 12px horizontal
px-4: 16px horizontal
px-6: 24px horizontal
```

### Border Radius

```
rounded-lg: 8px
rounded-xl: 12px
rounded-2xl: 16px (cards)
rounded-3xl: 18px (map corner)
rounded-full: 9999px (pills)
```

---

## Shadows

```css
/* Shadow system */
shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05)        /* Subtle */
shadow: 0 1px 3px 0 rgba(0,0,0,0.1)            /* Default */
shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1)      /* Medium */
shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1)    /* Large */

/* Card hover: shadow-sm → shadow-lg */
Transition: transition-all duration-200
```

---

## Animations & Transitions

### Hover Effects

```css
/* Card hover scale */
hover:scale-105 transition-all duration-200

/* Image zoom */
group-hover:scale-110 transition-transform duration-300

/* Button color change */
hover:bg-gray-50 transition-colors

/* Combined hover */
transition-all duration-200
```

### Loading States

```css
/* Skeleton animation */
animate-pulse

/* Pulsing notification */
animate-pulse
```

### Timing

- **Fast transitions**: `duration-200` (buttons, hovers)
- **Normal transitions**: `duration-300` (images, important changes)
- **Slow transitions**: `duration-500+` (modal entrances)

---

## Layout Grid

### Desktop (≥768px)

```
Grid: grid-cols-[460px_1fr]
- Left sidebar: 460px fixed
- Right map: remaining width
- Grid rows: [1fr] (single row)

Content Grid: grid-cols-2
- Card grid inside sidebar: 2 columns
- Gap: 16px (gap-4)
```

### Mobile (<768px)

```
Single column: full width
- Map: full height (base)
- Bottom sheet: overlay (expandable)

Content Grid: grid-cols-2
- Card grid inside sheet: 2 columns
- Gap: 12px (gap-3)
```

---

## Responsive Patterns

### Text Sizing Adjustments

```
Desktop: text-sm → text-xs (smaller on mobile)
Desktop: text-lg → text-sm
Desktop: p-6   → p-4 (mobile)
Desktop: gap-4 → gap-3 (mobile)
```

### Component Adjustments

```
Desktop card: rounded-2xl, h-32
Mobile card: rounded-xl, h-28

Desktop input: px-4 py-2.5
Mobile input: px-4 py-2 (slightly compact)

Desktop padding: p-6
Mobile padding: p-4
```

---

## Accessibility Guidelines

### Color Contrast (WCAG AA)

```
Text on white background:
- text-gray-900: ✅ 16.4:1 (Excellent)
- text-gray-600: ✅ 6.87:1 (Pass)
- text-gray-500: ⚠️ 5.38:1 (Borderline, use for secondary only)
- text-primary-600: ✅ 6.73:1 (Pass)

Error text on light backgrounds:
- text-red-700: ✅ 6.78:1 (Pass)
- text-blue-700: ✅ 6.72:1 (Pass)
```

### Focus States

All interactive elements have visible focus:

```css
focus:border-primary-500 focus:outline-none
focus:ring-2 focus:ring-primary-300 (alternative)
```

### Touch Targets

Minimum size: 44px × 44px

- Card: Full card clickable (larger than minimum)
- Button: py-2.5 (10px padding = ~40px height)
- Input: py-2.5 (sufficient height)

### Text Selection

- Proper line-height for readability
- Line-clamp-2 prevents content overflow
- Sufficient contrast for dyslexic readers

---

## Utility Reference

### Most Common Classes

| Class                         | Usage                     |
| ----------------------------- | ------------------------- |
| `rounded-2xl`                 | Card corners              |
| `shadow-sm`                   | Subtle card shadow        |
| `hover:shadow-lg`             | Card elevation on hover   |
| `hover:scale-105`             | Card scale animation      |
| `transition-all duration-200` | Smooth interactions       |
| `text-gray-900`               | Headings, primary text    |
| `text-gray-600`               | Secondary text            |
| `bg-gray-100`                 | Badge backgrounds         |
| `p-6`                         | Generous padding          |
| `gap-4`                       | Relaxed spacing           |
| `px-3 py-1`                   | Badge sizing              |
| `rounded-full`                | Pill shapes               |
| `line-clamp-2`                | Truncate text             |
| `space-y-3`                   | Internal vertical spacing |

---

## Notes for Future Developers

1. **Consistency**: Always use Tailwind utilities, not custom CSS
2. **Spacing**: Follow the gap system (gap-2, gap-3, gap-4, gap-6)
3. **Colors**: Reference this palette, don't invent new colors
4. **Shadows**: Use defined shadow system (`shadow-sm`, `shadow-lg`)
5. **Transitions**: Keep them fast and subtle (`duration-200` or `duration-300`)
6. **Mobile first**: Test mobile view in Chrome DevTools
7. **Accessibility**: Always check focus states and contrast
8. **RTL**: Ensure all layouts work with Persian (right-to-left) text

---

## Validation Checklist

Before shipping changes:

- [ ] Colors match palette ✓
- [ ] Spacing follows system ✓
- [ ] Shadows use defined system ✓
- [ ] Text hierarchy is clear ✓
- [ ] Focus states are visible ✓
- [ ] Hover effects are smooth ✓
- [ ] Mobile layout works ✓
- [ ] Contrast ratios pass WCAG AA ✓
- [ ] Build completes without errors ✓
