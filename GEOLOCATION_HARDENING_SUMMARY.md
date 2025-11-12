# نخشا - Geolocation Hardening Summary

**Date:** November 12, 2025  
**Branch:** ts-baseline

## Overview

A comprehensive geolocation and map-centering hardening for the Nakhsha platform, focused on:

- **Iran-only map centering**: Only valid GPS coordinates inside Iran's bounding box (lat 25-40, lng 44-64) update the safe position used for centering.
- **Opt-in IP fallback**: No automatic IP-based geolocation on mount. IP fallback only when user explicitly clicks "موقعیت من" (My Location).
- **Google 403 detection**: Detects when Google's geolocation provider is blocked (403 error) and offers alternative workflows.
- **Manual map selection**: If geolocation fails, users can click on the map to manually select their location.
- **Persistent storage**: Last valid Iran-only coords stored in `localStorage['geo.ir.good']`.

---

## Changes Made

### 1. **frontend/src/hooks/useGeolocation.js** — Core Geolocation Hook

- **GPS Timeout**: Increased from 8000ms to 15000ms for slower networks.
- **Iran Detection**: Added `isInIran(lat, lng)` helper — returns true only if 25 ≤ lat ≤ 40 and 44 ≤ lng ≤ 64.
- **Coordinate Clamping**: Added `clampIran(lat, lng)` to clamp coordinates to Iran's bounding box.
- **Safe Position Storage**:
  - Only GPS coordinates inside Iran update the persistent `lastIranGood` state.
  - Last Iran-only coords stored in `localStorage['geo.ir.good']` as JSON.
  - IP-fallback results never update the safe position.
- **Provider Blocking Detection**:
  - Added `providerBlocked` state flag.
  - Detects if error message includes "403", "www.googleapis.com", or "Returned error code 403".
  - Stores detailed error in `geoError` state for UI diagnostics.
- **Opt-in IP Fallback**:
  - `getPosition(allowIpFallback = false)` — default prevents auto-IP fallback.
  - On mount: calls `getPosition(false)` (GPS only).
  - Manual "موقعیت من" button: calls `getPosition(true)` (allows IP fallback).
- **Hook Return Shape**:
  ```javascript
  {
    position, // Current position (GPS or IP)
      error, // General error message
      loading, // Loading state
      getPosition, // Function to request position with optional IP fallback
      usedIpFallback, // Boolean: was IP fallback used for current position?
      lastIranGood, // Last known good Iran-only coords
      providerBlocked, // Boolean: was geolocation provider blocked?
      geoError; // Detailed error message (e.g., "سرویس Google... (403)")
  }
  ```

---

### 2. **frontend/src/pages/Home.jsx** — Enhanced Map and UI

- **Hook Destructuring**: Now extracts `providerBlocked` and passes it to error UI logic.
- **userPos Filtering**: Excludes IP-fallback positions:
  ```javascript
  const userPos = useMemo(() => {
    if (!position?.coords) return null;
    if (usedIpFallback) return null; // Never center from IP
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  }, [position, usedIpFallback]);
  ```
- **safeUserPos**: Only set when `userPos` is inside Iran bounding box.
- **Enhanced Error Banner**:
  - Shows when `providerBlocked === true` or `geoError` includes "403".
  - Persian message: "سرویس شبکه‌ای موقعیت در این مرورگر قابل دسترس نیست" (Network geolocation service is not available in this browser).
  - Suggests Firefox or Safari.
  - Offers "انتخاب دستی روی نقشه" (Manual Selection on Map) button.
- **Manual Location Selection**:
  - `selectingLocation` state: toggles when user clicks the manual selection button.
  - On map click (when `selectingLocation === true`), the clicked coordinates are treated as `userPos`.
  - `safeUserPos` filters the result: only Iran coords will center the map and update sort.
- **Map Props Updated**:
  - Added `onMapClick` callback to Map component.
  - Added `selectingLocation` prop to enable click handlers.
  - Wired to `handleMapClick()` function.

---

### 3. **frontend/src/components/Map.jsx** — Map Component

- **New Props**:
  - `onMapClick`: Callback fired when map is clicked during location selection.
  - `selectingLocation`: Boolean flag to enable/disable click-to-select mode.
- **Click Handler**:
  - When `selectingLocation === true` and user clicks the map, `onMapClick({ lat, lng })` is called.
  - When `selectingLocation === false`, clicks are ignored for geolocation (normal map navigation).
- **Usage**:
  ```jsx
  <Map
    center={safeUserPos}
    items={items}
    showMyLocationButton
    onLocate={() => getPosition(true)}
    onMapClick={handleMapClick}
    selectingLocation={selectingLocation}
    onMoveEnd={({ bounds }) => {
      /* ... */
    }}
  />
  ```

---

## Behavior Flow

### Scenario 1: GPS Inside Iran ✅

1. User clicks "موقعیت من" → `getPosition(true)` called.
2. Browser GPS prompt appears.
3. User accepts → GPS returns coords inside Iran.
4. Hook detects Iran location, clamps it, and sets:
   - `position` = GPS coords
   - `usedIpFallback = false`
   - `lastIranGood` = clamped coords → persisted to localStorage
5. `userPos` = GPS coords (since not IP fallback)
6. `safeUserPos` = coords (since inside Iran)
7. **Map recenters** to `safeUserPos`; sort changes to "نزدیک‌ترین"

### Scenario 2: GPS Outside Iran ⚠️

1. Same as above, but GPS returns coords outside Iran (e.g., Turkey).
2. Hook returns raw GPS in `position` but does NOT update `lastIranGood`.
3. `userPos` = GPS coords
4. `safeUserPos` = null (not in Iran)
5. **Map does NOT recenter**

### Scenario 3: GPS Denied, IP Fallback Allowed 📍

1. User clicks "موقعیت من" → `getPosition(true)`.
2. Browser GPS prompt → user denies or times out.
3. Hook attempts IP-based services (ipwho.is, nowapi.ir).
4. IP service returns coords (often coarse, e.g., ISP location).
5. Hook sets:
   - `position` = IP coords
   - `usedIpFallback = true`
   - `lastIranGood` = NOT updated (IP results don't persist)
6. `userPos` = null (IP fallback ignored)
7. **Map does NOT recenter**; yellow badge "موقعیت تقریبی (IP)" shown as FYI

### Scenario 4: Google Provider Blocked (403) ❌

1. User clicks "موقعیت من" → `getPosition(true)`.
2. Browser returns error with message including "403" or "googleapis.com".
3. Hook detects this and sets:
   - `providerBlocked = true`
   - `geoError` = "سرویس Google برای موقعیت‌یابی مسدود است (403)"
4. Error banner appears with browser suggestions (Firefox/Safari).
5. User clicks "انتخاب دستی روی نقشه" button.
6. `selectingLocation = true` → user clicks on map.
7. `handleMapClick()` triggered with clicked coords.
8. If clicked coords are inside Iran, `safeUserPos` updates and map recenters.

### Scenario 5: No Location at All (On Mount) 🗺️

1. App loads → `useGeolocation()` hook mount calls `getPosition(false)` (no IP fallback).
2. GPS attempt times out or user hasn't prompted yet.
3. No IP fallback because `allowIpFallback = false`.
4. `position` = null, `userPos` = null, `safeUserPos` = null
5. **Map shows default center** (Iran center: lat 32.4279, lng 53.688)
6. No errors shown (silent degradation)

---

## Error Messages (Persian)

| Condition          | Message                                                       | Action                                      |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------- |
| Google 403 Blocked | "سرویس Google برای موقعیت‌یابی مسدود است (403)"               | Show error banner + manual selection button |
| Network Error      | "پیدا کردن موقعیت ممکن نشد (GPS و سرویس‌های IP ناموفق بودند)" | Show red error banner                       |
| GPS Timeout        | "GPS ناموفق بود"                                              | Offer IP fallback or manual selection       |
| Approx IP Location | "موقعیت تقریبی (IP)"                                          | Yellow badge (FYI, does not center map)     |

---

## Testing Checklist

- [ ] **Desktop**: Click "موقعیت من", accept GPS with coords inside Iran → map recenters, distance sort applied
- [ ] **Desktop**: Accept GPS with coords outside Iran → map does NOT recenter
- [ ] **Desktop**: Deny GPS, IP fallback succeeds → yellow badge shown, map does NOT recenter
- [ ] **Desktop**: Simulate Google 403 in DevTools → error banner with browser suggestion + manual selection button
- [ ] **Mobile**: Same checks as desktop (responsive map view)
- [ ] **Manual Selection**: Click error button → map becomes clickable → click location → if Iran, map recenters
- [ ] **LocalStorage**: After successful GPS in Iran, check `localStorage['geo.ir.good']` contains clamped coords
- [ ] **Network Tab**: Verify queries include bracketed params (`bounds[north]=...`, `filters[city]=...`)

---

## Browser Compatibility Notes

- **Chrome/Edge**: May use Google's geolocation API (can be blocked by 403 error).
- **Firefox/Safari**: Use system geolocation or fall back to coarse IP-based services.
- **Private/Incognito**: LocalStorage may not work (graceful fallback).

---

## Files Modified

1. `frontend/src/hooks/useGeolocation.js` — Core hook hardening
2. `frontend/src/pages/Home.jsx` — Enhanced UI and error handling
3. `frontend/src/components/Map.jsx` — Manual selection support

---

## Development Notes

- All changes are backward compatible (safeUserPos logic is additive).
- No breaking changes to API or backend.
- IP fallback is fully opt-in and transparent to the user.
- Errors are non-blocking and logged to console for debugging.

---

Generated: November 12, 2025  
Project: نخشا (Nakhsha)  
Branch: ts-baseline
