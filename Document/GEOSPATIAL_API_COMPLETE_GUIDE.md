# Nakhsha Geospatial API — Complete Guide

**Version:** 2.0.0  
**Last Updated:** May 2026  
**Status:** Production-Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Core APIs](#core-apis)
5. [Advanced APIs](#advanced-apis)
6. [Filtering & Query Patterns](#filtering--query-patterns)
7. [Error Handling](#error-handling)
8. [Performance Characteristics](#performance-characteristics)
9. [Indexing Strategy](#indexing-strategy)
10. [Troubleshooting](#troubleshooting)
11. [Code Examples](#code-examples)

---

## Overview

Nakhsha's geospatial API provides production-grade map-based queries for discovering Iranian handicrafts, cultural events, and tourism experiences. Built on MongoDB GeoJSON, Express.js, and optimized aggregation pipelines, the API supports:

- **Proximity searches** — Find listings within a radius
- **Heatmap data** — Visualize density, price, or rating distributions
- **Clustering** — Group markers efficiently at different zoom levels
- **Polygon searches** — Query within geographic boundaries
- **Multi-filter queries** — Category, price, rating, verification status
- **Full-text search** — Search by title, description, tags
- **Pagination** — Efficient scrolling and offset-based navigation

### Key Features

| Feature             | Implementation                             | Performance            |
| ------------------- | ------------------------------------------ | ---------------------- |
| Geospatial Queries  | `$geoNear` aggregation stage               | <200ms for 100 results |
| Lightweight Markers | 90% size reduction vs full documents       | ~1KB per marker        |
| Clustering          | Geohash-based with zoom-adaptive precision | <300ms any zoom        |
| Heatmap Generation  | Grid-based aggregation with $facet         | <500ms for 50x50 grid  |
| Polygon Queries     | `$geoWithin` + `$geometry`                 | <400ms typical         |
| Indexes             | Sparse 2dsphere + composite compounds      | Auto-chosen by MongoDB |

---

## Architecture

### System Design

```
┌─────────────────┐
│  Frontend Maps  │
│  (Leaflet/GL)   │
└────────┬────────┘
         │ AJAX requests
         ↓
┌─────────────────────────────┐
│  Express.js Route Handlers  │
│  /api/listings/{near|heat…} │
└────────┬────────────────────┘
         │ Validates input
         ↓
┌──────────────────────────────┐
│  GeoService Layer            │
│  (Query abstraction)         │
└────────┬─────────────────────┘
         │ Builds aggregation
         ↓
┌──────────────────────────────┐
│  MongoDB Aggregation         │
│  $geoNear → $match → $project│
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│  2dsphere Indexes            │
│  (Sparse, optimized)         │
└──────────────────────────────┘
```

### Layers

1. **Route Layer** ([`backend/routes/listings.*.js`]) — HTTP handling, input validation, response formatting
2. **Service Layer** ([`backend/services/GeoService.js`]) — Query logic, pipeline building, DTO transformation
3. **Repository Layer** ([`backend/repository/ListingRepository.js`]) — Data access (for CRUD operations)
4. **Model Layer** ([`backend/models/Listing.js`]) — Schema definition, indexes

---

## Data Model

### Location Schema

All listings include an enhanced location object:

```javascript
location: {
  type: "Point",                           // GeoJSON type
  coordinates: [longitude, latitude],      // [51.389, 35.6892]
  city: "تهران",                          // City name
  province: "تهران",                      // Province/state
  district: "بلوار فرردوسی",             // Neighborhood
  address: "خیابان ولیعصر، پلاک ۱۲۳"    // Full address
}
```

**Important:** Coordinates follow GeoJSON spec: `[longitude, latitude]` (not reversed like some APIs).

### Listing Types

```javascript
// All listings have discriminator "type"
type: "post" | "tour" | "training" | "academy"

// Post listings (product sales)
{ type: "post", price: number, forSale: boolean, category: string }

// Tour listings (experiences)
{ type: "tour", startDate: Date, endDate: Date, capacity: number, itinerary: string }

// Training/Academy listings
{ type: "training", schedule: {...}, startDate: Date, endDate: Date }
```

### Sample Listing Document

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "type": "post",
  "title": "تابلو خوشنویسی سنتی",
  "description": "تابلو خط‌نگاری سنتی فارسی...",
  "owner": "507f1f77bcf86cd799439012",
  "status": "published",
  "location": {
    "type": "Point",
    "coordinates": [51.389, 35.6892],
    "city": "تهران",
    "province": "تهران",
    "district": "جردن",
    "address": "خیابان ولیعصر، پلاک ۲۳۴"
  },
  "category": "calligraphy",
  "price": 500000,
  "forSale": true,
  "tags": ["traditional", "art", "handmade"],
  "images": ["/uploads/image1.webp", "/uploads/image2.webp"],
  "rating": 4.5,
  "verified": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-05-20T08:45:00Z"
}
```

---

## Core APIs

### 1. GET /api/listings/near

Find listings within a geographic radius.

#### Request

```http
GET /api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&limit=50&skip=0
```

#### Query Parameters

| Param       | Type    | Required | Default   | Range                         | Description                                |
| ----------- | ------- | -------- | --------- | ----------------------------- | ------------------------------------------ |
| `lat`       | float   | ✓        | —         | [-90, 90]                     | Latitude of search center                  |
| `lng`       | float   | ✓        | —         | [-180, 180]                   | Longitude of search center                 |
| `radiusKm`  | float   | —        | 5         | [0.1, 50]                     | Search radius in kilometers                |
| `limit`     | integer | —        | 100       | [1, 500]                      | Max results to return                      |
| `skip`      | integer | —        | 0         | [0, ∞)                        | Pagination offset                          |
| `category`  | string  | —        | —         | —                             | Filter by category (pottery, carpet, etc.) |
| `type`      | string  | —        | —         | post, tour, training, academy | Filter by listing type                     |
| `status`    | string  | —        | published | draft, published, archived    | Filter by publication status               |
| `minPrice`  | number  | —        | —         | [0, ∞)                        | Minimum price (for posts)                  |
| `maxPrice`  | number  | —        | —         | [0, ∞)                        | Maximum price (for posts)                  |
| `minRating` | float   | —        | —         | [0, 5]                        | Minimum average rating                     |
| `verified`  | boolean | —        | —         | true, false                   | Filter by verification status              |
| `query`     | string  | —        | —         | —                             | Text search (title, description, tags)     |

#### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "تابلو خوشنویسی",
        "type": "post",
        "status": "published",
        "category": "calligraphy",
        "coordinates": [51.389, 35.6892],
        "city": "تهران",
        "province": "تهران",
        "distanceMeters": 1234,
        "distanceKm": 1.23,
        "location": "تهران، تهران",
        "preview": "http://example.com/uploads/image.webp",
        "price": 500000,
        "rating": 4.5,
        "verified": true
      }
    ],
    "meta": {
      "radiusKm": 5,
      "limit": 50,
      "count": 12,
      "totalCount": 45,
      "hasMore": true
    }
  },
  "metadata": {
    "executionTime": 85,
    "queryRadius": 5,
    "resultsCount": 12
  },
  "reqId": "req-123456"
}
```

#### Examples

**Basic search:**

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5"
```

**With filters:**

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&category=pottery&minPrice=100000&maxPrice=1000000&limit=20"
```

**Text search + filters:**

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&query=سفال&type=post&verified=true"
```

**Pagination:**

```bash
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&limit=50&skip=0"
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&limit=50&skip=50"
```

---

## Advanced APIs

### 2. GET /api/listings/heatmap

Generate grid-based aggregation for heatmap visualization.

#### Request

```http
GET /api/listings/heatmap?lat=35.6892&lng=51.389&radiusKm=10&gridSize=10&aggregateBy=count
```

#### Query Parameters

| Param            | Type    | Required | Default   | Range                         | Description              |
| ---------------- | ------- | -------- | --------- | ----------------------------- | ------------------------ |
| `lat`            | float   | ✓        | —         | [-90, 90]                     | Center latitude          |
| `lng`            | float   | ✓        | —         | [-180, 180]                   | Center longitude         |
| `radiusKm`       | float   | —        | 5         | [0.1, 50]                     | Search radius            |
| `gridSize`       | integer | —        | 10        | [5, 50]                       | Cells per edge of grid   |
| `aggregateBy`    | string  | —        | count     | count, avgPrice, avgRating    | Aggregation function     |
| `includeDetails` | boolean | —        | false     | true, false                   | Include min/max per cell |
| `category`       | string  | —        | —         | —                             | Filter by category       |
| `type`           | string  | —        | —         | post, tour, training, academy | Filter by type           |
| `status`         | string  | —        | published | draft, published, archived    | Filter by status         |

#### Response

```json
{
  "success": true,
  "data": {
    "grid": [
      {
        "lat": 35.69,
        "lng": 51.39,
        "value": 12,
        "cellCount": 12,
        "details": {
          "min": 150000,
          "max": 2500000,
          "avg": 875000
        }
      }
    ],
    "bounds": {
      "north": 35.75,
      "south": 35.63,
      "east": 51.45,
      "west": 51.33
    },
    "center": {
      "lat": 35.6892,
      "lng": 51.389
    },
    "gridSize": 10,
    "aggregateBy": "avgPrice",
    "cellCount": 45,
    "totalListings": 342
  },
  "metadata": {
    "executionTime": 240,
    "queryRadius": 10
  },
  "reqId": "req-789"
}
```

#### Use Cases

- **Density visualization** — Show where crafts concentrate
- **Price heatmaps** — Identify expensive vs. cheap regions
- **Rating clusters** — Find highly-rated neighborhoods
- **Demand analysis** — Understand geographic distribution

#### Zoom Level Guidance

| Zoom  | Grid Recommendation | Purpose                      |
| ----- | ------------------- | ---------------------------- |
| 0-8   | 5                   | Continental/country overview |
| 8-14  | 10-15               | Regional/city analysis       |
| 14-18 | 20-30               | Neighborhood detail          |
| 18+   | 40-50               | Street-level granularity     |

---

### 3. GET /api/listings/clusters

Group nearby listings into geohash-based clusters for efficient map rendering.

#### Request

```http
GET /api/listings/clusters?lat=35.6892&lng=51.389&radiusKm=10&zoomLevel=12&limit=100
```

#### Query Parameters

| Param       | Type    | Required | Default | Range                         | Description                               |
| ----------- | ------- | -------- | ------- | ----------------------------- | ----------------------------------------- |
| `lat`       | float   | ✓        | —       | [-90, 90]                     | Center latitude                           |
| `lng`       | float   | ✓        | —       | [-180, 180]                   | Center longitude                          |
| `radiusKm`  | float   | —        | 5       | [0.1, 50]                     | Search radius                             |
| `zoomLevel` | integer | —        | 12      | [0, 20]                       | Map zoom level (adapts cluster precision) |
| `limit`     | integer | —        | 100     | [1, 500]                      | Max clusters to return                    |
| `skip`      | integer | —        | 0       | [0, ∞)                        | Pagination offset                         |
| `category`  | string  | —        | —       | —                             | Filter by category                        |
| `type`      | string  | —        | —       | post, tour, training, academy | Filter by type                            |

#### Response

```json
{
  "success": true,
  "data": {
    "clusters": [
      {
        "geohash": "swu4rxz",
        "bounds": {
          "north": 35.702,
          "south": 35.681,
          "east": 51.41,
          "west": 51.389
        },
        "count": 23,
        "sample": {
          "id": "507f1f77bcf86cd799439011",
          "title": "تابلو خوشنویسی",
          "coordinates": [51.399, 35.691],
          "price": 500000,
          "preview": "http://example.com/uploads/image.webp"
        }
      }
    ],
    "center": {
      "lat": 35.6892,
      "lng": 51.389
    },
    "zoomLevel": 12,
    "zoomRecommendation": "Current zoom level is optimal",
    "totalClusters": 42,
    "geohashPrecision": 7
  },
  "metadata": {
    "executionTime": 156,
    "queryRadius": 10
  },
  "reqId": "req-456"
}
```

#### Zoom Level Mapping

Higher zoom = more clusters (finer granularity)

| Zoom  | Precision | Scale    | Use Case          |
| ----- | --------- | -------- | ----------------- |
| 0-2   | 1         | ~5000 km | World map         |
| 3-5   | 2-3       | ~1000 km | Country level     |
| 6-8   | 4-5       | ~150 km  | Regional          |
| 9-11  | 6         | ~30 km   | Province level    |
| 12-14 | 7-8       | ~5-10 km | City neighborhood |
| 15-17 | 9         | ~1-2 km  | Streets           |
| 18-20 | 10-11     | <500m    | Buildings         |

---

### 4. POST /api/listings/within-boundary

Find listings within a geographic polygon (boundary search).

#### Request

```http
POST /api/listings/within-boundary
Content-Type: application/json

{
  "polygon": [
    [51.30, 35.65],
    [51.50, 35.65],
    [51.50, 35.75],
    [51.30, 35.75],
    [51.30, 35.65]
  ],
  "filters": {
    "category": "pottery",
    "type": "post",
    "minPrice": 100000,
    "maxPrice": 1000000
  },
  "pagination": {
    "limit": 50,
    "skip": 0
  }
}
```

#### Request Body

| Field              | Type   | Required | Description                                                     |
| ------------------ | ------ | -------- | --------------------------------------------------------------- |
| `polygon`          | array  | ✓        | Array of `[lng, lat]` pairs; must be closed (first == last)     |
| `polygon[].length` | —      | —        | 4+ points (including closing), max 100 points                   |
| `filters`          | object | —        | Optional: category, type, status, minPrice, maxPrice, minRating |
| `pagination`       | object | —        | Optional: limit (1-500, default 100), skip (default 0)          |

#### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "سفالگری سنتی",
        "type": "post",
        "category": "pottery",
        "coordinates": [51.35, 35.7],
        "distanceKm": 0.8,
        "price": 450000,
        "rating": 4.8
      }
    ],
    "polygon": {
      "type": "Polygon",
      "coordinates": [
        [
          [51.3, 35.65],
          [51.5, 35.65],
          [51.5, 35.75],
          [51.3, 35.75],
          [51.3, 35.65]
        ]
      ]
    },
    "bounds": {
      "north": 35.75,
      "south": 35.65,
      "east": 51.5,
      "west": 51.3
    },
    "pagination": {
      "limit": 50,
      "skip": 0,
      "totalCount": 12,
      "hasMore": false
    }
  },
  "metadata": {
    "executionTime": 198,
    "polygonPointCount": 5
  },
  "reqId": "req-234"
}
```

#### Polygon Validation Rules

- **Closed:** First point must equal last point
- **Minimum points:** 4 (forming a triangle + closure)
- **Maximum points:** 100 (complexity limit)
- **Valid coordinates:** All points must be valid `[lng, lat]` pairs within [-180,180] lng and [-90,90] lat

#### Use Cases

- Regional/administrative boundary searches
- Custom user-drawn area selection
- Neighborhood-level filtering
- Survey area definition

---

## Filtering & Query Patterns

### Category Filtering

```bash
# Single category
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&category=pottery"

# Multiple categories (use multiple calls or implement OR in filters)
```

**Valid categories (examples):**

- pottery, carpet, metalwork, calligraphy, textiles, jewelry, woodwork, glass

### Price Range Filtering

```bash
# Budget range
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&minPrice=50000&maxPrice=200000"

# Luxury items
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&minPrice=1000000"

# Inexpensive
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&maxPrice=500000"
```

### Type Filtering

```bash
# Products only
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&type=post"

# Tours/experiences
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&type=tour"

# Training classes
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&type=training"
```

### Status Filtering

```bash
# Published listings only (default)
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&status=published"

# Include drafts
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&status=draft"

# Archived listings
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&status=archived"
```

### Verification Filtering

```bash
# Verified sellers only
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&verified=true"

# All listings
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389"
```

### Text Search (Full-Text)

```bash
# Search by keyword (title, description, tags)
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&query=سفال"

# Combined: geo + full-text search
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&query=سفال&category=pottery"
```

### Rating Filtering

```bash
# Highly-rated items (4+ stars)
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&minRating=4"

# Very high-rated (4.5+ stars)
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&minRating=4.5"
```

### Combined Filters

```bash
# Complex query: pottery within 5km, 100-500k price, highly-rated, verified
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&category=pottery&minPrice=100000&maxPrice=500000&minRating=4&verified=true&limit=20"
```

---

## Error Handling

### HTTP Status Codes

| Status | Meaning      | Example                                        |
| ------ | ------------ | ---------------------------------------------- |
| 200    | Success      | Valid query executed                           |
| 400    | Bad Request  | Invalid latitude, missing parameters           |
| 404    | Not Found    | Endpoint doesn't exist                         |
| 500    | Server Error | Database connection failed, internal exception |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "عدد کوئری نامعتبر است",
    "details": {
      "errors": ["عرض جغرافیایی باید بین -۹۰ و ۹۰ باشد"],
      "hint": "Please check your query parameters"
    }
  },
  "reqId": "req-123"
}
```

### Common Error Codes

| Code                   | HTTP | Message                   | Solution                              |
| ---------------------- | ---- | ------------------------- | ------------------------------------- |
| `VALIDATION_ERROR`     | 400  | Invalid parameters        | Check query syntax, ranges            |
| `INVALID_GEO_POINT`    | 400  | Invalid lat/lng           | lat: [-90,90], lng: [-180,180]        |
| `INVALID_RADIUS`       | 400  | Invalid radius            | radiusKm: [0.1, 50]                   |
| `INVALID_GRID_SIZE`    | 400  | Invalid grid size         | gridSize: [5, 50]                     |
| `INVALID_ZOOM_LEVEL`   | 400  | Invalid zoom level        | zoomLevel: [0, 20]                    |
| `INVALID_AGGREGATION`  | 400  | Invalid aggregateBy       | count, avgPrice, avgRating            |
| `GEO_QUERY_ERROR`      | 400  | Query execution failed    | Check database status                 |
| `HEATMAP_ERROR`        | 400  | Heatmap generation failed | Try smaller gridSize                  |
| `CLUSTERING_ERROR`     | 400  | Clustering failed         | Try different zoomLevel               |
| `POLYGON_SEARCH_ERROR` | 400  | Polygon invalid           | Ensure closed, 4+ points, <100 points |
| `SERVER_ERROR`         | 500  | Internal server error     | Check logs, retry                     |

### Error Handling Strategy

1. **Validate early** — Check all parameters before querying database
2. **Provide context** — Return specific error codes and helpful hints
3. **Log internally** — Detailed errors logged with request ID for debugging
4. **Retry safely** — Transient errors (500) are retryable; validation errors (400) are not

---

## Performance Characteristics

### Query Execution Times (Benchmarked on medium dataset, 1000 documents)

| Query                            | Typical Time | 95th Percentile | Factors                        |
| -------------------------------- | ------------ | --------------- | ------------------------------ |
| `/near` (basic, radius 5km)      | 45-80 ms     | 120 ms          | Result count, index hit        |
| `/near` (with 3+ filters)        | 60-150 ms    | 200 ms          | Filter complexity, text search |
| `/near` (pagination, large skip) | 80-200 ms    | 250 ms          | Skip offset, result count      |
| `/heatmap` (10x10 grid)          | 120-250 ms   | 350 ms          | Grid size, aggregation type    |
| `/heatmap` (50x50 grid)          | 300-500 ms   | 600 ms          | Granularity increases time     |
| `/clusters` (zoom 12)            | 60-150 ms    | 200 ms          | Zoom level, geohash precision  |
| `/clusters` (various zooms)      | 40-200 ms    | 300 ms          | Zoom extremes are slower       |
| `/within-boundary` (5-point)     | 80-180 ms    | 250 ms          | Polygon complexity, results    |
| `/within-boundary` (50-point)    | 150-350 ms   | 400 ms          | Complexity limit reached       |

### Memory Usage

- **Marker DTO:** ~1 KB per result
- **Heatmap grid** (10x10): ~5 KB
- **Heatmap grid** (50x50): ~120 KB
- **Cluster response:** ~2 KB per cluster

### Concurrent Load

- **Rate limit:** 30 req/min per IP (heavy endpoints)
- **Connection pool:** 10 connections to MongoDB (default)
- **Max result size:** 500 documents (configurable limit)

---

## Indexing Strategy

### Indexes Created Automatically

```javascript
// 1. Basic 2dsphere for geospatial queries
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere" },
  { sparse: true, name: "location_geo_idx" },
);

// 2. Geo + Category (common filter)
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere", category: 1 },
  { sparse: true, name: "location_category_idx" },
);

// 3. Geo + Type + Status (popular combo)
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere", type: 1, status: 1 },
  { sparse: true, name: "location_type_status_idx" },
);

// 4. Geo + Price (price range queries)
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere", price: 1, status: 1 },
  { sparse: true, name: "location_price_status_idx" },
);

// 5. Geo + Owner (user-specific queries)
db.user_listings.createIndex(
  { owner: 1, "location.coordinates": "2dsphere", status: 1 },
  { sparse: true, name: "owner_location_status_idx" },
);

// 6. Full-text search
db.user_listings.createIndex(
  { title: "text", description: "text", tags: "text" },
  {
    weights: { title: 10, tags: 5, description: 1 },
    name: "listings_text_idx",
  },
);
```

### Verify Index Usage

```javascript
// Explain a query to see which index is used
db.user_listings
  .find({
    "location.coordinates": {
      $geoWithin: { $centerSphere: [[51.389, 35.6892], 0.005] },
    },
    category: "pottery",
    status: "published",
  })
  .explain("executionStats");

// Check index sizes
db.user_listings.stats();

// Rebuild indexes if needed
db.user_listings.reIndex();
```

---

## Troubleshooting

### Issue: Queries Return 0 Results Despite Data Existing

**Causes:**

- Missing/invalid 2dsphere index
- Location data has wrong format or missing coordinates
- Filters too restrictive

**Solution:**

```javascript
// Check if index exists
db.user_listings.getIndexes();

// If missing, create index
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere" },
  { sparse: true },
);

// Check location format in documents
db.user_listings.findOne({ location: { $exists: true } });

// Should show: { type: "Point", coordinates: [lng, lat] }
```

### Issue: Slow Geospatial Queries

**Causes:**

- No 2dsphere index
- Index not being used (wrong query structure)
- Large result sets causing memory pressure
- Text search without proper indexing

**Solution:**

```javascript
// Verify index is being used
db.user_listings
  .find(...)
  .explain("executionStats")

// Should show: "COLLSCAN" → BAD, "GEO2DSPHERE" → GOOD

// If slow, rebuild index
db.user_listings.dropIndex("location_geo_idx")
db.user_listings.createIndex(
  { "location.coordinates": "2dsphere" },
  { sparse: true }
)

// Limit results
// Add limit=50 to query
```

### Issue: Invalid Polygon Error

**Causes:**

- Polygon not closed (first point ≠ last point)
- Less than 4 points
- Non-numeric coordinates

**Solution:**

```javascript
// Valid polygon must:
// 1. Have 4+ points (triangle + closure)
// 2. Be closed (first == last)
// 3. Have valid [lng, lat] format

const polygon = [
  [51.3, 35.65], // Point 1
  [51.5, 35.65], // Point 2
  [51.5, 35.75], // Point 3
  [51.3, 35.75], // Point 4
  [51.3, 35.65], // Must equal Point 1 (closure)
];

// Check: first point equals last point
console.assert(
  JSON.stringify(polygon[0]) === JSON.stringify(polygon[polygon.length - 1]),
  "Polygon must be closed",
);
```

### Issue: Heatmap Generation Timeout

**Causes:**

- Grid size too large
- Search radius too large
- Too many documents in area

**Solution:**

```bash
# Reduce grid size
curl "http://localhost:3000/api/listings/heatmap?lat=35.6892&lng=51.389&gridSize=5"

# Reduce radius
curl "http://localhost:3000/api/listings/heatmap?lat=35.6892&lng=51.389&radiusKm=5"

# Add filters to reduce result count
curl "http://localhost:3000/api/listings/heatmap?lat=35.6892&lng=51.389&category=pottery"
```

---

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require("axios");

const API_BASE = "http://localhost:3000/api/listings";

// 1. Nearby search
async function findNearby(lat, lng, radiusKm = 5) {
  const response = await axios.get(`${API_BASE}/near`, {
    params: {
      lat,
      lng,
      radiusKm,
      limit: 50,
    },
  });
  return response.data.data.items;
}

// 2. Heatmap data
async function getHeatmap(lat, lng, radiusKm = 10) {
  const response = await axios.get(`${API_BASE}/heatmap`, {
    params: {
      lat,
      lng,
      radiusKm,
      gridSize: 10,
      aggregateBy: "count",
    },
  });
  return response.data.data.grid;
}

// 3. Clustering
async function getClusters(lat, lng, zoomLevel = 12) {
  const response = await axios.get(`${API_BASE}/clusters`, {
    params: {
      lat,
      lng,
      zoomLevel,
      limit: 100,
    },
  });
  return response.data.data.clusters;
}

// 4. Polygon search
async function searchWithinPolygon(polygon, filters = {}) {
  const response = await axios.post(`${API_BASE}/within-boundary`, {
    polygon,
    filters,
    pagination: { limit: 50, skip: 0 },
  });
  return response.data.data.items;
}

// Usage examples:
(async () => {
  // Find pottery within 5km of Tehran center
  const pottery = await findNearby(35.6892, 51.389, 5);
  console.log("Found pottery:", pottery);

  // Get density heatmap
  const heatmap = await getHeatmap(35.6892, 51.389, 10);
  console.log("Heatmap cells:", heatmap.length);

  // Get clusters at city level
  const clusters = await getClusters(35.6892, 51.389, 12);
  console.log("Clusters:", clusters.length);

  // Search in custom region
  const inRegion = await searchWithinPolygon([
    [51.3, 35.65],
    [51.5, 35.65],
    [51.5, 35.75],
    [51.3, 35.75],
    [51.3, 35.65],
  ]);
  console.log("In region:", inRegion.length);
})();
```

### React/Frontend

```jsx
import { useEffect, useState } from "react";
import axios from "axios";

function MapComponent({ lat, lng, zoom }) {
  const [markers, setMarkers] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Use appropriate endpoint based on zoom
        if (zoom < 10) {
          // Heatmap for overview
          const res = await axios.get("/api/listings/heatmap", {
            params: { lat, lng, radiusKm: 20, gridSize: 10 },
          });
          setHeatmap(res.data.data.grid);
        } else if (zoom < 15) {
          // Clusters for navigation
          const res = await axios.get("/api/listings/clusters", {
            params: { lat, lng, radiusKm: 10, zoomLevel: zoom },
          });
          setClusters(res.data.data.clusters);
        } else {
          // Individual markers for detail
          const res = await axios.get("/api/listings/near", {
            params: { lat, lng, radiusKm: 5, limit: 100 },
          });
          setMarkers(res.data.data.items);
        }
      } catch (error) {
        console.error("Map data error:", error);
      }
    }

    fetchData();
  }, [lat, lng, zoom]);

  return (
    <div>
      {/* Render heatmap, clusters, or markers based on zoom */}
      {zoom < 10 && renderHeatmap(heatmap)}
      {zoom >= 10 && zoom < 15 && renderClusters(clusters)}
      {zoom >= 15 && renderMarkers(markers)}
    </div>
  );
}

export default MapComponent;
```

---

## See Also

- [GeoService Implementation](../../backend/services/GeoService.js)
- [Listing Model](../../backend/models/Listing.js)
- [Route Handlers](../../backend/routes/)
- [Performance Benchmarks](./GEOSPATIAL_PERFORMANCE_BENCHMARK.md)

---

_Last Updated: May 2026 | Nakhsha Geospatial API | Production-Ready_
