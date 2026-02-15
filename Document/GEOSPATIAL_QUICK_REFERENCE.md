# Geospatial API Quick Reference

## 📍 Coordinate Format

### Always Use GeoJSON Point

```javascript
{
  type: "Point",
  coordinates: [longitude, latitude]  // ⚠️ ORDER MATTERS: [lng, lat]
}
```

### Valid Ranges

- **Longitude**: `-180` to `180` (West to East)
- **Latitude**: `-90` to `90` (South to North)

## 🗂️ Model Schemas

### Location Field Structure

```javascript
location: {
  city: String,                    // e.g., "تهران"
  neighborhood: String,            // e.g., "ولنجک"
  geometry: {
    type: "Point",
    coordinates: [Number, Number]  // [lng, lat]
  }
}
```

### Indexes

All models have 2dsphere index on `location.geometry`:

```javascript
{ "location.geometry": "2dsphere" }
```

## 🔧 Using Geospatial Utilities

### Import

```javascript
const {
  isValidCoordinates,
  normalizeLocation,
  extractCoordinates,
  createGeoJSONPoint,
} = require("../utils/geospatial");
```

### Validate Coordinates

```javascript
if (isValidCoordinates(lng, lat)) {
  // Coordinates are valid
}
```

### Normalize Location (accepts multiple formats)

```javascript
const normalized = normalizeLocation({
  city: "تهران",
  coordinates: [51.4, 35.7], // or {lng: 51.4, lat: 35.7}
});

// Result:
// {
//   city: "تهران",
//   neighborhood: "",
//   geometry: {
//     type: "Point",
//     coordinates: [51.4, 35.7]
//   }
// }
```

## 📝 Creating Documents

### Craft

```javascript
const craft = await Craft.create({
  title: "گلیم دست‌باف",
  description: "...",
  location: {
    city: "کاشان",
    geometry: {
      type: "Point",
      coordinates: [51.439, 33.9831],
    },
  },
});
```

### Post

```javascript
const post = await Post.create({
  title: "پست جدید",
  description: "...",
  owner: userId,
  location: {
    city: "اصفهان",
    geometry: {
      type: "Point",
      coordinates: [51.668, 32.6546],
    },
  },
});
```

### User Location Update

```javascript
await User.findByIdAndUpdate(
  userId,
  {
    "location.city": "شیراز",
    "location.geometry": {
      type: "Point",
      coordinates: [52.5837, 29.5918],
    },
  },
  { runValidators: true },
);
```

## 🔍 Nearby Queries

### Using $geoNear (Aggregation)

```javascript
const results = await Craft.aggregate([
  {
    $geoNear: {
      near: {
        type: "Point",
        coordinates: [51.439, 33.9831], // [lng, lat]
      },
      key: "location.geometry",
      distanceField: "distanceMeters",
      maxDistance: 10000, // 10km in meters
      spherical: true,
      query: { isPublished: true },
    },
  },
]);
```

### Using $near (Find)

```javascript
const nearbyItems = await Craft.find({
  "location.geometry": {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [51.439, 33.9831],
      },
      $maxDistance: 10000, // meters
    },
  },
});
```

### Bounds Query (Rectangle)

```javascript
const { createBoundsQuery } = require('../utils/geospatial');

const boundsQuery = createBoundsQuery(
  north: 35.8,
  south: 35.6,
  east: 51.5,
  west: 51.3
);

const items = await Craft.find({
  "location.geometry": boundsQuery
});
```

## 🛣️ API Endpoints

### POST /api/crafts

```http
POST /api/crafts
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "گلیم کاشان",
  "description": "...",
  "location": {
    "city": "کاشان",
    "coordinates": [51.4390, 33.9831]  // Both formats work
  }
}
```

### GET /api/crafts/near

```http
GET /api/crafts/near?lng=51.4390&lat=33.9831&radiusKm=10
```

**Query Parameters:**

- `lng` - Longitude (required with lat)
- `lat` - Latitude (required with lng)
- `radiusKm` - Search radius in kilometers (default: 10, max: 100)
- `q` - Text search query (optional)
- `category` - Craft category filter (optional)
- `min` - Minimum price (optional)
- `max` - Maximum price (optional)

### PATCH /api/users/me

```http
PATCH /api/users/me
Content-Type: application/json
Authorization: Bearer <token>

{
  "location": {
    "city": "تهران",
    "neighborhood": "ولنجک",
    "coordinates": [51.4241, 35.7989]
  }
}
```

## ⚠️ Common Mistakes

### ❌ WRONG: Latitude, Longitude order

```javascript
coordinates: [lat, lng]; // ❌ WRONG!
```

### ✅ CORRECT: Longitude, Latitude order

```javascript
coordinates: [lng, lat]; // ✅ CORRECT!
```

### ❌ WRONG: Out of range

```javascript
coordinates: [200, 100]; // ❌ Invalid ranges
```

### ✅ CORRECT: Valid ranges

```javascript
coordinates: [51.4, 35.7]; // ✅ lng: -180 to 180, lat: -90 to 90
```

### ❌ WRONG: No validation

```javascript
const longitude = req.body.lng;
craft.location.geometry.coordinates[0] = longitude; // ❌ Not validated!
```

### ✅ CORRECT: With validation

```javascript
const { lng, lat } = req.body;
if (isValidCoordinates(lng, lat)) {
  craft.location.geometry = {
    type: "Point",
    coordinates: [lng, lat],
  };
}
```

## 🔄 Legacy Format Support

The API accepts multiple input formats for backward compatibility:

### Input Formats (All Work)

```javascript
// 1. GeoJSON (preferred)
location: {
  geometry: {
    type: "Point",
    coordinates: [51.4, 35.7]
  }
}

// 2. Array format
location: {
  coordinates: [51.4, 35.7]
}

// 3. Object format (legacy)
location: {
  coordinates: {
    lng: 51.4,
    lat: 35.7
  }
}
```

### Internal Storage (Always GeoJSON)

All formats are converted to GeoJSON before saving:

```javascript
location: {
  city: "تهران",
  neighborhood: "ولنجک",
  geometry: {
    type: "Point",
    coordinates: [51.4, 35.7]
  }
}
```

### API Output (Backward Compatible)

JSON transform exposes coordinates for API consumers:

```javascript
{
  "location": {
    "city": "تهران",
    "neighborhood": "ولنجک",
    "coordinates": [51.4, 35.7]  // Exposed for compatibility
    // geometry not shown in output
  }
}
```

## 🧪 Testing Coordinates

### Test Valid Coordinates

```javascript
// Tehran
const tehran = [51.4241, 35.7989];
console.assert(isValidCoordinates(51.4241, 35.7989) === true);

// Isfahan
const isfahan = [51.668, 32.6546];
console.assert(isValidCoordinates(51.668, 32.6546) === true);

// Shiraz
const shiraz = [52.5837, 29.5918];
console.assert(isValidCoordinates(52.5837, 29.5918) === true);
```

### Test Invalid Coordinates

```javascript
// Out of range longitude
console.assert(isValidCoordinates(200, 35) === false);

// Out of range latitude
console.assert(isValidCoordinates(51, 100) === false);

// Not numbers
console.assert(isValidCoordinates("51", "35") === false);
```

## 📚 References

- [MongoDB Geospatial Queries](https://docs.mongodb.com/manual/geospatial-queries/)
- [GeoJSON Specification](https://geojson.org/)
- [2dsphere Indexes](https://docs.mongodb.com/manual/core/2dsphere/)

---

**Last Updated**: February 14, 2026  
**File**: `backend/utils/geospatial.js`  
**Documentation**: `backend/GEOSPATIAL_IMPLEMENTATION.md`
