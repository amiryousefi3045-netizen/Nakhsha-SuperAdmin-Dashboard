# Production-Grade Geospatial Map API — Complete Guide

## Overview

Nakhsha's geospatial API enables efficient, multi-filter proximity-based searches across listings using MongoDB's GeoJSON and 2dsphere indexes. Built with production-grade caching, validation, and performance optimization.

**Key Features:**

- ✅ Distance-based proximity queries ($geoNear aggregation)
- ✅ Advanced multi-filter support (category, type, status, price, text search, owner, rating)
- ✅ Lightweight marker payloads (~90% smaller than full documents)
- ✅ Redis caching with intelligent region-based invalidation
- ✅ Comprehensive query validation (Persian-language error messages)
- ✅ Pagination support with `hasMore` indicator
- ✅ Aggregation statistics endpoint
- ✅ Production-ready error handling and logging

---

## Core Endpoints

### 1. GET /api/listings/near — Find Nearby Listings

Primary endpoint for map-based discovery. Returns listings within a radius, sorted by distance, with optional filtering.

**Request:**

```http
GET /api/listings/near?lat=35.6892&lng=51.3890&radiusKm=5&limit=50&skip=0&category=pottery&type=post&status=published&minPrice=100&maxPrice=5000&minRating=4
```

**Query Parameters:**

| Parameter   | Type    | Required | Default   | Range                         | Description                                           |
| ----------- | ------- | -------- | --------- | ----------------------------- | ----------------------------------------------------- |
| `lat`       | number  | ✅       | —         | [-90, 90]                     | Latitude (عرض جغرافیایی)                              |
| `lng`       | number  | ✅       | —         | [-180, 180]                   | Longitude (طول جغرافیایی)                             |
| `radiusKm`  | number  | ❌       | 5         | [0.1, 50]                     | Search radius in kilometers                           |
| `limit`     | number  | ❌       | 100       | [1, 500]                      | Results per page                                      |
| `skip`      | number  | ❌       | 0         | ≥ 0                           | Pagination offset                                     |
| `category`  | string  | ❌       | —         | —                             | Filter by category (pottery, carpet, metalwork, etc.) |
| `type`      | string  | ❌       | —         | post\|tour\|training\|academy | Filter by listing type                                |
| `status`    | string  | ❌       | published | draft\|published\|archived    | Filter by status                                      |
| `minPrice`  | number  | ❌       | —         | ≥ 0                           | Minimum price (for post listings)                     |
| `maxPrice`  | number  | ❌       | —         | ≥ 0                           | Maximum price (for post listings)                     |
| `owner`     | string  | ❌       | —         | —                             | Filter by owner ID (admin/user-specific)              |
| `minRating` | number  | ❌       | —         | [0, 5]                        | Minimum rating filter                                 |
| `query`     | string  | ❌       | —         | max 200 chars                 | Text search query (title, description, tags)          |
| `verified`  | boolean | ❌       | —         | true\|false                   | Filter by verification status                         |
| `useCache`  | boolean | ❌       | true      | true\|false                   | Enable/disable Redis caching                          |

**Response (200 OK):**

```json
{
  "success": true,
  "reqId": "req_123abc",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "دستباف فارسی هاند میید - کرمان",
        "type": "post",
        "status": "published",
        "category": "carpet",
        "coordinates": [51.389, 35.6892],
        "city": "تهران",
        "province": "تهران",
        "location": "تهران، تهران",
        "distanceMeters": 2345,
        "distanceKm": 2.35,
        "preview": "https://api.nakhsha.ir/uploads/carpet-1.webp",
        "price": 350000,
        "rating": 4.8,
        "verified": true
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "title": "فیروزه کوبی بروجرد - اصل",
        "type": "post",
        "status": "published",
        "category": "metalwork",
        "coordinates": [51.3891, 35.6893],
        "city": "تهران",
        "province": "تهران",
        "location": "تهران، تهران",
        "distanceMeters": 3456,
        "distanceKm": 3.46,
        "preview": "https://api.nakhsha.ir/uploads/metalwork-1.webp",
        "price": 150000,
        "rating": 4.6,
        "verified": true
      }
    ],
    "meta": {
      "radiusKm": 5,
      "limit": 50,
      "skip": 0,
      "count": 2,
      "totalCount": 125,
      "hasMore": true,
      "executionTime": 145
    }
  }
}
```

**Response Fields:**

- `success`: Query succeeded (boolean)
- `data.items`: Array of marker DTOs
  - `id`: Listing MongoDB ID
  - `title`: Listing title (عنوان)
  - `type`: Listing type (post/tour/training/academy)
  - `status`: Current status (published/draft/archived)
  - `category`: Craft category (pottery/carpet/etc.)
  - `coordinates`: [longitude, latitude] per GeoJSON
  - `city`: City name (شهر)
  - `province`: Province name (استان)
  - `location`: Display location (formatted as "city, province")
  - `distanceMeters`: Distance in meters from query point
  - `distanceKm`: Distance in kilometers (rounded to 2 decimals)
  - `preview`: Absolute URL to first image (or null)
  - `price`: Price (post listings only, else null)
  - `rating`: Star rating 0–5 (or null)
  - `verified`: Artisan verification status (boolean)
- `data.meta`: Pagination and query metadata
  - `totalCount`: Total listings in radius (before pagination)
  - `hasMore`: Whether more results exist beyond current page
  - `executionTime`: Query execution time in milliseconds

**Error Response (400 Validation Error):**

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "خطای اعتبارسنجی پارامترها",
  "details": {
    "errors": [
      "عرض جغرافیایی (latitude) باید بین -۹۰ و ۹۰ باشد",
      "حداقل قیمت نباید بزرگتر از حداکثر قیمت باشد"
    ]
  },
  "reqId": "req_123abc"
}
```

---

### 2. GET /api/listings/near/stats — Statistics for Nearby Listings

Returns aggregated statistics about listings in a region (counts by type/category, price range, ratings, etc.).

**Request:**

```http
GET /api/listings/near/stats?lat=35.6892&lng=51.3890&radiusKm=5
```

**Query Parameters:** Same as `/api/listings/near` (coordinates + radius)

**Response (200 OK):**

```json
{
  "success": true,
  "stats": {
    "totalInRadius": 542,
    "byType": {
      "post": 380,
      "tour": 95,
      "training": 45,
      "academy": 22
    },
    "byCategory": {
      "pottery": 120,
      "carpet": 95,
      "metalwork": 78,
      "painting": 65,
      "textiles": 54,
      "jewelry": 40,
      "other": 90
    },
    "priceRange": {
      "min": 50000,
      "max": 5000000,
      "avg": 385000,
      "count": 380
    },
    "averageRating": 4.32,
    "verifiedCount": 410,
    "boundingBox": {
      "minLat": 35.65,
      "maxLat": 35.73,
      "minLng": 51.36,
      "maxLng": 51.42
    }
  },
  "reqId": "req_abc123"
}
```

---

## Code Examples

### JavaScript/Node.js (Fetch API)

**Basic nearby query:**

```javascript
const params = new URLSearchParams({
  lat: 35.6892,
  lng: 51.389,
  radiusKm: 5,
  limit: 50,
  category: "pottery",
});

const response = await fetch(`/api/listings/near?${params}`);
const result = await response.json();

if (result.success) {
  result.data.items.forEach((marker) => {
    console.log(`${marker.title} — ${marker.distanceKm} km`);
  });
} else {
  console.error("Error:", result.message);
  console.error("Details:", result.details);
}
```

**With all filters:**

```javascript
const params = new URLSearchParams({
  lat: 35.6892,
  lng: 51.389,
  radiusKm: 10,
  limit: 100,
  skip: 0,
  category: "carpet",
  type: "post",
  status: "published",
  minPrice: 200000,
  maxPrice: 1000000,
  minRating: 4,
  query: "دستباف",
  verified: "true",
});

const response = await fetch(`/api/listings/near?${params}`);
const data = await response.json();
```

**With pagination:**

```javascript
async function loadListingsByPage(lat, lng, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;

  const params = new URLSearchParams({
    lat,
    lng,
    radiusKm: 5,
    limit: pageSize,
    skip,
  });

  const response = await fetch(`/api/listings/near?${params}`);
  const result = await response.json();

  return {
    listings: result.data.items,
    page,
    hasMore: result.data.meta.hasMore,
    totalCount: result.data.meta.totalCount,
  };
}

// Usage
const page1 = await loadListingsByPage(35.6892, 51.389, 1, 50);
console.log(`Showing ${page1.listings.length} of ${page1.totalCount}`);

if (page1.hasMore) {
  const page2 = await loadListingsByPage(35.6892, 51.389, 2, 50);
}
```

**Text search:**

```javascript
const params = new URLSearchParams({
  lat: 35.6892,
  lng: 51.389,
  radiusKm: 15,
  query: "دستباف فارسی هاند میید",
  limit: 50,
});

const response = await fetch(`/api/listings/near?${params}`);
const results = await response.json();
// Results sorted by text relevance, then distance
```

### cURL Examples

**Basic nearby query:**

```bash
curl -X GET 'https://api.nakhsha.ir/api/listings/near?lat=35.6892&lng=51.3890&radiusKm=5&limit=50'
```

**With filters:**

```bash
curl -X GET 'https://api.nakhsha.ir/api/listings/near' \
  -G \
  --data-urlencode 'lat=35.6892' \
  --data-urlencode 'lng=51.3890' \
  --data-urlencode 'radiusKm=5' \
  --data-urlencode 'category=pottery' \
  --data-urlencode 'type=post' \
  --data-urlencode 'minPrice=100000' \
  --data-urlencode 'maxPrice=1000000' \
  --data-urlencode 'minRating=4' \
  --data-urlencode 'limit=50'
```

**Get statistics:**

```bash
curl -X GET 'https://api.nakhsha.ir/api/listings/near/stats' \
  -G \
  --data-urlencode 'lat=35.6892' \
  --data-urlencode 'lng=51.3890' \
  --data-urlencode 'radiusKm=5'
```

### Python Example

```python
import requests
from typing import List, Dict, Optional

def nearby_listings(
    lat: float,
    lng: float,
    radius_km: float = 5,
    limit: int = 100,
    skip: int = 0,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    query: Optional[str] = None,
    verified: Optional[bool] = None
) -> Dict:
    """Fetch nearby listings from Nakhsha API."""

    params = {
        'lat': lat,
        'lng': lng,
        'radiusKm': radius_km,
        'limit': limit,
        'skip': skip,
    }

    if category:
        params['category'] = category
    if min_price is not None:
        params['minPrice'] = min_price
    if max_price is not None:
        params['maxPrice'] = max_price
    if min_rating is not None:
        params['minRating'] = min_rating
    if query:
        params['query'] = query
    if verified is not None:
        params['verified'] = 'true' if verified else 'false'

    response = requests.get('https://api.nakhsha.ir/api/listings/near', params=params)
    return response.json()

# Usage
results = nearby_listings(
    lat=35.6892,
    lng=51.3890,
    radius_km=5,
    category='pottery',
    min_price=100000,
    max_price=1000000,
    verified=True
)

for item in results['data']['items']:
    print(f"{item['title']} — {item['distanceKm']}km, {item['price']:,}")
```

---

## Integration Patterns

### Frontend Map Integration (React/Leaflet)

```javascript
import { useEffect, useState } from "react";
import L from "leaflet";

function NearbyListingsMap() {
  const [listings, setListings] = useState([]);
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initialize map (Tehran center)
    const mapInstance = L.map("map").setView([35.6892, 51.389], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      mapInstance,
    );
    setMap(mapInstance);

    // Handle map move → fetch nearby
    mapInstance.on("moveend", handleMapMove);
  }, []);

  async function handleMapMove(e) {
    const center = map.getCenter();
    const zoomLevel = map.getZoom();
    const radiusKm = Math.max(1, 50 / Math.pow(2, zoomLevel - 10));

    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: center.lat,
        lng: center.lng,
        radiusKm,
        limit: 100,
        category: filters.category, // from your filter state
      });

      const response = await fetch(`/api/listings/near?${params}`);
      const result = await response.json();

      if (result.success) {
        displayMarkers(result.data.items);
        setListings(result.data.items);
      }
    } finally {
      setLoading(false);
    }
  }

  function displayMarkers(items) {
    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) layer.remove();
    });

    // Add new markers
    items.forEach((marker) => {
      if (!marker.coordinates) return;

      const [lng, lat] = marker.coordinates;
      const popup = `
        <div>
          <h3>${marker.title}</h3>
          <p>Distance: ${marker.distanceKm} km</p>
          <p>Price: ${marker.price?.toLocaleString("fa-IR")} تومان</p>
          <p>Rating: ${"⭐".repeat(Math.floor(marker.rating || 0))}</p>
        </div>
      `;

      L.marker([lat, lng]).addTo(map).bindPopup(popup);
    });
  }

  return <div id="map" style={{ height: "600px" }} />;
}

export default NearbyListingsMap;
```

### Caching Strategy

The API automatically caches results with a 5-minute TTL. Coordinates are rounded to 3 decimals (~111m accuracy) to maximize cache hits.

**Cache invalidation:**

- When a listing is **created**, nearby cache keys within 10km are NOT invalidated (new listing)
- When a listing is **updated** (location changes), old and new location caches are invalidated
- When a listing is **deleted**, cache for that region is invalidated
- Manual cache clear via admin endpoint (to be implemented)

**To disable caching for a query:**

```javascript
fetch("/api/listings/near?lat=35.6892&lng=51.3890&useCache=false");
```

---

## Performance Characteristics

**Typical Response Times (with indexes):**

- Cache hit: <50ms
- Cold query (100k listings, 10 results): 150–200ms
- With text search: 200–300ms
- Stats endpoint: 300–500ms

**Index Coverage:**

- `location.coordinates` (2dsphere) — sparse
- `location.coordinates` + `category` (compound)
- `location.coordinates` + `type` + `status` (compound)
- `location.coordinates` + `price` + `status` (compound)
- `title`, `description`, `tags` (full-text search)

---

## Error Handling

**Common Error Codes:**

| Code               | HTTP Status | Meaning                  |
| ------------------ | ----------- | ------------------------ |
| `VALIDATION_ERROR` | 400         | Invalid query parameters |
| `GEO_QUERY_ERROR`  | 400         | Geospatial query failed  |
| `GEO_INDEX_ERROR`  | 500         | 2dsphere index not found |
| `INTERNAL_ERROR`   | 500         | Server error             |

**Example Error Response:**

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "خطای اعتبارسنجی پارامترها",
  "details": {
    "errors": ["عرض جغرافیایی باید بین -۹۰ و ۹۰ درجه باشد"]
  },
  "reqId": "req_xyz789"
}
```

---

## Rate Limiting

Geospatial endpoints are rate-limited to **100 requests per minute** per IP address. Exceeding this returns HTTP 429 (Too Many Requests).

---

## Architecture

```
Request → GeoController → GeoValidator (validation)
                            ↓
                     CacheManager (check cache)
                            ↓
                    GeoService.findNearbyListings()
                            ↓
                   buildAggregationPipeline()
                            ↓
                   MongoDB $geoNear aggregation
                            ↓
                    toMarkerDTO() transformation
                            ↓
                   CacheManager (store result)
                            ↓
                     Response → Client
```

**Key layers:**

1. **GeoValidator** — Query parameter validation
2. **CacheManager** — Redis-based caching with region invalidation
3. **GeoService** — MongoDB aggregation pipeline + business logic
4. **GeoController** — HTTP request/response handling
5. **Route** — Express route with rate limiting

---

## Environment Configuration

```bash
# .env
REDIS_URL=redis://localhost:6379        # For caching (optional)
GEO_CACHE_TTL=300                       # Cache TTL in seconds
NODE_ENV=production
PUBLIC_BASE_URL=https://api.nakhsha.ir
```

---

## Future Enhancements

- [ ] Reverse geocoding (coordinates → address)
- [ ] Autocomplete for location search
- [ ] Route optimization (multiple destinations)
- [ ] Heatmap data endpoint
- [ ] Saved searches/alerts
- [ ] Export results (CSV, GeoJSON)
- [ ] WebSocket support for real-time updates

---

**Documentation Version:** 1.0  
**Last Updated:** May 2026  
**API Version:** v1
