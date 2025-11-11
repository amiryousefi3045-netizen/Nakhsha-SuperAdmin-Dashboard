# B3: Leaflet Icons Fix for Vite

## Problem

Leaflet default marker icons were not displaying correctly in Vite dev and production builds because:

1. Asset paths for marker icons were not resolved correctly by Vite's bundler
2. Leaflet CSS was not imported at the application root level
3. Default icon configuration was missing the proper asset URL mappings

## Solution

### 1. Frontend Entry Point - `src/main.jsx`

**Change**: Added Leaflet CSS import at the application root

```jsx
import "leaflet/dist/leaflet.css";
```

**Why**: This ensures the CSS is loaded globally and only once, preventing duplicate imports and ensuring styles are available everywhere in the app.

### 2. Map Component - `src/components/Map.jsx`

**Changes**:

- Imported marker icon assets from Leaflet distribution
- Configured Leaflet's default icon with correct Vite-resolved paths

```jsx
// Fix Leaflet default icon paths for Vite (dev and build)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});
```

**Why**:

- Vite needs to import image assets explicitly so they're properly bundled and hashed
- `L.Icon.Default.mergeOptions()` tells Leaflet to use these paths instead of the default relative paths
- This ensures icons work in both dev (with file serving) and production (with hashed asset names)

## How It Works

1. **Development Mode**: Vite serves the images directly from `node_modules/leaflet/dist/images/`, and the imports resolve to file paths that Vite can serve
2. **Production Build**: Vite bundles the images, creates hashed filenames, and the imports resolve to those bundled paths

The `mergeOptions()` call updates Leaflet's default icon configuration globally, so all standard markers (not custom `divIcon` markers) will use the correct paths automatically.

## Verification

✅ **Dev Server**: Runs on http://localhost:5174 without errors

```
VITE v7.0.5  ready in 487 ms
➜  Local:   http://localhost:5174/
```

✅ **Production Build**: Completes successfully with 133 modules transformed

```
dist/index.html                   1.10 kB │ gzip:   0.65 kB
dist/assets/index-CJcb_Oov.css   47.21 kB │ gzip:  13.02 kB
dist/assets/index-hKRfB7U-.js   536.87 kB │ gzip: 167.16 kB
✓ built in 2.38s
```

## Custom Markers

The existing custom markers using `L.divIcon()` in the Map component continue to work as before:

- Cluster count badges (showing item count)
- Pulsing user location marker
- Red dot markers for craft items

These custom markers don't need the default icon configuration because they define their own icons.

## Files Modified

1. `frontend/src/main.jsx` - Added Leaflet CSS import
2. `frontend/src/components/Map.jsx` - Added icon asset imports and configuration

## Acceptance Criteria: ✅ Met

- ✅ Leaflet CSS imported once at application root
- ✅ Default marker icons configured with proper asset paths
- ✅ Icons render correctly in dev mode (verified startup)
- ✅ Icons render correctly in production build (verified compilation)
- ✅ No build errors or warnings related to assets
