# Backend Geospatial Near Route Implementation

## Status: ✅ COMPLETE

The `/api/crafts/near` endpoint is fully implemented with all requested features.

---

## 📋 Implementation Summary

### 1. Data Model (`backend/models/Craft.js`)

**Location Schema:**

```javascript
location: {
  city: String,
  neighborhood: String,
  geometry: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat]
  }
}
```

**Indexes:**

- ✅ `index({ "location.geometry": "2dsphere" })` - Geospatial queries
- ✅ `index({ title: "text", description: "text", tags: "text" })` - Full-text search
- Automatic index creation via `ensureIndexes()` static method

**Backward Compatibility:**

- Pre-save hook normalizes legacy `location.coordinates` → `location.geometry`
- toJSON transform exposes coordinates at root for API consumers

---

### 2. Validation Schema (`backend/middlewares/validate.js`)

**Query Parameters** (all optional except refine rule):

```javascript
- lng: number [-180, 180]
- lat: number [-90, 90]
- radiusKm: number > 0 (default: 10)
- q: string (text search)
- category: enum (carpet|pottery|metalwork|woodwork|textile|jewelry|leather|other)
- min: number >= 0 (minimum price)
- max: number >= 0 (maximum price)

Refine: lng and lat must both be present or both absent
```

---

### 3. Route Handler (`backend/routes/crafts.js`)

**Endpoint:** `GET /api/crafts/near`

#### Query Processing

```javascript
// Base query
const query = { isPublished: true };

// Category filter
if (category) query.craftType = category;

// Price range filter
if (min || max) {
  query.price = {};
  if (min) query.price.$gte = parseFloat(min);
  if (max) query.price.$lte = parseFloat(max);
}

// Text search with fallback
if (q) {
  // Try text index first
  if (hasTextIndex) query.$text = { $search: q };
  // Fallback to regex
  else
    query.$or = [
      { title: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
}
```

#### Geospatial Aggregation (when valid lng/lat provided)

```javascript
pipeline = [
  {
    $geoNear: {
      near: { type: "Point", coordinates: [lng, lat] },
      key: "location.geometry",
      distanceField: "distanceMeters",
      spherical: true,
      maxDistance: radiusKm * 1000,  // meters
      query: { ...filters }
    }
  },
  { $sort: { distanceMeters: 1 } },
  { $limit: 100 },
  { $project: { ... } }
]
```

#### Response Format

**With Geospatial Search:**

```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "description": "...",
      "images": [...],
      "craftType": "pottery",
      "price": 850000,
      "forSale": true,
      "location": { "city": "تهران", "neighborhood": "جنت‌آباد", "geometry": {...} },
      "tags": [...],
      "distanceMeters": 1250,
      "distanceKm": "1.2",
      "createdAt": "2024-11-11T12:00:00Z"
    }
  ]
}
```

**Without Coordinates (Fallback):**

```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "description": "...",
      "images": [...],
      "craftType": "pottery",
      "price": 850000,
      "forSale": true,
      "location": { "city": "تهران", "neighborhood": "...", "geometry": {...} },
      "tags": [...],
      "createdAt": "2024-11-11T12:00:00Z"
    }
  ]
}
```

---

## 🔍 Query Examples

### 1. Crafts within 5km of user location

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&radiusKm=5
```

### 2. Pottery within 10km, max price 1M

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&category=pottery&max=1000000
```

### 3. Search for "دستباف" (handwoven) within 15km

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&radiusKm=15&q=دستباف
```

### 4. Crafts priced 500k-1.5M within 20km

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&radiusKm=20&min=500000&max=1500000
```

### 5. No location (fallback to published crafts sorted by date)

```bash
GET /api/crafts/near?q=سفال
```

---

## ⚙️ Configuration

**Defaults:**

- `radiusKm`: 10 (km)
- Max radius: 100 (km)
- Min radius: 1 (km)
- Result limit: 100 items
- Sort: `distanceMeters ASC` (when geo), `createdAt DESC` (fallback)

**Constraints:**

- Coordinates must be valid (±180 lng, ±90 lat)
- Both lng and lat required together
- Price filters are optional
- Text search is optional

---

## 📊 Performance

**Indexes:**

- Geospatial: `location.geometry` (2dsphere) - O(log n) geo queries
- Text search: `title`, `description`, `tags` (weighted) - Full-text optimization
- Author: `author`, `isPublished` - Quick filtering

**Query Strategy:**

- Use geospatial aggregation when coordinates provided (efficient with 2dsphere index)
- Fallback to standard find() when no location (still benefits from text/filter indexes)
- Limit results to 100 max
- Use `$project` to select only needed fields

---

## 🔄 Integration Points

### Frontend (`frontend/src/services/crafts.ts`)

```typescript
export async function fetchCraftsNear({
  lng,
  lat,
  radiusKm,
  q,
  category,
  min,
  max,
}): Promise<Craft[]>;

// Calls: GET /api/crafts/near?lng=...&lat=...&...
```

### Mapping Display

- Use `distanceMeters` / `distanceKm` to show distance to user
- Use `location.coordinates` for marker placement
- Sort by distance in UI if backend not providing ordered results

---

## ✅ Verification Checklist

- [x] GeoJSON location with Point type
- [x] 2dsphere index for geospatial queries
- [x] Text search index with weights
- [x] $geoNear aggregation with distanceField
- [x] spherical: true for Earth-accurate distances
- [x] maxDistance in meters (radiusKm \* 1000)
- [x] Optional filters: category, price range, text search
- [x] Sort by distance (geo) or createdAt (fallback)
- [x] Result limit: 100
- [x] Fallback to regular search when no coordinates
- [x] Proper validation schema
- [x] Distance returned in response (distanceMeters, distanceKm)

---

## 📝 Notes

1. **Distance in Meters**: MongoDB's `$geoNear` returns distance in meters. Divided by 1000 for `distanceKm` display.
2. **Radius Clamping**: Input radiusKm is clamped to [1, 100] to prevent excessive queries.
3. **Text Index Fallback**: If text index doesn't exist, regex search on title/description is used (slower but safe).
4. **Backward Compatibility**: Legacy `location.coordinates` is supported and normalized to GeoJSON internally.
5. **Result Ordering**: Always sorted by distance (geo) or createdAt (non-geo) in backend for consistent UI display.

---

## 🚀 Ready for Production

This implementation is production-ready and handles:

- ✅ Geospatial queries with proper indexing
- ✅ Full-text search with fallback
- ✅ Flexible filtering (price, category, text)
- ✅ Input validation
- ✅ Error handling
- ✅ Performance optimization

No additional changes needed.
