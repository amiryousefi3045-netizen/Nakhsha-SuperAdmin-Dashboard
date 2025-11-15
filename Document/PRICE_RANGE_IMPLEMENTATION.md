# Price Range Dual-Slider Implementation

## Overview

Replaced the fixed price range dropdown selector with an interactive dual-thumb range slider component featuring synchronized numeric inputs.

## Files Created

### 1. `frontend/src/components/PriceRange.jsx`

**New component** - A fully controlled, RTL-friendly price range slider with:

#### Features:

- **Dual-Thumb Slider**: Two overlapping `<input type="range">` elements

  - Minimum thumb (constrains max to not go below min)
  - Maximum thumb (constrains min to not exceed max)
  - Highlighted track between the two thumbs (blue primary color)

- **Numeric Inputs**: Two synchronized number fields

  - "از" (from) label - minimum price input
  - "تا" (to) label - maximum price input
  - Live sync with slider thumbs
  - Unit display: "تومان" (currency label)

- **Styling**:

  - Classes: `rounded-2xl bg-white p-4 shadow-sm border border-gray-200/60`
  - Custom CSS for slider thumbs (white, 3px blue border, shadow on hover)
  - Price summary display in gray box below inputs
  - RTL-friendly layout with text-right labels

- **Props**:

  ```typescript
  interface PriceRangeProps {
    value: [number, number]; // Current [min, max] range
    onChange: (v: [number, number]) => void; // Callback on change
    minCap?: number; // Absolute minimum (default: 0)
    maxCap?: number; // Absolute maximum (default: 5,000,000)
  }
  ```

- **Validation**:
  - Values are clamped between minCap and maxCap
  - Min cannot exceed (max - 1)
  - Max cannot be less than (min + 1)

#### Custom Slider CSS Included:

```css
input[type="range"]::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  border: 3px solid #3b82f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

input[type="range"]::-moz-range-thumb {
  /* Similar styles for Firefox */
}
```

## Files Modified

### 1. `frontend/src/components/FilterSidebar.jsx`

**Changes**:

- Added import: `import PriceRange from "./PriceRange"`
- Removed static `priceRanges` array (no longer needed)
- Replaced `<select>` dropdown with `<PriceRange>` component
- Updated to full width (col-span-2) to accommodate slider

**Before**:

```jsx
<select
  value={filters.priceRange}
  onChange={(e) => setFilters({ ...filters, priceRange: e.target.value })}
>
  <option value="">همه</option>
  {priceRanges.map((range) => ...)}
</select>
```

**After**:

```jsx
<PriceRange
  value={filters.priceRange || [0, 5000000]}
  onChange={(range) => setFilters({ ...filters, priceRange: range })}
  minCap={0}
  maxCap={5000000}
/>
```

### 2. `frontend/src/components/FilterChips.jsx`

**Changes**:

- Updated to handle priceRange as `[number, number]` array format
- Only displays price chip if range differs from default `[0, 5000000]`
- Formats label with Persian number locale and "تومان" suffix

**Logic**:

```jsx
if (filters.priceRange && Array.isArray(filters.priceRange)) {
  const [min, max] = filters.priceRange;
  if (min !== 0 || max !== 5000000) {
    items.push({
      key: "priceRange",
      label: `${min.toLocaleString("fa-IR")} - ${max.toLocaleString(
        "fa-IR"
      )} تومان`,
    });
  }
}
```

### 3. `frontend/src/pages/Home.jsx`

**Changes**:

- Updated initial priceRange state from `""` to `[0, 5000000]`
- Updated filter reset logic in two locations (desktop and mobile)
- Updated onClear handlers to reset priceRange to default array

### 4. `frontend/src/pages/HomeNew.jsx`

**Changes**:

- Updated initial priceRange state from `""` to `[0, 5000000]`
- Updated fetchCraftsNear call to handle array format:
  ```jsx
  min: filters.priceRange?.[0];
  max: filters.priceRange?.[1];
  ```
- Updated filter reset logic in two locations
- Updated onClear handlers to reset priceRange to default array

## Type Support

The existing `CraftFilters` type already supports the new format:

```typescript
export type CraftFilters = Partial<{
  priceRange: [number, number]; // ← Already supports array format
  // ... other filters
}>;
```

## User Interaction Flow

1. **Dragging Slider Thumbs**:

   - User drags left/right thumb on the range slider
   - Highlighted track updates dynamically
   - Number inputs sync in real-time
   - `onChange` callback triggered with `[newMin, newMax]`

2. **Typing Numbers**:

   - User types directly in min/max input fields
   - Values are validated and clamped
   - Slider thumbs update to reflect new values
   - Price summary updates

3. **Visual Feedback**:
   - Blue highlighted track between thumbs
   - Hover states on thumbs (elevated shadow)
   - Active state styling
   - Price summary display in subtle gray box

## Accessibility

- ARIA labels: `aria-label="قیمت کمینه"` / `aria-label="قیمت بیشینه"`
- Semantic HTML with proper label associations
- Keyboard navigable inputs
- Focus states for keyboard users
- Persian language support throughout

## No New Dependencies

- ✅ Uses only React hooks (useState, useEffect)
- ✅ No external slider libraries required
- ✅ Pure CSS for styling and custom slider appearance
- ✅ Uses existing utility: `toFa()` for number formatting

## Testing Acceptance Criteria

- [x] User can drag both slider thumbs independently
- [x] Slider thumbs cannot cross each other
- [x] Numeric inputs stay synced with slider position
- [x] Values are clamped between minCap and maxCap
- [x] Component emits `[min, max]` array on change
- [x] Filter chips display range in Persian format
- [x] RTL layout and labels work correctly
- [x] No console errors or TypeScript warnings
- [x] Responsive and works on mobile (inputs stack properly)

## CSS Classes Used

```
rounded-2xl       → Border radius for card container
bg-white          → Background color
p-4               → Padding
shadow-sm         → Subtle box shadow
border border-gray-200/60  → Light border
text-xs           → Small label text
font-semibold     → Bold labels
text-gray-700     → Label color
text-left         → LTR alignment for inputs
text-center       → Center alignment for summary
bg-gray-50        → Light background for summary box
rounded-lg        → Rounded corners for inputs
focus:ring-*      → Focus states
transition-*      → Smooth animations
```

## Browser Support

- ✅ Chrome/Edge (webkit)
- ✅ Firefox (moz)
- ✅ Safari
- ✅ Mobile browsers (iOS Safari, Chrome Android)
