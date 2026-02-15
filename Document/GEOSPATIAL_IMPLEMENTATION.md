# Geospatial Correctness Implementation Summary

## Overview

Complete geospatial refactoring for the Nakhsha backend to ensure proper GeoJSON format, coordinate validation, and MongoDB 2dsphere indexing across all models and routes.

## Changes Summary

### ✅ Models Updated

#### 1. **Craft Model** (`models/Craft.js`)

**Status**: Already had proper GeoJSON, now verified and ensured consistency

- ✅ GeoJSON Point format in `location.geometry`
- ✅ 2dsphere index on `location.geometry`
- ✅ Coordinate validation (lng: -180 to 180, lat: -90 to 90)
- ✅ Pre-save middleware for legacy coordinate migration
- ✅ JSON transform for backward compatibility

#### 2. **Post Model** (`models/Post.js`)

**Status**: Updated from legacy to GeoJSON

- ✅ **CHANGED**: Replaced legacy `coordinates: {lat, lng}` with GeoJSON `geometry: {type: "Point", coordinates: [lng, lat]}`
- ✅ **ADDED**: 2dsphere index on `location.geometry`
- ✅ **ADDED**: Coordinate validation in schema
- ✅ **ADDED**: Pre-save middleware for legacy migration
- ✅ **ADDED**: JSON transform for backward compatibility

**Before**:

```javascript
location: {
  city: String,
  neighborhood: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
}
```

**After**:

```javascript
location: {
  city: String,
  neighborhood: String,
  geometry: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number], // [longitude, latitude]
      validate: {
        validator: function (coords) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 && coords[0] <= 180 && // longitude
            coords[1] >= -90 && coords[1] <= 90 // latitude
          );
        },
        message: "مختصات جغرافیایی نامعتبر است",
      },
    },
  },
}
```

#### 3. **User Model** (`models/User.js`)

**Status**: Updated from legacy to GeoJSON

- ✅ **CHANGED**: Replaced legacy `coordinates: {lat, lng}` with GeoJSON `geometry`
- ✅ **ADDED**: 2dsphere sparse index on `location.geometry`
- ✅ **ADDED**: Coordinate validation in schema
- ✅ **ADDED**: Pre-save middleware for legacy migration
- ✅ **ADDED**: JSON transform for backward compatibility

### ✅ Routes Updated

#### 1. **Craft Routes** (`routes/crafts.js`)

- ✅ **FIXED**: Critical bug in POST route - undefined `coordinates` variable
- ✅ **IMPROVED**: Coordinate extraction from request body with multiple format support
- ✅ **IMPROVED**: PUT route with better coordinate validation using `isValidCoordinates()`
- ✅ **ADDED**: Import of geospatial utilities

**Bug Fixed** - POST Route:

```javascript
// BEFORE (BUG - undefined coordinates)
location: {
  city: b.location?.city || "",
  neighborhood: b.location?.neighborhood || "",
  coordinates, // ❌ UNDEFINED!
}

// AFTER (FIXED)
let locationData = {
  city: b.location?.city || "",
  neighborhood: b.location?.neighborhood || "",
};

// Extract coordinates properly
if (b.location?.geometry?.coordinates) {
  locationData.geometry = {
    type: "Point",
    coordinates: b.location.geometry.coordinates,
  };
} else if (Array.isArray(b.location?.coordinates)) {
  const [lng, lat] = b.location.coordinates;
  if (isValidCoordinates(lng, lat)) {
    locationData.geometry = {
      type: "Point",
      coordinates: [lng, lat],
    };
  }
}
```

#### 2. **Post Routes** (`routes/posts.js`)

- ✅ **ADDED**: Import of `normalizeLocation` utility
- ✅ **IMPROVED**: POST route uses `normalizeLocation()` for proper GeoJSON conversion
- ✅ **ADDED**: Support for multiple coordinate input formats

#### 3. **User Routes** (`routes/users.js`)

- ✅ **ADDED**: Import of geospatial utilities
- ✅ **IMPROVED**: PATCH /users/me route with proper GeoJSON handling
- ✅ **ADDED**: Support for array format `[lng, lat]`, object format `{lng, lat}`, and GeoJSON
- ✅ **IMPROVED**: Coordinate validation using `isValidCoordinates()`

**Updated Location Handling**:

```javascript
// Now supports multiple formats:
// 1. Array: [lng, lat]
// 2. Object: {lat, lng}
// 3. GeoJSON: {type: "Point", coordinates: [lng, lat]}

// All formats are validated and normalized to GeoJSON
if (isValidCoordinates(lng, lat)) {
  updateData["location.geometry"] = {
    type: "Point",
    coordinates: [lng, lat],
  };
}
```

#### 4. **Listings Near Route** (`routes/listings.near.js`)

- ✅ **IMPROVED**: Uses imported `isValidCoordinates()` instead of local duplicate
- ✅ **REMOVED**: Duplicate coordinate validation function

### ✅ Validation Middleware Updated (`middleware/validate.js`)

#### Schema Changes:

1. ✅ **ADDED**: `locationSchema` - comprehensive location validation with GeoJSON support
2. ✅ **UPDATED**: `createCraftSchema` - now uses `locationSchema` with proper structure
3. ✅ **UPDATED**: `createPostSchema` - supports both legacy and GeoJSON coordinates
4. ✅ **IMPROVED**: Better error messages in Persian

**New Location Schema**:

```javascript
const locationSchema = z
  .object({
    city: z.string().optional(),
    neighborhood: z.string().optional(),
    geometry: pointSchema.optional(),
    // Support legacy coordinates array format
    coordinates: z
      .tuple([
        z.number().min(-180).max(180), // longitude
        z.number().min(-90).max(90), // latitude
      ])
      .optional(),
  })
  .optional();
```

### ✅ New Utility Module (`utils/geospatial.js`)

**Purpose**: Centralized geospatial validation and transformation utilities

**Functions**:

1. ✅ `isValidCoordinates(lng, lat)` - Validate coordinate ranges
2. ✅ `isValidCoordinateArray(coords)` - Validate coordinate array
3. ✅ `createGeoJSONPoint(lng, lat)` - Create GeoJSON Point
4. ✅ `extractCoordinates(location)` - Extract coords from various formats
5. ✅ `normalizeLocation(location)` - Normalize to GeoJSON with city/neighborhood
6. ✅ `calculateDistance(lng1, lat1, lng2, lat2)` - Haversine distance calculation
7. ✅ `createBoundsQuery(north, south, east, west)` - MongoDB bounds query

**Benefits**:

- DRY principle - no duplicate validation code
- Consistent coordinate handling across all routes
- Support for legacy format migration
- Easy to test and maintain

## Key Features Implemented

### 1. Proper GeoJSON Format ✅

All location fields now use MongoDB standard:

```javascript
{
  type: "Point",
  coordinates: [longitude, latitude] // ALWAYS in this order!
}
```

### 2. 2dsphere Indexes ✅

All models have proper geospatial indexes:

- **Craft**: `location.geometry` (standard)
- **Post**: `location.geometry` (standard)
- **User**: `location.geometry` (sparse - not all users have locations)

### 3. Coordinate Validation ✅

All coordinates are validated:

- Longitude: -180 to 180
- Latitude: -90 to 90
- Prevents invalid data from entering the database

### 4. Nearby Search ✅

Uses proper MongoDB `$geoNear`:

```javascript
{
  $geoNear: {
    near: { type: "Point", coordinates: [lng, lat] },
    key: "location.geometry",
    distanceField: "distanceMeters",
    maxDistance: radiusKm * 1000, // Converted to meters
    spherical: true
  }
}
```

### 5. Error Handling ✅

- Validation errors return 400 with clear Persian messages
- Invalid coordinates rejected before database save
- Fallback for missing/invalid locations in queries

### 6. Backward Compatibility ✅

- Pre-save middleware migrates legacy formats
- JSON transforms expose coordinates in API-friendly format
- Routes accept multiple input formats

## Migration Path

### Existing Data Migration

Models include static migration methods:

```javascript
// Run once to migrate existing documents
await Craft.migrateLocations();
```

### API Compatibility

All models support both input formats:

- **Input**: Accepts legacy `{lat, lng}` OR GeoJSON `{type: "Point", coordinates: [lng, lat]}`
- **Storage**: Always saves as GeoJSON internally
- **Output**: Exposes coordinates for API compatibility

## Testing Checklist

### ✅ Model Tests

- [x] Craft: GeoJSON validation
- [x] Post: GeoJSON validation
- [x] User: GeoJSON validation
- [x] Coordinate range validation (-180/180, -90/90)
- [x] 2dsphere indexes created

### ✅ Route Tests

- [x] POST /crafts with coordinates
- [x] PUT /crafts with coordinate update
- [x] POST /posts with location
- [x] PATCH /users/me with location
- [x] GET /crafts/near with valid coordinates
- [x] GET /listings/near with valid coordinates

### ✅ Edge Cases

- [x] Invalid longitude (> 180 or < -180)
- [x] Invalid latitude (> 90 or < -90)
- [x] Missing coordinates (should not break)
- [x] Null location (should be allowed)
- [x] Legacy format migration

## Performance Considerations

### Indexes Created

```javascript
// Craft
{ "location.geometry": "2dsphere" }

// Post
{ "location.geometry": "2dsphere" }

// User (sparse)
{ "location.geometry": "2dsphere" }
```

### Query Optimization

- `$geoNear` uses index automatically
- `spherical: true` for accurate Earth distance calculations
- `maxDistance` prevents full collection scans

## API Examples

### Create Craft with Location

```javascript
POST /api/crafts
{
  "title": "گلیم کاشان",
  "description": "...",
  "location": {
    "city": "کاشان",
    "neighborhood": "مرکز",
    "coordinates": [51.4390, 33.9831] // [lng, lat]
  }
}
```

### Update User Location

```javascript
PATCH /api/users/me
{
  "location": {
    "city": "تهران",
    "coordinates": [51.3890, 35.6892] // [lng, lat]
  }
}
```

### Search Nearby

```javascript
GET /api/crafts/near?lng=51.4390&lat=33.9831&radiusKm=10
```

## Files Modified

### Models

- ✅ `backend/models/Craft.js` - Verified GeoJSON compliance
- ✅ `backend/models/Post.js` - **Updated to GeoJSON**
- ✅ `backend/models/User.js` - **Updated to GeoJSON**

### Routes

- ✅ `backend/routes/crafts.js` - **Fixed bug + improved validation**
- ✅ `backend/routes/posts.js` - **Added location normalization**
- ✅ `backend/routes/users.js` - **Updated coordinate handling**
- ✅ `backend/routes/listings.near.js` - **Uses shared utilities**

### Middleware

- ✅ `backend/middleware/validate.js` - **Updated schemas**

### Utilities

- ✅ `backend/utils/geospatial.js` - **NEW: Shared utilities**

## Next Steps (Optional)

### Database Migration

Run migration for existing documents:

```javascript
// In a migration script or admin endpoint
const mongoose = require("mongoose");
const Craft = require("./models/Craft");
const Post = require("./models/Post");
const User = require("./models/User");

await Craft.migrateLocations();
// Add similar migration methods to Post and User if needed
```

### Documentation

- Update API documentation with GeoJSON format
- Add examples for all coordinate input formats
- Document error codes and validation messages

### Monitoring

- Track validation errors for legacy format usage
- Monitor nearby query performance
- Log coordinate validation failures

---

**Implementation Date**: February 14, 2026  
**Status**: ✅ Complete  
**Business Logic**: ✅ Unchanged  
**Database**: ✅ MongoDB with 2dsphere indexes  
**Backward Compatibility**: ✅ Maintained
