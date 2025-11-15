# 🚀 Backend Geospatial Near Route - Quick Reference

## Status: ✅ COMPLETE & PRODUCTION-READY

No code changes needed. The endpoint is fully implemented and ready to use.

---

## 📍 Endpoint

```
GET /api/crafts/near?lng=LONGITUDE&lat=LATITUDE&radiusKm=KM&q=QUERY&category=TYPE&min=PRICE&max=PRICE
```

---

## 🎯 Quick Examples

### 1. Find crafts near me (10km default)

```bash
GET /api/crafts/near?lng=51.41&lat=35.73
```

### 2. Find pottery near Isfahan (15km)

```bash
GET /api/crafts/near?lng=51.67&lat=32.64&category=pottery&radiusKm=15
```

### 3. Find handwoven crafts (دستباف) within 20km

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&q=دستباف&radiusKm=20
```

### 4. Find affordable crafts (under 1M) nearby

```bash
GET /api/crafts/near?lng=51.41&lat=35.73&max=1000000
```

### 5. Search by text only (no location)

```bash
GET /api/crafts/near?q=سفالگری
```

---

## 📊 Response Example

```json
{
  "items": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "کوزه سفالی دست‌ساز",
      "description": "سفال سنتی یزدی",
      "craftType": "pottery",
      "price": 850000,
      "forSale": true,
      "images": ["url1", "url2"],
      "tags": ["سفال", "دست‌ساز"],
      "location": {
        "city": "تهران",
        "neighborhood": "جنت‌آباد",
        "coordinates": [51.41, 35.73]
      },
      "distanceMeters": 1234,
      "distanceKm": "1.2",
      "createdAt": "2024-11-11T12:00:00Z"
    }
  ]
}
```

---

## 🔧 Parameters

| Param      | Type   | Default | Notes                                                                          |
| ---------- | ------ | ------- | ------------------------------------------------------------------------------ |
| `lng`      | number | -       | Longitude (-180 to 180), required with lat                                     |
| `lat`      | number | -       | Latitude (-90 to 90), required with lng                                        |
| `radiusKm` | number | 10      | Search radius (1-100 km)                                                       |
| `q`        | string | -       | Text search in title/description                                               |
| `category` | string | -       | Filter: carpet\|pottery\|metalwork\|woodwork\|textile\|jewelry\|leather\|other |
| `min`      | number | -       | Minimum price (Tomans)                                                         |
| `max`      | number | -       | Maximum price (Tomans)                                                         |

---

## 🗺️ Features

- ✅ Geospatial queries using MongoDB $geoNear
- ✅ Full-text search with fallback to regex
- ✅ Price range filtering
- ✅ Category filtering
- ✅ Result limit: 100 items
- ✅ Distance in both meters and kilometers
- ✅ Sorted by distance (nearest first)

---

## 🔍 Technical Details

**Database Indexes:**

- `location.geometry` (2dsphere) - Geospatial
- `title`, `description`, `tags` (text) - Full-text search

**Query Strategy:**

- With coordinates → $geoNear aggregation (fast, accurate)
- Without coordinates → Standard find() with filters
- Text search → $text operator, or regex fallback

**Data Format:**

- Locations stored as GeoJSON Points
- Legacy `location.coordinates` automatically normalized

---

## 📱 Frontend Usage

```typescript
// From frontend/src/services/crafts.ts
export async function fetchCraftsNear({
  lng,
  lat,
  radiusKm = 10,
  q,
  category,
  min,
  max,
}): Promise<Craft[]> {
  // Calls: GET /api/crafts/near?lng=...&lat=...&...
}
```

---

## 🧪 Testing

```bash
# Run backend test script
cd backend
node scripts/test-near.js

# Or with custom API URL
API_URL=http://api.example.com:5000/api node scripts/test-near.js
```

---

## ⚡ Performance

| Query Type      | Performance          |
| --------------- | -------------------- |
| Geo search      | Excellent (O(log n)) |
| Text search     | Good (with index)    |
| Category filter | Excellent            |
| Price range     | Excellent            |
| Combined        | Good                 |

**Tips:**

- Always provide coordinates for fastest queries
- Combine filters to reduce result set
- Default radius 10km is typical for city searches

---

## 📚 Documentation

- `BACKEND_GEOSPATIAL_IMPLEMENTATION.md` - Full technical docs
- `BACKEND_GEOSPATIAL_COMPLETE.md` - Summary & API reference
- `BACKEND_VERIFICATION_CHECKLIST.md` - Implementation checklist

---

## ✨ Status

- Code: ✅ Complete
- Tests: ✅ Ready
- Documentation: ✅ Complete
- Production: ✅ Ready

**No changes needed - ready to use!**
