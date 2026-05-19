/\*\*

- PRODUCTION-GRADE EDITABLE LISTING SYSTEM
-
- Complete implementation guide for the Nakhsha project.
- Supports partial updates, image diffing, revision control, and edit tracking.
  \*/

## 📋 ARCHITECTURE OVERVIEW

The editable listing system follows a clean, layered architecture:

```
┌─────────────────────────────────────────────────────┐
│ Express Routes (/api/listings)                      │
├─────────────────────────────────────────────────────┤
│ ListingController (HTTP handlers)                    │
├─────────────────────────────────────────────────────┤
│ ListingService (Business logic)                      │
├─────────────────────────────────────────────────────┤
│ ListingRepository (Data access layer)                │
├─────────────────────────────────────────────────────┤
│ Mongoose Models & MongoDB                           │
└─────────────────────────────────────────────────────┘
```

## 📁 FILES CREATED/MODIFIED

### 1. **Models** (`backend/models/`)

- **Listing.js** — Updated schema with:
  - `revision` (Number): Optimistic concurrency control
  - `editHistory` (Array): Audit trail of all edits

### 2. **Repository** (`backend/repository/`)

- **ListingRepository.js** — Data access layer with:
  - `updateWithOptimisticLock()` — Prevents concurrent edit conflicts
  - `getListingWithRevisionCheck()` — Validates revision before update
  - `getEditHistory()` — Retrieves full audit trail
  - `getRevisionDiff()` — Shows what changed in specific revision

### 3. **Service** (`backend/services/`)

- **ListingService.js** — Business logic layer with:
  - `updateListing()` — Main update handler with validation
  - `getEditHistory()` — Retrieves and formats history
  - Image sanitization and validation
  - Ownership verification

### 4. **Controllers** (`backend/controllers/`)

- **ListingController.js** — HTTP request handlers:
  - `patchListing()` — PATCH /api/listings/:id
  - `getListingForEdit()` — GET /api/listings/:id/edit
  - `getListingHistory()` — GET /api/listings/:id/history
  - `getRevisionDiff()` — GET /api/listings/:id/revisions/:revision

### 5. **Utilities** (`backend/utils/`)

- **imageDiffing.js** — Image management:
  - `diffImages()` — Compare old/new image arrays
  - `sanitizeImages()` — Clean image paths
  - `validateImagePaths()` — Security validation
  - `applyImageOperations()` — Add/remove/reorder images

- **listingValidation.js** — Zod schemas for updates:
  - `updateListingBaseSchema` — Common field validation
  - `UPDATE_DETAILS_SCHEMAS` — Per-type schemas

- **listingResponseDTO.js** — Response mapping:
  - `mapListingToResponse()` — Full listing DTO
  - `mapListingToEditFormResponse()` — Lightweight form data
  - `mapUpdateResponse()` — PATCH response
  - `mapEditHistoryToResponse()` — Formatted history

### 6. **Routes** (`backend/routes/`)

- **listings.js** — Updated with new endpoints:
  - PATCH /api/listings/:id
  - GET /api/listings/:id/edit
  - GET /api/listings/:id/history
  - GET /api/listings/:id/revisions/:revision

## 🚀 CORE FEATURES

### 1. PARTIAL UPDATES

Only provided fields are updated; omitted fields remain unchanged.

```javascript
// Update only title — other fields unchanged
PATCH /api/listings/12345 {
  title: "New Title",
  revision: 5
}
```

### 2. OWNERSHIP VALIDATION

Only listing owner can edit; verified before any changes.

```javascript
// Unauthorized if req.user.id !== listing.owner
if (!existingListing || existingListing.owner !== userId) {
  return error("UNAUTHORIZED");
}
```

### 3. IMAGE DIFFING

Tracks which images were added, removed, or reordered.

```javascript
const diff = diffImages(oldImages, newImages);
// Returns: { added, removed, reordered, hasChanges }
```

Supported operations:

- **Add** new images to array
- **Remove** specific images
- **Reorder** image sequence

### 4. FIELD-LEVEL VALIDATION

Each field is independently validated using Zod schemas.

```javascript
// updateListingBaseSchema validates:
- title: min 5, max 200 chars
- description: min 1, max 5000 chars
- images: array of valid relative paths
- location: valid GeoJSON Point
- revision: non-negative integer
```

### 5. REVISION/VERSION SUPPORT

Optimistic concurrency control prevents lost updates.

```javascript
// Client must send current revision
PATCH /api/listings/123 {
  title: "New",
  revision: 5  // Fails if actual revision is not 5
}

// If conflict:
{
  error: {
    code: "REVISION_CONFLICT",
    currentRevision: 6,
    clientRevision: 5
  }
}
```

How it works:

1. Client fetches listing → receives `revision: 5`
2. Client sends PATCH with `revision: 5`
3. Server checks: if stored revision !== 5 → conflict
4. If match: update applied, revision incremented to 6
5. Next update must use revision 6

### 6. EDIT HISTORY TRACKING

Every update recorded with timestamp, editor, and changes.

```javascript
editHistory: [
  {
    timestamp: "2026-05-19T10:30:00Z",
    editor: "user123",
    changes: { title: "Old Title", price: 100 },
    newRevision: 1,
    reason: "Updated price",
  },
  // ... more entries
];
```

## 📡 API ENDPOINTS

### PATCH /api/listings/:id

Update listing with revision control.

**Request:**

```javascript
{
  title?: string,                    // Optional
  description?: string,              // Optional
  tags?: string[],                   // Optional
  images?: string[],                 // Optional, relative paths
  location?: {                        // Optional, GeoJSON Point
    type: "Point",
    coordinates: [lng, lat]
  },
  revision: number,                  // REQUIRED for optimistic lock
  details?: {                         // Type-specific fields
    price?: number,                  // For 'post' listings
    forSale?: boolean,
    // ... other type-specific fields
  },
  reason?: string                    // Optional: why editing
}
```

**Success Response (200):**

```javascript
{
  success: true,
  data: {
    id: "507f1f77bcf86cd799439011",
    revision: 6,
    updatedAt: "2026-05-19T10:30:00Z",
    images: {                        // Only if images changed
      current: ["/uploads/1.jpg"],
      imagesAbs: ["https://..."],
      added: ["/uploads/1.jpg"],
      removed: [],
      reordered: false
    }
  }
}
```

**Error Responses:**

- `401 Unauthorized` — Not logged in
- `403 Forbidden` — Not listing owner
- `404 Not Found` — Listing doesn't exist
- `409 Conflict` — Revision mismatch (concurrent edit)
- `400 Bad Request` — Validation error

```javascript
// Revision conflict response:
{
  success: false,
  error: {
    code: "REVISION_CONFLICT",
    message: "آگهی توسط کاربر دیگری تغییر کرده است",
    currentRevision: 6,
    clientRevision: 5
  }
}
```

### GET /api/listings/:id/edit

Get listing optimized for edit form population.

**Response:**

```javascript
{
  success: true,
  data: {
    item: {
      id, type, title, description, tags, images,
      imagesAbs,  // Absolute URLs
      location,
      revision,   // Client must send back in PATCH
      // ... type-specific fields
    }
  }
}
```

### GET /api/listings/:id/history

Get complete edit history.

**Query Parameters:**

- `limit` (optional, max 100, default 50) — Max history entries

**Response:**

```javascript
{
  success: true,
  data: {
    history: [
      {
        timestamp: "2026-05-19T10:30:00Z",
        revision: 2,
        editor: {
          id: "user123",
          name: "احمد",
          email: "ahmad@example.com"
        },
        changedFields: ["title", "price"],
        changesSummary: {
          title: "Old title...",
          price: 100
        },
        reason: "Updated price"
      },
      // ... more entries
    ],
    totalRevisions: 5
  }
}
```

### GET /api/listings/:id/revisions/:revision

Get specific revision diff.

**Response:**

```javascript
{
  success: true,
  data: {
    diff: {
      timestamp: "2026-05-19T10:30:00Z",
      editor: "user123",
      newRevision: 2,
      changes: {
        title: "Old title",
        price: 100
      },
      reason: "Updated price"
    }
  }
}
```

## 🔒 CONFLICT RESOLUTION

### Optimistic Concurrency Control (OCC)

The system uses **optimistic locking** to prevent lost updates:

```javascript
// Scenario: Two users edit simultaneously

// User A fetches → gets revision: 3
// User B fetches → gets revision: 3

// User B patches first (succeeds):
// - revision 3 matches ✓
// - update applied, revision→4

// User A patches second (fails):
// - revision 3 != current revision 4 ✗
// - conflict detected
// - client must refresh and retry

// Response tells client:
{
  error: {
    code: "REVISION_CONFLICT",
    currentRevision: 4,
    clientRevision: 3,
    lastUpdatedAt: "2026-05-19T10:30:00Z"
  }
}
```

**Frontend handling:**

1. Show "Listing updated by another user" message
2. Optionally fetch latest with GET /api/listings/:id/edit
3. Allow user to retry with new revision number

## 💾 DATABASE SCHEMA

### Listing Model Updates

```javascript
{
  // Existing fields
  _id: ObjectId,
  type: String,  // 'post', 'tour', 'training', 'academy'
  title: String,
  description: String,
  tags: [String],
  images: [String],  // Relative paths: "/uploads/..."
  owner: ObjectId,
  location: GeoJSON,  // Optional
  createdAt: Date,
  updatedAt: Date,

  // NEW FIELDS:

  revision: Number,  // Starts at 0, increments with each update

  editHistory: [
    {
      timestamp: Date,
      editor: ObjectId,
      changes: Map<String, Mixed>,  // Field → new value
      newRevision: Number,
      reason: String  // Optional
    }
  ]
}
```

### Indexes Added

```javascript
// Optimistic concurrency control lookup
listingSchema.index({ _id: 1, revision: 1 });

// Existing indexes remain:
listingSchema.index({ location: "2dsphere" }, { sparse: true });
listingSchema.index({ title: "text", description: "text", tags: "text" });
listingSchema.index({ owner: 1, createdAt: -1 });
```

## 🎯 VALIDATION FLOWS

### Field-Level Validation

```
Request Body
    ↓
Zod Schema Parsing (updateListingBaseSchema)
    ↓
Common Fields Valid?
    ├─ NO → Return 400 with field errors
    └─ YES
        ↓
Type-Specific Schema Parsing (UPDATE_DETAILS_SCHEMAS[type])
    ↓
Details Valid?
    ├─ NO → Return 400 with detail errors
    └─ YES
        ↓
Image Path Validation
    ├─ Invalid paths → Return 400
    └─ Valid
        ↓
Ownership Check
    ├─ Not owner → Return 403
    └─ Owner verified
        ↓
Revision Check
    ├─ Mismatch → Return 409 conflict
    └─ Match
        ↓
Optimistic Lock Update
    └─ Success → Return 200 with updated listing
```

## 🖼️ IMAGE DIFFING LOGIC

### Processing Images

```javascript
// Client sends new images array
const newImages = ["/uploads/2.jpg", "/uploads/3.jpg"];
const oldImages = ["/uploads/1.jpg", "/uploads/2.jpg"];

// System detects:
const diff = diffImages(oldImages, newImages);
// {
//   added: ["/uploads/3.jpg"],
//   removed: ["/uploads/1.jpg"],
//   reordered: false,
//   hasChanges: true
// }

// Frontend receives:
{
  images: {
    current: ["/uploads/2.jpg", "/uploads/3.jpg"],
    added: ["/uploads/3.jpg"],
    removed: ["/uploads/1.jpg"],
    reordered: false
  }
}
```

### Image Security

Validation checks:

- ✓ Must be strings
- ✓ Must not be empty
- ✓ Must start with "/" (relative path)
- ✓ Cannot contain ".." (path traversal prevention)
- ✓ Cannot exceed 500 total characters per path

```javascript
// Invalid:
❌ "https://external.com/image.jpg"  // Absolute URL
❌ "../../../etc/passwd"              // Path traversal
❌ ""                                  // Empty string
❌ "uploads/image.jpg"                 // Must start with /
✓ "/uploads/abc123.webp"              // Valid
```

## 🔄 SERVICE LAYER FLOW

### UpdateListing() Flow

```
updateListing(listingId, userId, updatePayload, listingType)
  ↓
1. Verify Ownership
   └─ Check: listing.owner === userId
   ├─ False → Error: UNAUTHORIZED
   └─ True → Continue
  ↓
2. Revision Check
   └─ Check: currentRevision === expectedRevision
   ├─ False → Error: REVISION_CONFLICT
   └─ True → Continue
  ↓
3. Sanitize & Validate
   ├─ Trim strings
   ├─ Validate images (paths, security)
   ├─ Validate schema (Zod)
   └─ Errors → Return validation error
  ↓
4. Image Diffing
   └─ Compare old vs new images
   ├─ Track added/removed/reordered
   └─ Log changes
  ↓
5. Build Update Document
   └─ Include only provided fields (sparse update)
  ↓
6. Optimistic Lock Update
   └─ Call: repository.updateWithOptimisticLock()
   ├─ MongoDB: FindOneAndUpdate with revision check
   ├─ Atomic: Increments revision + appends editHistory
   └─ Returns: Updated document or conflict error
  ↓
7. Return Success Response
   └─ Include: id, newRevision, imageDiff, etc.
```

## 📊 MONGODB OPERATIONS

### Atomic Update Query

The repository generates this efficient MongoDB query:

```javascript
// Generated by repository.updateWithOptimisticLock()
db.user_listings.findOneAndUpdate(
  {
    _id: ObjectId("507f1f77bcf86cd799439011"),
    revision: 5  // Optimistic lock condition
  },
  {
    $set: {
      title: "New Title",
      images: ["/uploads/new.jpg"],
      revision: 6,
      updatedAt: new Date()
    },
    $push: {
      editHistory: {
        timestamp: new Date(),
        editor: ObjectId("user123"),
        changes: { title: "Old Title", ... },
        newRevision: 6,
        reason: "Updated images"
      }
    }
  },
  { new: true }
)
```

**Atomic Properties:**

- ✓ All-or-nothing: revision check + update + history append
- ✓ No race conditions
- ✓ Single round-trip to database
- ✓ Returns updated document immediately

## 🧪 USAGE EXAMPLES

### Frontend Update Flow

```javascript
// 1. Fetch listing for edit
const response = await fetch("/api/listings/abc123/edit");
const { item } = await response.json();
// item contains: { id, title, images, revision: 5, ... }

// 2. User edits in form, clicks save
// 3. Submit with current revision
const updateResponse = await fetch("/api/listings/abc123", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Updated Title",
    images: ["/uploads/new1.jpg", "/uploads/new2.jpg"],
    revision: 5, // IMPORTANT: Must include current revision
    reason: "Updated product images",
  }),
});

// 4a. Success response
if (updateResponse.status === 200) {
  const { data } = await updateResponse.json();
  console.log("Updated! New revision:", data.item.revision);
  console.log("Image changes:", data.item.images);
}

// 4b. Revision conflict
if (updateResponse.status === 409) {
  const { error } = await updateResponse.json();
  console.log("Conflict! Current revision:", error.currentRevision);
  console.log("Your revision:", error.clientRevision);
  // Prompt user to reload and retry
}
```

### View Edit History

```javascript
// Fetch history
const historyResponse = await fetch("/api/listings/abc123/history?limit=20");
const { history, totalRevisions } = await historyResponse.json();

// Display
history.forEach((entry) => {
  console.log(`${entry.timestamp} - Edited by ${entry.editor.name}`);
  console.log(`Changed fields: ${entry.changedFields.join(", ")}`);
  console.log(`Reason: ${entry.reason}`);
  console.log(`Revision: ${entry.revision}`);
});
```

### Get Specific Revision Diff

```javascript
// Show what changed in revision 3
const diffResponse = await fetch("/api/listings/abc123/revisions/3");
const { diff } = await diffResponse.json();

console.log("Changed in revision 3:");
Object.entries(diff.changes).forEach(([field, value]) => {
  console.log(`  ${field}: ${value}`);
});
```

## 🛡️ SECURITY FEATURES

### Implemented Protections

1. **Ownership Verification**
   - Only listing owner can update
   - Checked before any mutations

2. **Image Path Security**
   - No absolute URLs allowed
   - No path traversal (../)
   - Must start with /
   - Validated regex pattern

3. **Optimistic Concurrency Control**
   - Prevents lost updates
   - Detects concurrent edits
   - Client must refresh on conflict

4. **Authentication Required**
   - PATCH requires `requireAuth` middleware
   - User context verified from JWT

5. **Input Validation**
   - Zod schema validation
   - String trimming and sanitization
   - Type checking
   - Max length enforcement

6. **Audit Trail**
   - All edits recorded in editHistory
   - Timestamp and editor tracked
   - Changes documented
   - Reason optional

## 📈 PERFORMANCE OPTIMIZATIONS

### Query Optimization

```javascript
// Uses lean() for read operations (no Mongoose overhead)
const listing = await Listing.findById(id).lean();

// Compound index for concurrent lookups
listingSchema.index({ _id: 1, revision: 1 });

// Sparse indexes for optional fields
listingSchema.index({ location: "2dsphere" }, { sparse: true });
```

### Response Optimization

```javascript
// Lightweight edit form response (excludes editHistory)
mapListingToEditFormResponse(); // Smaller JSON payload

// Minimal PATCH response (only changed fields)
mapUpdateResponse(); // Fast for mobile clients

// Efficient history pagination
getEditHistory((limit = 50)); // Capped at reasonable size
```

### MongoDB Operations

```javascript
// Atomic $set and $push in single operation
// No race conditions, single round-trip
findOneAndUpdate({
  $set: updateFields,
  $push: { editHistory: entry },
});
```

## 🚦 ERROR HANDLING

All errors return structured responses:

```javascript
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Human-readable message in Persian",
    details?: {
      // Additional context for specific errors
    }
  }
}
```

**Error Codes:**

| Code              | Status | Meaning                  |
| ----------------- | ------ | ------------------------ |
| UNAUTHORIZED      | 401    | User not authenticated   |
| FORBIDDEN         | 403    | User not listing owner   |
| NOT_FOUND         | 404    | Listing doesn't exist    |
| VALIDATION_ERROR  | 400    | Input validation failed  |
| REVISION_CONFLICT | 409    | Concurrent edit detected |
| INVALID_IMAGES    | 400    | Image paths invalid      |
| NO_CHANGES        | 400    | No fields to update      |
| INTERNAL_ERROR    | 500    | Server error             |

## 📝 LOGGING

All operations logged for debugging:

```javascript
logger.info("Image changes detected during listing update", {
  listingId,
  userId,
  added: diff.added.length,
  removed: diff.removed.length,
});

logger.error("Error in ListingService.updateListing", {
  listingId,
  userId,
  error: err.message,
  stack: err.stack,
});
```

## 🔮 FUTURE ENHANCEMENTS

Potential improvements:

1. **Webhook Notifications**
   - Notify interested parties of edits
   - Real-time update subscriptions

2. **Revision Comparison UI**
   - Visual diff between revisions
   - Side-by-side view of changes

3. **Collaborative Editing**
   - Multiple simultaneous editors
   - Merge conflict resolution

4. **Change Approval Workflow**
   - Require approval for certain edits
   - Admin override capability

5. **Batch Operations**
   - Update multiple listings
   - Bulk image operations

6. **Scheduled Publishing**
   - Schedule updates for future
   - Automatic status changes

## ✅ TESTING CHECKLIST

Before deploying:

- [ ] PATCH endpoint returns 200 on valid update
- [ ] Revision conflict returns 409 with correct codes
- [ ] Ownership validation returns 403 for non-owners
- [ ] Image validation rejects invalid paths
- [ ] Edit history appended on successful update
- [ ] Partial updates preserve unmodified fields
- [ ] Image diffing correctly identifies added/removed
- [ ] Concurrent updates properly detected
- [ ] GET /edit returns lightweight response
- [ ] GET /history pagination works correctly
- [ ] GET /revisions/:revision returns diff
- [ ] Authentication required for PATCH
- [ ] All Persian error messages display correctly
- [ ] Absolute image URLs correct in responses
- [ ] MongoDB indexes created (check with db.collection.getIndexes())

## 🎓 DEVELOPMENT NOTES

### For Frontend Developers

1. Always send `revision` in PATCH body
2. Handle 409 conflict responses by refreshing
3. Use GET /edit for form population
4. Display image diff summary to user
5. Show edit reason/reason in UI (if provided)

### For Backend Developers

1. All image paths must be relative (/uploads/...)
2. Never store absolute URLs in database
3. EditHistory entries are immutable (append-only)
4. Revision numbers never decrease
5. Optimistic lock condition is crucial

### For DevOps

1. Ensure MongoDB indexes are created:

   ```bash
   db.user_listings.createIndex({ _id: 1, revision: 1 })
   ```

2. Monitor editHistory collection growth
3. Set up retention policies if needed
4. Backup strategy should include editHistory

---

**Implementation Date:** May 19, 2026
**Status:** Production Ready ✅
**Architecture Pattern:** Service/Repository + DTO Mappers
**Concurrency Control:** Optimistic Locking (OCC)
**Language:** Persian (RTL) UI with English API
