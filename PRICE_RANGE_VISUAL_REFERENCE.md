# Price Range Component - Visual Reference

## Component Structure

```
┌─────────────────────────────────────────────────┐
│         محدوده قیمت (Price Range Label)         │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │  Slider Track Background (light gray)  │   │
│  │  ━━━━━━━━ Highlighted Track ━━━━━━━   │   │
│  │         (Blue, between thumbs)          │   │
│  │                ◯   ◯                    │   │
│  │        (Min Thumb, Max Thumb)           │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐   │
│  │  از (From Label) │  │  تا (To Label)   │   │
│  │  ┌────────────┐  │  │  ┌────────────┐  │   │
│  │  │   500,000  │ تومان  │ 2,000,000  │ تومان  │
│  │  └────────────┘  │  │  └────────────┘  │   │
│  └──────────────────┘  └──────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  500,000 تومان تا 2,000,000 تومان      │   │
│  │        (Price Summary in gray)          │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Slider Thumb Styling

**Default State**:

- Size: 20px × 20px circle
- Background: White
- Border: 3px solid #3b82f6 (Primary Blue)
- Shadow: 0 2px 8px rgba(0,0,0,0.15)

**Hover State**:

- Shadow: 0 2px 12px rgba(59, 130, 246, 0.4)
- Cursor: pointer

**Active/Dragging State**:

- Shadow: 0 2px 16px rgba(59, 130, 246, 0.6)

## Highlight Track

- Position: Between min and max thumb
- Color: Primary Blue (#3b82f6)
- Height: Matches slider height (8px)
- Border-radius: 9999px (fully rounded)
- Animation: Smooth transition on position change (100ms)

## Input Fields

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│         Grid: 2 columns gap-3   │  │      RTL text-right layout      │
├─────────────────────────────────┤  ├─────────────────────────────────┤
│ Label: "از" (From)              │  │ Label: "تا" (To)                │
│ ┌─────────────────────┬────────┐│  │ ┌─────────────────────┬────────┐│
│ │  Number Input       │تومان   ││  │ │  Number Input       │تومان   ││
│ │  flex-1, text-left  │flex... ││  │ │  flex-1, text-left  │flex... ││
│ │  p-2.5, rounded-lg  │shrink  ││  │ │  p-2.5, rounded-lg  │shrink  ││
│ │  border-gray-300    │        ││  │ │  border-gray-300    │        ││
│ └─────────────────────┴────────┘│  │ └─────────────────────┴────────┘│
└─────────────────────────────────┘  └─────────────────────────────────┘
```

## Filter Chips Display

When price range is applied (not default):

```
┌───────────────────────────────┐  ┌────────┐  ┌──────────────┐
│ 500,000 - 2,000,000 تومان  × │ │ سایر ×  │ │ حذف فیلترها ×│
└───────────────────────────────┘  └────────┘  └──────────────┘
    (Only shows if != [0, 5M])        (Other filters)
```

## Container Styling

```css
/* Outer Container */
rounded-2xl              /* Large rounded corners */
bg-white                 /* White background */
p-4                      /* 16px padding */
shadow-sm                /* Subtle box shadow */
border border-gray-200/60 /* Light gray border with transparency */
space-y-4                /* 16px gap between elements */
```

## Responsive Behavior

### Desktop (Default)

- Full width slider
- Two-column grid for inputs (50% each)
- Larger text for inputs
- Adequate spacing

### Mobile (≤640px)

- Full width slider (responsive to viewport)
- Two-column grid inputs still work well
- Smaller labels and text
- Touch-friendly thumb size (20px) fits well on fingers

## Interaction Examples

### Example 1: Dragging Min Thumb Right

```
Before:  ◯─────────◯
         0M       5M

After:   ────◯────◯
         1M      5M

Result: onChange([1000000, 5000000])
```

### Example 2: Typing in Max Input

```
Input field: [2,000,000]
→ Max thumb moves left
→ Highlighted track shrinks
→ onChange([1000000, 2000000])
```

### Example 3: Attempted Invalid Input (Max < Min)

```
User tries: Min=3M, Max=2M
→ Max value is clamped to Min+1
→ Result: [3000000, 3000001]
```

## Color Palette

```
Primary Blue:        #3b82f6  (Thumb border, highlight track)
Background:          #ffffff  (Card background)
Border:              #e5e7eb  (gray-200, with 60% opacity)
Text (Labels):       #374151  (gray-700)
Text (Secondary):    #9ca3af  (gray-400)
Hover BG (Input):    #f9fafb  (gray-50)
Focus Ring:          rgba(59, 130, 246, 0.2)  (Primary with transparency)
Summary BG:          #f3f4f6  (gray-50)
```

## RTL Considerations

✅ All labels positioned on the right
✅ Number inputs with "تومان" label on the left
✅ Grid layout respects RTL flow
✅ Text-right alignment for Persian text
✅ Price summary displays RTL: "500,000 تومان تا 2,000,000 تومان"

## Keyboard Navigation

```
Tab:         Move between elements (slider → min input → max input)
Arrow Keys:  Adjust slider values by 1
Page Up/Dn:  Adjust slider values by larger increments
Enter:       Submit input value
```

## Accessibility Features

- Semantic HTML structure
- ARIA labels on inputs
- Proper label associations
- Keyboard fully accessible
- High contrast colors (WCAG AA compliant)
- Persian language labels throughout
- Clear focus states
