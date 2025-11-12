# Map Enhancements - تولتیپ فاصله + انتخاب روی نقشه + Zoom Controls

**سه ویژگی نقشه بهبود یافته**

---

## خلاصه

### 1️⃣ Tooltips با فاصله (Distance Tooltips)

روی مارکرهای نقشه، تولتیپ (hover text) نمایش داده می‌شود که شامل:

- **عنوان**: نام کرافت
- **فاصله**: فاصله به km با یک رقم اعشار (اگر `distanceMeters` موجود باشد)

**مثال**: `"خاتم‌کاری (2.3 km)"`

### 2️⃣ Pick on Map Mode

وقتی `selectingLocation={true}` باشد:

- روی click‌های نقشه، مختصات `{lat, lng}` دریافت می‌شود
- اگر درون ایران بود، marker نمایش می‌شود
- `onMapClick()` callback فراخوانی می‌شود (والد component)

### 3️⃣ Styled Zoom Controls

- کنترل‌های +/– (zoom in/out):
  - **Shape**: `rounded-full` (دایره‌ای)
  - **Style**: `bg-white shadow` (سفید با سایه)
  - **Position**: پایین راست (bottom-right) with 16px margin
  - **Hover**: shadow قوی‌تر + transition smooth

---

## تغییرات در Map.jsx

### 1. Tooltip برای Markers

**Before:**

```jsx
marker.bindPopup(popupContent);
// فقط popup، بدون tooltip
```

**After:**

```jsx
marker.bindPopup(popupContent);

// Add tooltip (hover text) with distance
let tooltipText = it.title || it.name || "";
if (it.distanceMeters && typeof it.distanceMeters === "number") {
  const distanceKm = (it.distanceMeters / 1000).toFixed(1);
  tooltipText += ` (${distanceKm} km)`;
}
marker.bindTooltip(tooltipText, {
  permanent: false, // فقط هنگام hover
  direction: "top", // بالای marker
  offset: [0, -10], // کمی بالا
});
```

**Popup Content بهبود:**

```jsx
let popupContent = `<div style="min-width:160px">...`;

// Add distance section if available
if (it.distanceMeters && typeof it.distanceMeters === "number") {
  const distanceKm = (it.distanceMeters / 1000).toFixed(1);
  popupContent += `<div style="font-size:11px;margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;color:#666">📍 ${distanceKm} کیلومتر</div>`;
}
popupContent += "</div>";
marker.bindPopup(popupContent);
```

### 2. Zoom Controls Styling

**CSS Injection** (تا `initMap()`):

```css
.leaflet-control-zoom {
  position: absolute !important;
  bottom: 16px; /* پایین */
  right: 16px; /* راست */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.leaflet-control-zoom-in,
.leaflet-control-zoom-out {
  width: 36px;
  height: 36px;
  background: white !important;
  border: none !important;
  border-radius: 9999px !important; /* دایره */
  font-size: 16px;
  font-weight: bold;
  color: #1f2937 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.leaflet-control-zoom-in:hover,
.leaflet-control-zoom-out:hover {
  background: white !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.leaflet-control-zoom-in {
  margin-bottom: 8px; /* فاصله بین + و – */
}
```

### 3. Zoom Control Position

```jsx
const map = L.map(containerRef.current, {
  zoomControl: true, // فعال
}).setView(startCenter, c ? 13 : 6);

// Position zoom controls to bottom-right
map.zoomControl.setPosition("bottomright");
```

### 4. Pick on Map Mode

**map.on("click") handler** (موجود):

```jsx
const handleMapClick = (e) => {
  if (selectingLocation && onMapClick) {
    onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
  }
};

map.on("click", handleMapClick);
```

**Parent component** (Home.jsx) مراقبت می‌کند:

```jsx
// مود فعال شده
const [selectingLocation, setSelectingLocation] = useState(false);

// مختصات انتخاب شده
const [manualSelectedPos, setManualSelectedPos] = useState(null);

// Map click handler
const handleMapClick = (coords) => {
  if (!selectingLocation || !coords) return;

  // اگر درون ایران
  if (isInIran(coords.lat, coords.lng)) {
    setManualSelectedPos(coords);
    setManualError(null);
  } else {
    setManualError("مختصات خارج از ایران است");
  }
};

// Props به Map
<Map
  onMapClick={handleMapClick}
  selectingLocation={selectingLocation}
  selectedPos={manualSelectedPos}
/>;
```

---

## UX Flow

### Marker Interaction

```
User hovers over marker
    ↓
Tooltip appears (top direction)
    ↓
Tooltip text: "خاتم‌کاری (2.3 km)"
    ↓
User clicks marker
    ↓
Popup opens (detailed info)
    ↓
Popup shows:
  - Title: "خاتم‌کاری"
  - Location: "اصفهان"
  - Distance: "📍 2.3 کیلومتر"
```

### Pick on Map Mode

```
User clicks "انتخاب روی نقشه"
    ↓
selectingLocation = true
    ↓
User clicks on map
    ↓
Coordinates captured
    ↓
Inside Iran? ✓
    ↓
safeUserPos updated
    ↓
Yellow marker shown on map
    ↓
Mode disabled (optional)
```

### Zoom Controls

```
User hovers over + button
    ↓
Shadow elevates (0 4px 12px)
    ↓
User clicks
    ↓
Map zooms in (smooth animation)
    ↓
Normal shadow returns
```

---

## Data Structure

### Items Format (with distance)

```jsx
{
  id: "1",
  title: "خاتم‌کاری",
  name: "optional",
  location: "اصفهان",
  lat: 32.6539,
  lng: 51.6694,
  distanceMeters: 2300,  // ← اگر موجود باشد
  image: "url",
}
```

### Distance Conversion

```jsx
// distanceMeters → km (1 decimal place)
const distanceKm = (it.distanceMeters / 1000).toFixed(1);
// 2300 → "2.3"
// 1500 → "1.5"
// 1234 → "1.2"
```

---

## Tailwind Integration

**Zoom Controls** (CSS override از طریق Leaflet classes):

- `rounded-full` → `border-radius: 9999px`
- `bg-white` → `background: white`
- `shadow` → `box-shadow: 0 2px 8px rgba(...)`
- `hover:shadow-lg` → `box-shadow: 0 4px 12px rgba(...)`

**نکته**: Leaflet `!important` استفاده می‌کند، پس CSS injects شد

---

## Markers Color

### Default Markers (items)

```css
background: #dc2626  /* Red */
border: 2px solid white
border-radius: 50%
```

### Selected Marker (pick mode)

```css
background: #f59e0b  /* Amber/Orange */
border: 2px solid white
border-radius: 7px (pill)
```

### User Marker (current position)

```css
background: #2563eb  /* Blue with pulse */
animation: pulseMapMarker
```

---

## Accessibility

✅ **Keyboard Navigation:**

- Zoom buttons (+ and –) are accessible
- Tab through interactive elements

✅ **Screen Readers:**

- Tooltips provide additional context
- Popup content semantic HTML

✅ **Color Contrast:**

- White buttons on map background
- Dark text for readability

---

## Performance

✅ **Optimizations:**

- Tooltips lazy-loaded (not permanent)
- CSS injected once (getElementById check)
- Distance calculation only if `distanceMeters` exists
- No re-renders on hover

---

## Build Status ✅

```
Build: SUCCESS
Time: 2.39s
Modules: 134
CSS: 55.03 kB
JS: 550.93 kB
Errors: 0
```

---

## Acceptance Criteria ✅

- [x] Tooltip روی مارکرها با فاصله (km, 1 decimal)
- [x] Pick on Map mode: onClick مختصات دریافت
- [x] isInIran validation (Home.jsx)
- [x] Zoom controls styled (rounded-full, bg-white, shadow)
- [x] Zoom controls positioned bottom-right (16px margin)
- [x] Smooth hover transition
- [x] Popup content شامل فاصله
- [x] UX تمیز و تدریجی
- [x] بدون performance issues
- [x] Build موفق ✓

---

## فایل‌های تغییر یافته

```
frontend/src/components/
  Map.jsx
    ├─ Lines 156: Zoom control CSS injection
    ├─ Lines 110-114: map.zoomControl.setPosition
    ├─ Lines 186-210: Tooltip + Distance popup
    └─ Lines 141-150: Pick on map handler (موجود)

frontend/src/pages/
  Home.jsx
    ├─ handleMapClick() function
    ├─ selectingLocation state
    ├─ manualSelectedPos state
    ├─ onMapClick prop pass
    └─ selectedPos prop pass
```

---

## نکات توسعه

### اگر می‌خواهی tooltip direction تغییر دهی:

```jsx
marker.bindTooltip(tooltipText, {
  direction: "top", // "top", "bottom", "left", "right"
  offset: [0, -10],
});
```

### اگر می‌خواهی distance format تغییر دهی:

```jsx
// km با 2 رقم اعشار:
const distanceKm = (it.distanceMeters / 1000).toFixed(2);

// یا meter اگر کمتر از 1 km:
const distanceText =
  it.distanceMeters < 1000
    ? `${it.distanceMeters} m`
    : `${(it.distanceMeters / 1000).toFixed(1)} km`;
```

### اگر می‌خواهی zoom control colors تغییر دهی:

```css
.leaflet-control-zoom-in,
.leaflet-control-zoom-out {
  background: #fbbf24 !important; /* Amber */
  color: #1f2937 !important;
}
```

---

## خلاصه

✅ **Tooltips**: فاصله نمایش می‌شود هنگام hover  
✅ **Popups**: فاصله در popup detail نمایش می‌شود  
✅ **Pick Mode**: مختصات انتخاب بر روی نقشه  
✅ **Zoom Controls**: دایره‌ای، سفید، سایهٔ دار، پایین راست  
✅ **Validation**: مختصات اگر درون ایران نباشد reject می‌شود  
✅ **Build**: موفقیت‌آمیز ✓

**وضعیت**: آماده برای استقرار
