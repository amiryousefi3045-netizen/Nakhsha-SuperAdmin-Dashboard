# MongoDB Production Hardening - Verification Checklist

Use this checklist to verify the MongoDB hardening implementation.

---

## Pre-Deployment Checklist

### ✅ Code Review

- [ ] User model has 5 production indexes (phone, handle, createdAt, location.geometry, role+isVerified)
- [ ] OtpCode model has 4 indexes including TTL on expiresAt
- [ ] Craft model has 9+ indexes including 2dsphere on location.geometry
- [ ] Post model has 6 indexes including 2dsphere on location.geometry
- [ ] All geolocation fields use GeoJSON Point format with validation
- [ ] Coordinate validators check longitude (-180 to 180) and latitude (-90 to 90)
- [ ] server.js includes index synchronization logging in connectDB()
- [ ] docker-compose.yml includes WiredTiger configuration

### ✅ Schema Validation

- [ ] All unique indexes are marked with `{ unique: true }`
- [ ] Sparse indexes use `{ sparse: true }` for optional fields
- [ ] Compound indexes are in optimal order (most selective field first)
- [ ] TTL index on OtpCode uses `{ expireAfterSeconds: 0 }`
- [ ] 2dsphere indexes use correct path (e.g., "location.geometry")

---

## Post-Deployment Checklist

### ✅ Startup Verification

Start the backend and check logs:

```bash
docker-compose up backend
```

Expected log entries:

- [ ] "MongoDB connected successfully"
- [ ] "Synchronizing database indexes..."
- [ ] "✓ All model indexes synchronized successfully"
- [ ] "✓ users: 5 indexes active"
- [ ] "✓ otpcodes: 4 indexes active"
- [ ] "✓ crafts (listings): 9 indexes active"
- [ ] "✓ posts: 6 indexes active"
- [ ] "✓ Geospatial index verified for crafts (nearby search ready)"
- [ ] "✓ TTL index verified for OTP codes (auto-cleanup enabled)"
- [ ] "OTP cleanup service started"

### ✅ Database Verification

Connect to MongoDB and verify indexes:

```bash
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123
```

#### Users Collection

```javascript
use nakhsha
db.users.getIndexes()
```

Expected indexes:

- [ ] `_id_` (default)
- [ ] `phone_1` (unique)
- [ ] `handle_1` (unique, sparse)
- [ ] `createdAt_-1`
- [ ] `location.geometry_2dsphere` (sparse)
- [ ] `role_1_isVerified_1`

#### OtpCodes Collection

```javascript
db.otpcodes.getIndexes();
```

Expected indexes:

- [ ] `_id_` (default)
- [ ] `phone_1`
- [ ] `expiresAt_1` (TTL, expireAfterSeconds: 0)
- [ ] `phone_1_blockedUntil_1`
- [ ] `createdAt_1`

#### Listings Collection (Crafts)

```javascript
db.listings.getIndexes();
```

Expected indexes:

- [ ] `_id_` (default)
- [ ] `location.geometry_2dsphere`
- [ ] `author_1_createdAt_-1`
- [ ] `createdAt_-1`
- [ ] `isPublished_1_createdAt_-1`
- [ ] `kind_1_isPublished_1_createdAt_-1`
- [ ] `craftType_1_isPublished_1`
- [ ] `craft_text_search` (text index)
- [ ] `likes.user_1`
- [ ] `dislikes.user_1`

#### Posts Collection

```javascript
db.posts.getIndexes();
```

Expected indexes:

- [ ] `_id_` (default)
- [ ] `location.geometry_2dsphere`
- [ ] `owner_1_createdAt_-1`
- [ ] `createdAt_-1`
- [ ] `status_1_createdAt_-1`
- [ ] `owner_1_status_1`
- [ ] `category_1_status_1_createdAt_-1`

---

## Functional Testing

### ✅ Authentication (User Model)

Test phone uniqueness:

```bash
# First registration should succeed
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "09123456789"}'

# Second registration with same phone should fail
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "09123456789"}'
```

Expected:

- [ ] First request: Success (201 Created)
- [ ] Second request: Error (409 Conflict - duplicate phone)

### ✅ OTP Auto-Cleanup (OtpCode Model)

Test TTL index:

```javascript
// Insert test OTP with 10-second expiry
db.otpcodes.insertOne({
  phone: "09999999999",
  codeHash: "test_hash",
  expiresAt: new Date(Date.now() + 10000), // 10 seconds
  createdAt: new Date(),
  attempts: 0,
  resendCount: 0,
});

// Verify it exists
db.otpcodes.findOne({ phone: "09999999999" });

// Wait 70 seconds (TTL cleanup runs every 60s)
// Check again - should be deleted
db.otpcodes.findOne({ phone: "09999999999" });
```

Expected:

- [ ] OTP exists immediately after insert
- [ ] OTP is automatically deleted after ~70 seconds
- [ ] No manual cleanup required

### ✅ Geospatial Queries (Craft Model)

Test nearby search:

```bash
# Search for crafts near Tehran (51.42°E, 35.69°N)
curl "http://localhost:5000/api/listings/near?lng=51.42&lat=35.69&maxDistance=5000"
```

Expected:

- [ ] Query executes successfully (uses 2dsphere index)
- [ ] Results sorted by distance
- [ ] Response time < 100ms for indexed query

Test invalid coordinates:

```bash
# Try to create craft with invalid coordinates
curl -X POST http://localhost:5000/api/crafts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "description": "Test",
    "kind": "artwork",
    "location": {
      "city": "Tehran",
      "geometry": {
        "type": "Point",
        "coordinates": [999, 999]
      }
    }
  }'
```

Expected:

- [ ] Request fails with validation error
- [ ] Error message: "مختصات جغرافیایی نامعتبر است"

### ✅ Feed Sorting (Craft Model)

Test user's craft feed:

```bash
# Get user's crafts sorted by date
curl "http://localhost:5000/api/crafts?author=USER_ID"
```

Expected:

- [ ] Results sorted by createdAt (newest first)
- [ ] Query uses compound index (author*1_createdAt*-1)
- [ ] No in-memory sort required

### ✅ Text Search (Craft Model)

Test full-text search:

```bash
# Search crafts by keyword
curl "http://localhost:5000/api/crafts/search?q=pottery"
```

Expected:

- [ ] Query executes successfully
- [ ] Uses text index (craft_text_search)
- [ ] Weighted results (title matches ranked higher)

---

## Performance Testing

### ✅ Query Explain

Verify indexes are being used:

```javascript
// User lookup by phone (should use phone_1 index)
db.users.find({ phone: "09123456789" }).explain("executionStats");

// Check output:
// - executionStats.executionSuccess: true
// - executionStats.totalDocsExamined: 1 (not full collection scan)
// - winningPlan.inputStage.indexName: "phone_1"
```

Expected:

- [ ] `executionSuccess: true`
- [ ] `totalDocsExamined` equals number of results (not full collection)
- [ ] `indexName` matches expected index

```javascript
// Craft nearby search (should use 2dsphere index)
db.listings
  .find({
    "location.geometry": {
      $near: {
        $geometry: { type: "Point", coordinates: [51.42, 35.69] },
        $maxDistance: 5000,
      },
    },
  })
  .explain("executionStats");
```

Expected:

- [ ] Uses `location.geometry_2dsphere` index
- [ ] `stage: "GEO_NEAR_2DSPHERE"`

```javascript
// User feed sorted by date (should use compound index)
db.listings
  .find({ author: ObjectId("...") })
  .sort({ createdAt: -1 })
  .explain("executionStats");
```

Expected:

- [ ] Uses `author_1_createdAt_-1` index
- [ ] No in-memory sort (`stage` should NOT be "SORT")

---

## Monitoring

### ✅ Index Usage Statistics

Check which indexes are being used:

```javascript
db.listings.aggregate([{ $indexStats: {} }]).forEach((stat) => {
  print(`Index: ${stat.name}`);
  print(`Accesses: ${stat.accesses.ops}`);
  print("---");
});
```

Expected:

- [ ] 2dsphere index shows activity (if nearby queries run)
- [ ] Compound indexes show activity
- [ ] Unused indexes can be removed

### ✅ Slow Query Log

Check for slow queries:

```bash
docker logs nakhsha-mongodb | grep "slow query"
```

Expected:

- [ ] No slow queries for indexed operations
- [ ] Any slow queries should be investigated

---

## Docker Configuration

### ✅ MongoDB Settings

Verify WiredTiger configuration:

```bash
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123 --eval "db.serverStatus().storageEngine"
```

Expected output:

- [ ] `name: "wiredTiger"`
- [ ] `supportsCommittedReads: true`
- [ ] Compression enabled

### ✅ Volume Persistence

Verify data persists after restart:

```bash
# Insert test document
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123 nakhsha --eval \
  'db.test.insertOne({ test: true })'

# Restart container
docker-compose restart mongodb

# Check document still exists
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123 nakhsha --eval \
  'db.test.findOne({ test: true })'
```

Expected:

- [ ] Document persists after restart
- [ ] Volumes are properly configured

---

## Rollback Verification

### ✅ Safe Rollback

If needed, verify indexes can be safely removed:

```javascript
// Drop a non-critical index
db.users.dropIndex("createdAt_-1");

// Application should still work (just slower for that query)
// Recreate index
db.users.createIndex({ createdAt: -1 });
```

Expected:

- [ ] Index drops without errors
- [ ] Application continues running
- [ ] Index can be recreated

---

## Sign-Off

After completing all checks:

- [ ] All indexes verified in database
- [ ] Startup logs show successful synchronization
- [ ] Authentication queries use phone index
- [ ] OTP auto-cleanup working (TTL index)
- [ ] Nearby search working (2dsphere index)
- [ ] Invalid coordinates rejected
- [ ] Feed sorting uses compound indexes
- [ ] Text search working
- [ ] Query explain shows index usage
- [ ] Docker configuration optimized
- [ ] Volume persistence verified

**Deployment Status:** ✅ Ready for Production

---

**Verified By:** ********\_********  
**Date:** ********\_********  
**Environment:** Staging / Production
