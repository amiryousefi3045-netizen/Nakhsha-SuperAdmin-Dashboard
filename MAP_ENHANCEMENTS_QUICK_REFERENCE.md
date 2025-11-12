# Map Enhancements - Quick Reference 🗺️

## سه ویژگی اضافه شده

### 1️⃣ Tooltip با Distance

**کد:**

```jsx
let tooltipText = it.title || it.name || "";
if (it.distanceMeters && typeof it.distanceMeters === "number") {
  const distanceKm = (it.distanceMeters / 1000).toFixed(1);
  tooltipText += ` (${distanceKm} km)`;
}
marker.bindTooltip(tooltipText, {
  permanent: false,
  direction: "top",
  offset: [0, -10],
});
```

**Result**: Hover over marker → "خاتم‌کاری (2.3 km)"

---

### 2️⃣ Distance در Popup

**کد:**

```jsx
if (it.distanceMeters && typeof it.distanceMeters === "number") {
  const distanceKm = (it.distanceMeters / 1000).toFixed(1);
  popupContent += `<div style="...">📍 ${distanceKm} کیلومتر</div>`;
}
```

**Result**: Click marker → Popup shows distance

---

### 3️⃣ Zoom Controls Styled

**CSS:**

```css
.leaflet-control-zoom {
  position: absolute !important;
  bottom: 16px;
  right: 16px;
  background: transparent !important;
}

.leaflet-control-zoom-in,
.leaflet-control-zoom-out {
  width: 36px;
  height: 36px;
  background: white !important;
  border-radius: 9999px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
  transition: all 0.2s ease;
}

.leaflet-control-zoom-in:hover,
.leaflet-control-zoom-out:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.leaflet-control-zoom-in {
  margin-bottom: 8px;
}
```

**Setup:**

```jsx
map.zoomControl.setPosition("bottomright");
```

**Result**: Buttons bottom-right, rounded-full, white, shadow, hover effect ✓

---

### 4️⃣ Pick on Map Mode

**Parent (Home.jsx):**

```jsx
const [selectingLocation, setSelectingLocation] = useState(false);
const [manualSelectedPos, setManualSelectedPos] = useState(null);

const handleMapClick = (coords) => {
  if (!selectingLocation || !coords) return;
  if (isInIran(coords.lat, coords.lng)) {
    setManualSelectedPos(coords);
    setManualError(null);
  } else {
    setManualError("مختصات خارج از ایران است");
  }
};

<Map
  onMapClick={handleMapClick}
  selectingLocation={selectingLocation}
  selectedPos={manualSelectedPos}
/>;
```

**Map.jsx Handler (موجود):**

```jsx
const handleMapClick = (e) => {
  if (selectingLocation && onMapClick) {
    onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
  }
};
map.on("click", handleMapClick);
```

**Result**: Click "انتخاب روی نقشه" → Click map → Coordinates captured ✓

---

## فایل‌های تغییر یافته

**Map.jsx:**

- Lines 1: Remove unused useCallback
- Lines 78-91: CSS + Zoom control setup
- Lines 105-110: Zoom position
- Lines 141-150: Pick on map handler + dependencies
- Lines 186-210: Tooltip + Distance popup

**Home.jsx:** (موجود، تغییری نیافت)

---

## Build Status

```
✓ 134 modules
✓ 2.39s build
✓ 0 errors
```

---

## Acceptance ✅

- [x] Tooltip with distance (km, 1 decimal)
- [x] Popup with distance
- [x] Zoom controls styled & positioned
- [x] Pick on map mode working
- [x] Iran validation
- [x] Build successful

---

**Status**: ✅ Ready for Deployment
