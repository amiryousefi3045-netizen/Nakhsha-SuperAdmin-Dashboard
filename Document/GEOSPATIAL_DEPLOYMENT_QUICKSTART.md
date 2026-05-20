# Geospatial API — Quick Start & Deployment Guide

## Quick Start (5 minutes)

### 1. Start Your Server

```bash
cd backend
npm install  # if not already done
npm start
```

The server runs on `http://localhost:3000` by default.

### 2. Verify Indexes

MongoDB indexes are auto-created on server startup (if `SYNC_INDEXES=true` environment variable is set). Verify:

```bash
# In MongoDB shell
use nakhsha
db.user_listings.getIndexes()

# Should show indexes:
# - location_geo_idx (2dsphere on location.coordinates)
# - location_category_idx
# - location_type_status_idx
# - location_price_status_idx
# - listings_text_idx
# - owner_location_status_idx
```

### 3. Test the API

```bash
# Basic nearby search
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5"

# With filters
curl "http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389&radiusKm=5&category=pottery&limit=20"

# Heatmap
curl "http://localhost:3000/api/listings/heatmap?lat=35.6892&lng=51.389&radiusKm=10&gridSize=10"

# Clusters
curl "http://localhost:3000/api/listings/clusters?lat=35.6892&lng=51.389&radiusKm=10&zoomLevel=12"

# Polygon search
curl -X POST http://localhost:3000/api/listings/within-boundary \
  -H "Content-Type: application/json" \
  -d '{
    "polygon": [
      [51.30, 35.65],
      [51.50, 35.65],
      [51.50, 35.75],
      [51.30, 35.75],
      [51.30, 35.65]
    ]
  }'
```

---

## Running Tests

### Unit Tests (GeoService)

```bash
cd backend
npm test -- __tests__/services/GeoService.test.js
```

**Expected:** 50+ tests covering validation, pipeline building, transformations

### Integration Tests

```bash
npm test -- __tests__/routes/geo-integration.test.js
```

**Expected:** 30+ tests covering all 4 endpoints with valid/invalid inputs

### All Tests

```bash
npm test
```

---

## Running Performance Benchmarks

```bash
# Small dataset (100 docs)
BENCHMARK_SIZE=small npm run benchmark

# Medium dataset (1000 docs) — default
npm run benchmark

# Large dataset (10000 docs)
BENCHMARK_SIZE=large npm run benchmark
```

**Output:** Report saved to `Document/GEOSPATIAL_PERFORMANCE_BENCHMARK.md`

**Expected times (medium dataset):**

- `/near`: 45-80 ms
- `/heatmap`: 120-250 ms
- `/clusters`: 60-150 ms
- `/within-boundary`: 80-180 ms

---

## Environment Configuration

### Required Environment Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/nakhsha

# API
NODE_ENV=production
PORT=3000

# Optional: Index Synchronization
SYNC_INDEXES=true  # Auto-create indexes on startup (slow, use for dev only)
```

### Optional Optimizations

```bash
# For production
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nakhsha?retryWrites=true&w=majority

# Rate limiting (requests per minute)
RATE_LIMIT_HEAVY=30

# Cache
REDIS_URL=redis://localhost:6379  # For optional caching
```

---

## Integration with Frontend

### Map Library Setup (Leaflet Example)

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<div id="map" style="height: 500px;"></div>

<script>
  const map = L.map("map").setView([35.6892, 51.389], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  map.on("moveend", async function () {
    const center = map.getCenter();
    const zoom = map.getZoom();

    // Choose endpoint based on zoom
    if (zoom < 10) {
      // Heatmap
      const res = await fetch(
        `/api/listings/heatmap?lat=${center.lat}&lng=${center.lng}&radiusKm=20&gridSize=10`,
      );
      const data = await res.json();
      renderHeatmap(data.data.grid);
    } else if (zoom < 15) {
      // Clusters
      const res = await fetch(
        `/api/listings/clusters?lat=${center.lat}&lng=${center.lng}&radiusKm=10&zoomLevel=${zoom}`,
      );
      const data = await res.json();
      renderClusters(data.data.clusters);
    } else {
      // Individual markers
      const res = await fetch(
        `/api/listings/near?lat=${center.lat}&lng=${center.lng}&radiusKm=5&limit=100`,
      );
      const data = await res.json();
      renderMarkers(data.data.items);
    }
  });

  function renderMarkers(items) {
    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    // Add new markers
    items.forEach((item) => {
      const [lng, lat] = item.coordinates;
      L.marker([lat, lng])
        .bindPopup(`<b>${item.title}</b><br>${item.price} تومان`)
        .addTo(map);
    });
  }

  function renderClusters(clusters) {
    // Render cluster markers with count badges
    // ... implementation
  }

  function renderHeatmap(grid) {
    // Render heatmap layer using leaflet-heat or similar
    // ... implementation
  }
</script>
```

---

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `SYNC_INDEXES=false` (indexes should be pre-created)
- [ ] Configure `MONGODB_URI` with production database
- [ ] Enable rate limiting: `RATE_LIMIT_HEAVY=30`
- [ ] Configure Redis for optional caching (if using)
- [ ] Run all tests: `npm test`
- [ ] Run benchmarks: `npm run benchmark`
- [ ] Verify all indexes exist in MongoDB
- [ ] Set up monitoring/logging (NewRelic, Datadog, etc.)
- [ ] Configure CORS for frontend domain
- [ ] Test all 4 geospatial endpoints
- [ ] Load test with 50+ concurrent requests
- [ ] Monitor database query times & memory

---

## Monitoring & Debugging

### View Slow Queries

```javascript
// MongoDB profiler (enable logging)
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().limit(5).sort({ ts: -1 }).pretty();
```

### Check Index Hit Rates

```javascript
db.user_listings.aggregate([{ $indexStats: {} }]);
```

### Monitor Rate Limiting

Endpoints are rate-limited to 30 requests/min per IP. Check headers:

```bash
curl -v http://localhost:3000/api/listings/near?lat=35.6892&lng=51.389

# Look for headers:
# X-RateLimit-Limit: 30
# X-RateLimit-Remaining: 29
# X-RateLimit-Reset: 1716232560
```

---

## Common Deployment Issues

### Issue: "No 2dsphere index found"

**Solution:**

```bash
SYNC_INDEXES=true npm start  # Run once to create indexes
```

Then disable for production:

```bash
SYNC_INDEXES=false npm start
```

### Issue: Queries timing out

**Check:**

1. MongoDB connection: `MONGODB_URI` valid?
2. Index exists: `db.user_listings.getIndexes()`
3. Dataset size: too many documents?
4. Query complexity: too many filters?

**Fix:**

- Increase timeout in `.env`: `QUERY_TIMEOUT=10000`
- Rebuild indexes: `db.user_listings.reIndex()`
- Optimize filters (use fewer complex conditions)

### Issue: High memory usage

**Check:**

- Result set size (use `limit` parameter)
- Grid size (heatmap generating too large grids?)
- Clustering precision (very detailed geohashes use memory)

**Fix:**

```bash
# Reduce limits
RESULT_LIMIT_MAX=250  # default 500

# Monitor memory
node --max-old-space-size=4096 server.js  # 4GB heap
```

---

## Performance Tuning

### Optimize for Speed

```javascript
// 1. Use pagination
GET /api/listings/near?lat=...&lng=...&limit=20&skip=0

// 2. Add filters to reduce result set
GET /api/listings/near?lat=...&lng=...&category=pottery

// 3. Reduce search radius
GET /api/listings/near?lat=...&lng=...&radiusKm=5

// 4. Use smaller grid size for heatmap
GET /api/listings/heatmap?...&gridSize=5
```

### Enable Caching (Optional)

If you have Redis installed:

```bash
npm install redis ioredis
REDIS_URL=redis://localhost:6379 npm start
```

Heatmap and cluster results are cached for 5 minutes.

### Monitor with New Relic

```bash
npm install newrelic
# Add to top of server.js:
require('newrelic');
```

---

## API Endpoints Summary

| Method | Path                            | Purpose                | Typical Time |
| ------ | ------------------------------- | ---------------------- | ------------ |
| GET    | `/api/listings/near`            | Nearby search (radius) | 45-80 ms     |
| GET    | `/api/listings/heatmap`         | Grid aggregation       | 120-250 ms   |
| GET    | `/api/listings/clusters`        | Geohash clustering     | 60-150 ms    |
| POST   | `/api/listings/within-boundary` | Polygon search         | 80-180 ms    |

---

## Documentation References

- **API Guide:** [GEOSPATIAL_API_COMPLETE_GUIDE.md](./GEOSPATIAL_API_COMPLETE_GUIDE.md)
- **Performance Benchmarks:** [GEOSPATIAL_PERFORMANCE_BENCHMARK.md](./GEOSPATIAL_PERFORMANCE_BENCHMARK.md)
- **GeoService Implementation:** [`backend/services/GeoService.js`](../backend/services/GeoService.js)
- **Listing Model:** [`backend/models/Listing.js`](../backend/models/Listing.js)
- **Route Handlers:** [`backend/routes/listings.*.js`](../backend/routes/)

---

_Nakhsha Geospatial API | Production-Ready | May 2026_
