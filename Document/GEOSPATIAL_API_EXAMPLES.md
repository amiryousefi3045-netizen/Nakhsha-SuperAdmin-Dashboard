# Geospatial API - Request/Response Examples

**Endpoint:** `GET /api/listings/near`  
**For:** Frontend developers integrating the nearby search feature

---

## Example 1: Basic Nearby Search

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=5
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef123",
      "title": "سفال تهرانی",
      "description": "سفال دست‌ساز با طرح‌های سنتی",
      "kind": "artwork",
      "price": 500000,
      "currency": "IRR",
      "forSale": true,
      "tags": ["سفال", "دکوراسیون", "هنر سنتی"],
      "location": {
        "city": "تهران",
        "neighborhood": "ونک",
        "coordinates": [51.389, 35.6892]
      },
      "distanceKm": "0.5",
      "distanceMeters": 523,
      "author": {
        "_id": "65c7f1234567890abcdef456",
        "name": "استاد احمدی"
      },
      "averageRating": "4.5",
      "totalLikes": 23,
      "createdAt": "2026-02-01T10:30:00.000Z"
    },
    {
      "_id": "65c7f1234567890abcdef124",
      "title": "کارگاه سفالگری",
      "description": "آموزش سفالگری از مبتدی تا پیشرفته",
      "kind": "class",
      "price": 1000000,
      "currency": "IRR",
      "schedule": {
        "date": "2026-03-15T14:00:00.000Z",
        "durationMinutes": 180,
        "seats": 10
      },
      "location": {
        "city": "تهران",
        "neighborhood": "نیاوران",
        "coordinates": [51.4, 35.7]
      },
      "distanceKm": "1.8",
      "distanceMeters": 1842,
      "author": {
        "_id": "65c7f1234567890abcdef789",
        "name": "خانم رضایی"
      },
      "averageRating": "5.0",
      "totalLikes": 45,
      "createdAt": "2026-02-10T08:15:00.000Z"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20,
  "hasMore": false,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 5,
    "requestedRadiusKm": 5
  }
}
```

---

## Example 2: Filtered Search (Kind + Price Range)

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=10&kind=artwork&minPrice=500000&maxPrice=2000000
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef125",
      "title": "فرش دست‌باف",
      "description": "فرش ابریشم با طرح اصفهانی",
      "kind": "artwork",
      "price": 1500000,
      "currency": "IRR",
      "forSale": true,
      "distanceKm": "3.2",
      "distanceMeters": 3214,
      "location": {
        "city": "تهران",
        "neighborhood": "سعادت‌آباد",
        "coordinates": [51.35, 35.71]
      },
      "author": {
        "_id": "65c7f1234567890abcdef999",
        "name": "استاد کریمی"
      },
      "createdAt": "2026-01-20T12:00:00.000Z"
    }
  ],
  "total": 1,
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

---

## Example 3: No Results Found

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=1&kind=class
```

### Response (200 OK)

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "hasMore": false,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 1,
    "requestedRadiusKm": 1
  }
}
```

**Backend log:**

```
[INFO] No nearby listings found {
  coordinates: [51.389, 35.6892],
  radiusKm: 1,
  filters: { isPublished: true, kind: 'class' }
}
```

---

## Example 4: Radius Capped to Maximum

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=1000
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef126",
      "title": "صنایع دستی سنتی",
      "distanceKm": "15.3",
      ...
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "hasMore": true,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 50,
    "requestedRadiusKm": 1000,
    "note": "Radius capped at 50km for performance"
  }
}
```

**Backend log:**

```
[WARN] Radius capped to maximum {
  requested: 1000,
  capped: 50
}
```

---

## Example 5: Invalid Longitude (Out of Range)

### Request

```http
GET /api/listings/near?lng=200&lat=35.6892
```

### Response (400 Bad Request)

```json
{
  "message": "مختصات جغرافیایی نامعتبر است",
  "error": "lng must be between -180 and 180, lat must be between -90 and 90",
  "provided": {
    "lng": 200,
    "lat": 35.6892
  }
}
```

---

## Example 6: Reversed Coordinates (Common Mistake)

### Request

```http
GET /api/listings/near?lng=35.6892&lat=151.389
```

### Response (400 Bad Request)

```json
{
  "message": "مختصات جغرافیایی به اشتباه وارد شده است",
  "error": "به نظر می‌رسد lng و lat جابجا شده‌اند. lng باید بین -180 تا 180 باشد، lat باید بین -90 تا 90 باشد",
  "hint": "Did you reverse lng and lat? Check your coordinate order."
}
```

---

## Example 7: Non-Numeric Coordinate

### Request

```http
GET /api/listings/near?lng=invalid&lat=35.6892
```

### Response (400 Bad Request)

```json
{
  "message": "مقدار lng نامعتبر است",
  "error": "lng must be a valid number"
}
```

---

## Example 8: Invalid Kind Filter

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&kind=invalid_type
```

### Response (400 Bad Request)

```json
{
  "message": "نوع صنایع دستی نامعتبر است",
  "error": "kind must be one of: artwork, class, service"
}
```

---

## Example 9: Negative Radius

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=-10
```

### Response (400 Bad Request)

```json
{
  "message": "شعاع جستجو نامعتبر است",
  "error": "radiusKm must be a positive number"
}
```

---

## Example 10: Negative Price Filter

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&minPrice=-100
```

### Response (400 Bad Request)

```json
{
  "message": "حداقل قیمت نامعتبر است",
  "error": "minPrice must be a non-negative number"
}
```

---

## Example 11: Fallback to Standard Search (No Coordinates)

### Request

```http
GET /api/listings/near?kind=artwork
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef127",
      "title": "سفال اصفهان",
      "kind": "artwork",
      "price": 800000,
      "location": {
        "city": "اصفهان",
        "coordinates": [51.6746, 32.6546]
      },
      "author": {
        "_id": "65c7f1234567890abcdef888",
        "name": "استاد موسوی"
      },
      "createdAt": "2026-02-05T09:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "hasMore": true,
  "search": {
    "method": "standard"
  }
}
```

**Note:** No `center`, `radiusKm`, or `distanceKm` fields since this is not geospatial search.

---

## Example 12: Pagination

### Request (Page 2)

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=20&page=2&limit=10
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef128",
      "title": "دوره آموزش قلم‌زنی",
      "kind": "class",
      "distanceKm": "12.5",
      ...
    }
  ],
  "total": 25,
  "page": 2,
  "limit": 10,
  "hasMore": true,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 20,
    "requestedRadiusKm": 20
  }
}
```

---

## Example 13: Text Search with Geolocation

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=15&q=سفال
```

### Response (200 OK)

```json
{
  "items": [
    {
      "_id": "65c7f1234567890abcdef129",
      "title": "سفال لعاب‌دار",
      "description": "سفال سنتی با لعاب رنگی",
      "tags": ["سفال", "لعاب", "هنر"],
      "distanceKm": "2.3",
      ...
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20,
  "hasMore": false,
  "search": {
    "method": "geospatial",
    "center": {
      "lng": 51.389,
      "lat": 35.6892
    },
    "radiusKm": 15,
    "requestedRadiusKm": 15
  }
}
```

---

## Example 14: Missing Geospatial Index (Server Error)

### Request

```http
GET /api/listings/near?lng=51.389&lat=35.6892&radiusKm=10
```

### Response (500 Internal Server Error)

```json
{
  "message": "خطا در پیکربندی جستجوی جغرافیایی",
  "error": "Geospatial index not configured. Please contact support."
}
```

**Backend log:**

```
[ERROR] CRITICAL: Missing 2dsphere index on location.geometry. Nearby search will fail!
```

**Solution:** Restart backend to auto-create indexes:

```bash
docker-compose restart backend
```

---

## Frontend Integration Code

### React Example

```jsx
import { useState, useEffect } from "react";

function NearbyListings({ userLocation }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchNearby() {
      if (!userLocation) return;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lng: userLocation.lng,
          lat: userLocation.lat,
          radiusKm: 10,
        });

        const response = await fetch(`/api/listings/near?${params}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to fetch listings");
        }

        const data = await response.json();
        setListings(data.items);
      } catch (err) {
        setError(err.message);
        console.error("Error fetching nearby listings:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchNearby();
  }, [userLocation]);

  if (loading) return <div>در حال بارگذاری...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="listings-grid">
      {listings.map((listing) => (
        <div key={listing._id} className="listing-card">
          <h3>{listing.title}</h3>
          <p>{listing.description}</p>
          <span className="distance">{listing.distanceKm} کیلومتر</span>
          <span className="price">
            {listing.price.toLocaleString("fa-IR")} ریال
          </span>
        </div>
      ))}
    </div>
  );
}
```

### Vue Example

```vue
<template>
  <div>
    <div v-if="loading">در حال بارگذاری...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="listings-grid">
      <div v-for="listing in listings" :key="listing._id" class="listing-card">
        <h3>{{ listing.title }}</h3>
        <p>{{ listing.description }}</p>
        <span class="distance">{{ listing.distanceKm }} کیلومتر</span>
        <span class="price">{{ formatPrice(listing.price) }} ریال</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: ["userLocation"],
  data() {
    return {
      listings: [],
      loading: false,
      error: null,
    };
  },
  watch: {
    userLocation: {
      immediate: true,
      async handler(location) {
        if (!location) return;

        this.loading = true;
        this.error = null;

        try {
          const params = new URLSearchParams({
            lng: location.lng,
            lat: location.lat,
            radiusKm: 10,
          });

          const response = await fetch(`/api/listings/near?${params}`);

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message);
          }

          const data = await response.json();
          this.listings = data.items;
        } catch (err) {
          this.error = err.message;
          console.error(err);
        } finally {
          this.loading = false;
        }
      },
    },
  },
  methods: {
    formatPrice(price) {
      return price.toLocaleString("fa-IR");
    },
  },
};
</script>
```

---

## Error Handling Best Practices

```javascript
async function searchNearby(lng, lat, options = {}) {
  try {
    const params = new URLSearchParams({
      lng: lng.toString(),
      lat: lat.toString(),
      radiusKm: options.radiusKm || 10,
    });

    if (options.kind) params.append("kind", options.kind);
    if (options.minPrice) params.append("minPrice", options.minPrice);
    if (options.maxPrice) params.append("maxPrice", options.maxPrice);

    const response = await fetch(`/api/listings/near?${params}`);
    const data = await response.json();

    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 400) {
        // Validation error - show user-friendly message
        if (data.hint) {
          // Reversed coordinates or other helpful hint
          throw new Error(`${data.message}\n${data.hint}`);
        }
        throw new Error(data.message);
      } else if (response.status === 500) {
        // Server error - notify support
        console.error("Server error:", data);
        throw new Error("خطای سرور. لطفاً با پشتیبانی تماس بگیرید");
      }
    }

    return data;
  } catch (error) {
    // Network error or other unexpected issues
    console.error("Search failed:", error);
    throw error;
  }
}
```

---

## Coordinate Validation (Client-Side)

```javascript
function validateCoordinates(lng, lat) {
  if (typeof lng !== "number" || typeof lat !== "number") {
    return { valid: false, error: "Coordinates must be numbers" };
  }

  if (isNaN(lng) || isNaN(lat)) {
    return { valid: false, error: "Coordinates cannot be NaN" };
  }

  if (lng < -180 || lng > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180" };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90" };
  }

  // Check for likely reversed coordinates
  if (Math.abs(lng) <= 90 && Math.abs(lat) > 90 && Math.abs(lat) <= 180) {
    return {
      valid: false,
      error:
        "Coordinates appear to be reversed. Did you mean lng=" +
        lat +
        ", lat=" +
        lng +
        "?",
    };
  }

  return { valid: true };
}

// Usage
const validation = validateCoordinates(userLng, userLat);
if (!validation.valid) {
  alert(validation.error);
  return;
}

// Proceed with API call
const results = await searchNearby(userLng, userLat);
```

---

**Last Updated:** February 15, 2026  
**For:** Frontend developers integrating geospatial search  
**See Also:** [GEOSPATIAL_API_QUICK_REFERENCE.md](GEOSPATIAL_API_QUICK_REFERENCE.md)
