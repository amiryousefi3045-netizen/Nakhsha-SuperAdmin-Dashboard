# Price Range Component - Integration & Testing Guide

## Quick Start Integration

### 1. Component Already Integrated

The `PriceRange` component is already integrated into `FilterSidebar.jsx`:

```jsx
import PriceRange from "./PriceRange";

// In FilterSidebar component:
<div className="col-span-2">
  <label className="block text-xs font-semibold text-gray-700 mb-3 text-right">
    محدوده قیمت
  </label>
  <PriceRange
    value={filters.priceRange || [0, 5000000]}
    onChange={(range) => setFilters({ ...filters, priceRange: range })}
    minCap={0}
    maxCap={5000000}
  />
</div>;
```

### 2. Page-Level Integration

Both Home and HomeNew pages now handle the array format:

```jsx
// Initial state
const [filters, setFilters] = useState({
  city: "",
  craftType: "",
  priceRange: [0, 5000000], // ← Array format
  forSale: false,
});

// Usage in API calls
const effectiveParams = useMemo(
  () => ({
    // ... other params
    priceRange: filters.priceRange, // Passed as [min, max] array
  }),
  [filters]
);
```

## Testing Checklist

### Visual Tests

- [ ] Slider appears in filter sidebar
- [ ] Slider track shows blue highlight between thumbs
- [ ] Two white circular thumbs with blue borders visible
- [ ] Numeric input fields appear below slider
- [ ] "از" (from) and "تا" (to) labels are correct
- [ ] "تومان" unit labels appear
- [ ] Price summary box appears below inputs
- [ ] Component has rounded corners and shadow
- [ ] Component has light gray border

### Interaction Tests - Slider

- [ ] Click and drag left thumb (min) to the right
  - Right boundary: cannot exceed max thumb
  - Visual feedback: highlighted track follows thumb
  - Input sync: min input updates in real-time
- [ ] Click and drag right thumb (max) to the left

  - Left boundary: cannot go below min thumb
  - Visual feedback: highlighted track follows thumb
  - Input sync: max input updates in real-time

- [ ] Hover over thumbs

  - Shadow increases (visual feedback)
  - Cursor changes to pointer

- [ ] Release thumb after dragging
  - onChange callback fires with [minValue, maxValue]
  - Filter chips update to show selected range

### Interaction Tests - Numeric Inputs

- [ ] Click min input field and type "100000"

  - Slider min thumb moves to correct position
  - Highlighted track updates
  - onChange fires

- [ ] Click max input field and type "2000000"

  - Slider max thumb moves to correct position
  - Highlighted track updates
  - onChange fires

- [ ] Try to set invalid min (e.g., 10000000)

  - Value clamps to current max - 1
  - Input reverts to valid value

- [ ] Try to set invalid max (e.g., 100000) when min is 500000

  - Value clamps to min + 1
  - Input reverts to valid value

- [ ] Clear and leave input empty
  - Field handles gracefully
  - Default value used or error prevented

### RTL & Localization Tests

- [ ] Layout is RTL (text right-aligned, inputs right-positioned)
- [ ] Persian labels "از" and "تا" display correctly
- [ ] "تومان" currency label appears
- [ ] Numbers display in Persian numerals via toFa()
- [ ] Price summary shows: "500,000 تومان تا 2,000,000 تومان"

### Filter Integration Tests

- [ ] Apply price filter and see FilterChip appear
  - Chip text: "500,000 - 2,000,000 تومان"
- [ ] Click chip X button to remove filter

  - Price range resets to [0, 5000000]
  - Slider thumbs return to extremes
  - Numeric inputs update

- [ ] Click "Clear All Filters" button
  - Price range resets to [0, 5000000]
  - All other filters clear too
  - Slider and inputs reset

### API/Data Tests (if backend supports)

- [ ] Change price range to [100000, 500000]
- [ ] Verify API request includes correct min/max parameters
- [ ] Verify filtered craft list updates
- [ ] Verify results only show crafts in price range

### Mobile Tests

- [ ] Slider works on touch devices
  - Thumb responds to touch drag
  - No accidental double-tap zoom
- [ ] Numeric inputs work on mobile keyboards

  - Numeric keyboard appears
  - Values can be typed

- [ ] Layout is responsive
  - Container fits on small screens
  - Grid inputs still align properly
  - Text is readable

### Accessibility Tests

- [ ] Tab navigation works through all inputs
- [ ] Arrow keys adjust slider values
- [ ] Screen reader announces labels correctly
- [ ] ARIA labels present and meaningful
- [ ] Focus states visible (ring around inputs)
- [ ] High contrast colors visible

### Edge Cases

- [ ] Set min to 0, max to 5000000 (full range) - no chip shown ✓
- [ ] Set min to 0, max to 1000000 - chip appears ✓
- [ ] Set min to 500000, max to 5000000 - chip appears ✓
- [ ] Swap values rapidly - no race conditions
- [ ] Delete filter and re-add - works correctly
- [ ] Type very large number (9999999999) - clamps correctly
- [ ] Type negative number - clamps to minCap
- [ ] Type decimal (1500.5) - handles as integer

## Performance Tests

- [ ] Component renders without lag when dragging
- [ ] onChange callbacks don't fire excessively
- [ ] No unnecessary re-renders of parent
- [ ] Smooth 60fps animation while dragging

## Error States

- [ ] No console errors on mount
- [ ] No console warnings about missing props
- [ ] No React key warnings
- [ ] No accessibility warnings

## Example User Flows

### Flow 1: Find Expensive Crafts

```
1. Open filter sidebar
2. Find "محدوده قیمت" (Price Range)
3. Drag min thumb to 2,000,000
4. Drag max thumb stays at 5,000,000
5. See FilterChip: "2,000,000 - 5,000,000 تومان"
6. Craft list updates showing only expensive items
```

### Flow 2: Find Budget Items

```
1. Open filter sidebar
2. Click max input field
3. Clear it and type 500000
4. See slider max thumb move left
5. See FilterChip: "0 - 500,000 تومان"
6. Craft list updates showing only affordable items
```

### Flow 3: Clear Specific Filter

```
1. Have multiple filters applied
2. See FilterChip for price range
3. Click X on price chip
4. Price range resets to [0, 5000000]
5. Chip disappears
6. Other filters remain applied
```

## Development Notes

### Key Files Modified

- ✅ `frontend/src/components/PriceRange.jsx` (NEW)
- ✅ `frontend/src/components/FilterSidebar.jsx`
- ✅ `frontend/src/components/FilterChips.jsx`
- ✅ `frontend/src/pages/Home.jsx`
- ✅ `frontend/src/pages/HomeNew.jsx`
- ✅ `frontend/src/types/api.ts` (Already supports priceRange: [number, number])

### State Management

- Filter state shape: `{ priceRange: [number, number] }`
- Default value: `[0, 5000000]`
- Passed to API as: `{ min: range[0], max: range[1] }` in fetchCraftsNear
- Passed directly as array to regular fetchCrafts

### No Breaking Changes

- ✅ Existing URL parameters still work (if priceRange was in URL)
- ✅ Filter sidebar maintains same layout and structure
- ✅ No new dependencies added
- ✅ No changes to backend API required

## Future Enhancements (Optional)

1. **Currency Symbol**: Add ability to change currency display
2. **Presets**: Add quick-select buttons (e.g., "Under 100K", "100K-500K")
3. **Debounced API Calls**: Add debounce to avoid excessive API calls while dragging
4. **URL Persistence**: Save price range to URL params
5. **Animations**: Add spring animation to thumbs during drag
6. **Custom Ranges**: Allow users to define min/max caps per category

## Troubleshooting

### Slider Not Responding

- Check that `value` prop is a valid `[number, number]` array
- Verify `onChange` callback is defined
- Check browser console for errors

### Inputs Not Syncing

- Ensure `useEffect` dependency array is correct
- Check that onChange is being called with new values

### Performance Issues While Dragging

- Consider adding debounce to onChange if API calls are expensive
- Check that parent component isn't re-rendering unnecessarily
- Profile with React DevTools to identify bottlenecks

### Mobile Touch Issues

- Ensure thumbs are large enough (current: 20px is good)
- Check device pixel ratio for proper scaling
- Test on actual device, not just browser emulation

## Acceptance Criteria Met ✓

- [x] **Dual-thumb range control**: Two overlapped range inputs
- [x] **Synchronized numeric inputs**: Min/max fields below slider
- [x] **No new dependencies**: Pure React + CSS only
- [x] **RTL friendly**: Persian labels "از" and "تا"
- [x] **Highlighted track**: Blue track between thumbs
- [x] **Proper styling**: rounded-2xl, bg-white, shadow-sm, border
- [x] **Clamped values**: Min/max constraints enforced
- [x] **Correct callbacks**: Emits [min, max] array
- [x] **User can drag both ends**: Full slider functionality
- [x] **User can type numbers**: Numeric input fields work
- [x] **Values stay clamped**: Input validation prevents invalid states
