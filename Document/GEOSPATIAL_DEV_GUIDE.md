# Geospatial API — Developer Quick Reference

## 🚀 Quick Start (5 minutes)

### Basic Query

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.3890&radiusKm=5"
```

### With Filters

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.3890&radiusKm=5&category=pottery&minPrice=100000&maxPrice=1000000&minRating=4"
```

### JavaScript

```javascript
const result = await fetch(
  "/api/listings/near?lat=35.6892&lng=51.3890&radiusKm=5",
).then((r) => r.json());

result.data.items.forEach((marker) => {
  console.log(`${marker.title} — ${marker.distanceKm}km`);
});
```

---

## 📁 File Locations

| Component    | File                                     |
| ------------ | ---------------------------------------- |
| Core Logic   | `backend/services/GeoService.js`         |
| HTTP Handler | `backend/controllers/GeoController.js`   |
| Validation   | `backend/utils/geoValidator.js`          |
| Caching      | `backend/utils/cacheManager.js`          |
| Routes       | `backend/routes/listings.near.js`        |
| Tests        | `backend/__tests__/GeoService.test.js`   |
| Tests        | `backend/__tests__/geoValidator.test.js` |

---

## 🔍 Query Parameters

```
lat             ✅ required   [-90, 90]
lng             ✅ required   [-180, 180]
radiusKm        ❌ default 5  [0.1, 50]
limit           ❌ default 100 [1, 500]
skip            ❌ default 0   ≥ 0
category        ❌ optional    string
type            ❌ optional    post|tour|training|academy
status          ❌ default published draft|published|archived
minPrice        ❌ optional    ≥ 0
maxPrice        ❌ optional    ≥ minPrice
owner           ❌ optional    ObjectId string
minRating       ❌ optional    [0, 5]
query           ❌ optional    max 200 chars (text search)
verified        ❌ optional    true|false
useCache        ❌ default true true|false
```

---

## 📊 Marker DTO Fields

```json
{
  "id": "507f1f77bcf86cd799439011",
  "title": "عنوان لیست",
  "type": "post",
  "status": "published",
  "category": "pottery",
  "coordinates": [51.389, 35.6892],
  "city": "تهران",
  "province": "تهران",
  "location": "تهران، تهران",
  "distanceMeters": 2345,
  "distanceKm": 2.35,
  "preview": "https://api.nakhsha.ir/uploads/...",
  "price": 350000,
  "rating": 4.8,
  "verified": true
}
```

---

## 🛠️ Integration Patterns

### Pagination

```javascript
for (let page = 0; page < maxPages; page++) {
  const params = new URLSearchParams({
    lat,
    lng,
    radiusKm: 5,
    limit: 50,
    skip: page * 50,
  });
  const result = await fetch(`/api/listings/near?${params}`).then((r) =>
    r.json(),
  );
  processItems(result.data.items);
  if (!result.data.meta.hasMore) break;
}
```

### Text Search

```javascript
const params = new URLSearchParams({
  lat: 35.6892,
  lng: 51.389,
  query: "دستباف فارسی",
  category: "carpet",
  minRating: 4,
});
const results = await fetch(`/api/listings/near?${params}`).then((r) =>
  r.json(),
);
```

### React Hook

```javascript
import { useState, useEffect } from "react";

function useNearbyListings(lat, lng, filters = {}) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ lat, lng, ...filters });
    fetch(`/api/listings/near?${params}`)
      .then((r) => r.json())
      .then((data) => setListings(data.data.items))
      .finally(() => setLoading(false));
  }, [lat, lng, JSON.stringify(filters)]);

  return { listings, loading };
}

// Usage
const { listings, loading } = useNearbyListings(35.6892, 51.389, {
  category: "pottery",
  minPrice: 100000,
});
```

---

## ⚡ Performance

| Scenario               | Time      |
| ---------------------- | --------- |
| Cache hit              | <50ms     |
| Cold query (100k docs) | 150-200ms |
| Text search            | 200-300ms |
| Stats endpoint         | 300-500ms |

**Tips:**

- Use specific `category` filters to reduce dataset
- Avoid large `radiusKm` values
- Text search is slower but sorted by relevance
- First query will be slower (cache miss), subsequent queries faster

---

## 🐛 Troubleshooting

**Slow queries:** Check if indexes exist

```javascript
db.listings.getIndexes();
// Should show: location_geo_idx, location_type_status_idx, etc.
```

**Disabled cache:** Add `?useCache=false` to bypass Redis

**Validation errors:** Check query parameters are within valid ranges

---

## 📚 Documentation Files

- `Document/GEOSPATIAL_API_DOCUMENTATION.md` — Full API reference
- `Document/GEOSPATIAL_IMPLEMENTATION_COMPLETE.md` — Implementation details
- `Document/GEOSPATIAL_QUICK_REFERENCE.md` — This file

---

**Version:** 1.0 | **Date:** May 2026
