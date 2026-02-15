# Geospatial API - Quick Reference

**Endpoint:** `GET /api/listings/near`  
**Purpose:** Find crafts near a geographical location  
**Status:** ✅ Production-Ready

---

## Quick Start

### Basic Usage

```bash
# Find crafts within 10km of Tehran center
curl "http://localhost:5000/api/listings/near?lng=51.389&lat=35.6892&radiusKm=10"
```

### Important: Coordinate Order

⚠️ **CRITICAL:** Always use `[longitude, latitude]` order!

```
✅ CORRECT: lng=51.389&lat=35.6892 (longitude first, latitude second)
❌ WRONG:   lng=35.6892&lat=51.389 (reversed - will be rejected)
```

**Memory trick:** Longitude = X-axis (comes first), Latitude = Y-axis (comes second)

---

## Parameters

| Parameter  | Type   | Required | Range/Values                        | Default  | Description                         |
| ---------- | ------ | -------- | ----------------------------------- | -------- | ----------------------------------- |
| `lng`      | number | No\*     | -180 to 180                         | -        | Longitude (required for geo search) |
| `lat`      | number | No\*     | -90 to 90                           | -        | Latitude (required for geo search)  |
| `radiusKm` | number | No       | 0.5 to 50                           | 10       | Search radius in kilometers         |
| `kind`     | string | No       | artwork, class, service             | -        | Filter by craft type                |
| `minPrice` | number | No       | ≥ 0                                 | -        | Minimum price in IRR                |
| `maxPrice` | number | No       | ≥ 0                                 | -        | Maximum price in IRR                |
| `q`        | string | No       | -                                   | -        | Text search query                   |
| `sort`     | string | No       | distance, -createdAt, price, -price | distance | Sort order                          |
| `page`     | number | No       | ≥ 1                                 | 1        | Page number                         |
| `limit`    | number | No       | 1 to 100                            | 20       | Results per page                    |

\* `lng` and `lat` are required together for geospatial search. If omitted, falls back to standard search.

---

## Response Format

### Successful Response

```json
{
  "items": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "سفال تهرانی",
      "description": "سفال دست‌ساز زیبا",
      "kind": "artwork",
      "price": 500000,
      "currency": "IRR",
      "location": {
        "city": "تهران",
        "neighborhood": "ونک",
        "coordinates": [51.389, 35.6892]
      },
      "distanceKm": "1.2",
      "distanceMeters": 1234,
      "author": {
        "_id": "...",
        "name": "استاد احمدی"
      },
      "createdAt": "2026-02-01T10:30:00.000Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "hasMore": false,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 10,
    "requestedRadiusKm": 10
  }
}
```

### Error Response

```json
{
  "message": "مختصات جغرافیایی نامعتبر است",
  "error": "lng must be between -180 and 180, lat must be between -90 and 90",
  "provided": {
    "lng": 200,
    "lat": 35.69
  }
}
```

---

## Examples

### 1. Basic Nearby Search

**Find all crafts within 5km:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=5
```

### 2. Filter by Type

**Find pottery classes within 15km:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=15&kind=class
```

### 3. Price Range Filter

**Find artworks 500k-2M IRR within 20km:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=20&kind=artwork&minPrice=500000&maxPrice=2000000
```

### 4. Text Search

**Find "سفال" (pottery) nearby:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=10&q=سفال
```

### 5. Pagination

**Get second page of results:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=10&page=2&limit=10
```

### 6. Sort by Creation Date

**Newest first within 10km:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=10&sort=-createdAt
```

### 7. Fallback (No Coordinates)

**Standard search without geolocation:**

```bash
GET /api/listings/near?kind=artwork&q=سفال
```

Response will have `"method": "standard"` instead of `"geospatial"`.

---

## Error Codes & Messages

### 400 Bad Request

#### Invalid Longitude

```json
{
  "message": "مختصات جغرافیایی نامعتبر است",
  "error": "lng must be between -180 and 180, lat must be between -90 and 90",
  "provided": { "lng": 200, "lat": 35.69 }
}
```

#### Reversed Coordinates

```json
{
  "message": "مختصات جغرافیایی به اشتباه وارد شده است",
  "error": "به نظر می‌رسد lng و lat جابجا شده‌اند",
  "hint": "Did you reverse lng and lat? Check your coordinate order."
}
```

#### Invalid Kind

```json
{
  "message": "نوع صنایع دستی نامعتبر است",
  "error": "kind must be one of: artwork, class, service"
}
```

#### Invalid Radius

```json
{
  "message": "شعاع جستجو نامعتبر است",
  "error": "radiusKm must be a positive number"
}
```

### 500 Internal Server Error

#### Missing Geospatial Index

```json
{
  "message": "خطا در پیکربندی جستجوی جغرافیایی",
  "error": "Geospatial index not configured. Please contact support."
}
```

---

## Automatic Limits

### Radius Capping

**Requested:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=1000
```

**Response includes:**

```json
{
  "search": {
    "radiusKm": 50,
    "requestedRadiusKm": 1000,
    "note": "Radius capped at 50km for performance"
  }
}
```

**Maximum radius:** 50km  
**Default radius:** 10km  
**Minimum radius:** 0.5km

### Pagination Limits

**Requested:**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892&limit=1000
```

**Response:**

```json
{
  "limit": 100
}
```

**Maximum per page:** 100 results

---

## Common Coordinates (Iran)

| City    | Longitude | Latitude | Example                    |
| ------- | --------- | -------- | -------------------------- |
| Tehran  | 51.389    | 35.6892  | `?lng=51.389&lat=35.6892`  |
| Isfahan | 51.6746   | 32.6546  | `?lng=51.6746&lat=32.6546` |
| Shiraz  | 52.5836   | 29.5918  | `?lng=52.5836&lat=29.5918` |
| Mashhad | 59.5656   | 36.2972  | `?lng=59.5656&lat=36.2972` |
| Tabriz  | 46.2919   | 38.0800  | `?lng=46.2919&lat=38.0800` |

---

## Testing

### Valid Query Test

```bash
curl -i "http://localhost:5000/api/listings/near?lng=51.389&lat=35.6892&radiusKm=5"
# Expected: 200 OK
```

### Invalid Query Test

```bash
curl -i "http://localhost:5000/api/listings/near?lng=200&lat=35.6892"
# Expected: 400 Bad Request
```

### Reversed Coordinates Test

```bash
curl -i "http://localhost:5000/api/listings/near?lng=35.6892&lat=151.389"
# Expected: 400 Bad Request with reversed coordinates error
```

---

## Frontend Integration

### JavaScript Example

```javascript
async function findNearbyCrafts(lng, lat, radiusKm = 10) {
  try {
    const params = new URLSearchParams({
      lng: lng.toString(),
      lat: lat.toString(),
      radiusKm: radiusKm.toString(),
    });

    const response = await fetch(`/api/listings/near?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error("Failed to fetch nearby crafts:", error);
    throw error;
  }
}

// Usage
const crafts = await findNearbyCrafts(51.389, 35.6892, 5);
console.log(`Found ${crafts.length} crafts nearby`);
```

### With Filters

```javascript
async function searchNearbyCrafts({
  lng,
  lat,
  radiusKm,
  kind,
  minPrice,
  maxPrice,
}) {
  const params = new URLSearchParams();

  if (lng !== undefined) params.append("lng", lng);
  if (lat !== undefined) params.append("lat", lat);
  if (radiusKm) params.append("radiusKm", radiusKm);
  if (kind) params.append("kind", kind);
  if (minPrice) params.append("minPrice", minPrice);
  if (maxPrice) params.append("maxPrice", maxPrice);

  const response = await fetch(`/api/listings/near?${params}`);
  return response.json();
}

// Usage
const artworks = await searchNearbyCrafts({
  lng: 51.389,
  lat: 35.6892,
  radiusKm: 10,
  kind: "artwork",
  minPrice: 500000,
  maxPrice: 2000000,
});
```

---

## Performance Characteristics

| Query Type           | Avg Response Time | Notes                       |
| -------------------- | ----------------- | --------------------------- |
| Geo search (< 10km)  | 50-100ms          | Uses 2dsphere index         |
| Geo search (10-50km) | 100-200ms         | More documents scanned      |
| With filters         | +20-50ms          | Compound index optimization |
| Text search          | +50-100ms         | Uses text index             |
| Standard (no geo)    | 150-300ms         | Collection scan             |

---

## Migration Notes

### From Old API

**Old (deprecated):**

```bash
GET /api/recipes/near?latitude=35.6892&longitude=51.389
```

**New (current):**

```bash
GET /api/listings/near?lng=51.389&lat=35.6892
```

**Changes:**

1. Endpoint: `/api/recipes` → `/api/listings` or `/api/crafts`
2. Parameters: `latitude`/`longitude` → `lat`/`lng`
3. **Order:** Old had `latitude` first, new has `lng` first

---

## Troubleshooting

### No Results Found

**Check:**

1. Coordinates are in Iran (lng: 44-63, lat: 25-40)
2. Radius is large enough (try 50km)
3. Filters aren't too restrictive
4. Database has published crafts with location data

### Error: "Geospatial index not configured"

**Solution:**

```bash
# Restart backend to auto-create indexes
docker-compose restart backend

# Or manually create index
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123 \
  -eval "use nakhsha; db.listings.createIndex({'location.geometry': '2dsphere'})"
```

### Coordinates Reversed Error

**Problem:** You're passing `lat` in `lng` parameter

**Solution:**

```bash
# Wrong
?lng=35.69&lat=51.42

# Correct
?lng=51.42&lat=35.69
```

---

## Support

**Documentation:** See [GEOSPATIAL_HARDENING_COMPLETE.md](GEOSPATIAL_HARDENING_COMPLETE.md)  
**Tests:** Run `npm test -- listings-near`  
**Issues:** Check backend logs for detailed error messages

---

**Last Updated:** February 15, 2026  
**API Version:** 1.0  
**Status:** Production-Ready ✅
