# Draft Autosave API - Complete Reference

## Overview

The Draft Autosave system enables production-grade multi-step form persistence with optimistic concurrency control, change detection, and automatic cleanup.

**Key Features:**
- Separate `drafts` collection for isolation from published listings
- Optimistic locking via `_version` field to prevent race conditions
- Change detection (only increments version on actual field changes)
- TTL auto-deletion after 90 days of inactivity
- Support for all listing types (post, tour, training, academy)
- Partial updates for multi-step forms
- Ownership validation on all operations
- Frontend-friendly conflict responses

---

## API Endpoints

### 1. Create Draft
**Endpoint:** `POST /api/listings/draft`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "type": "post",
  "currentStep": 1,
  "isCompleted": false,
  "title": "Handmade Carpet",
  "description": "Beautiful traditional carpet",
  "tags": ["carpet", "traditional"],
  "images": [],
  "price": 500000,
  "forSale": true,
  "category": "textiles"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "type": "post",
      "status": "active",
      "owner": "64d1a2b3c4d5e6f7g8h9i0j1",
      "currentStep": 1,
      "isCompleted": false,
      "_version": 0,
      "draftVersion": 0,
      "lastAutosavedAt": "2025-05-19T10:30:00Z",
      "createdAt": "2025-05-19T10:30:00Z",
      "updatedAt": "2025-05-19T10:30:00Z",
      "title": "Handmade Carpet",
      "description": "Beautiful traditional carpet",
      "tags": ["carpet", "traditional"],
      "images": [],
      "price": 500000,
      "forSale": true,
      "category": "textiles"
    }
  },
  "reqId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (400 - Invalid Type):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid draft type"
  },
  "reqId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 2. Autosave Draft
**Endpoint:** `PATCH /api/listings/:id/draft`

**Authentication:** Required (Bearer token)

**Key Concept:** Implements optimistic locking. Client must provide `_version` matching the current DB version.

**Request Body (Step 2 - Add Price & Category):**
```json
{
  "_version": 0,
  "currentStep": 2,
  "data": {
    "price": 550000,
    "category": "carpet"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "type": "post",
      "currentStep": 2,
      "_version": 1,
      "draftVersion": 1,
      "lastAutosavedAt": "2025-05-19T10:35:00Z",
      "price": 550000,
      "category": "carpet"
    },
    "changedFields": ["price", "category"],
    "hasChanges": true
  },
  "reqId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (409 - Version Conflict):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Draft was updated elsewhere. Please refresh.",
    "currentVersion": 2,
    "expectedVersion": 0,
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "_version": 2,
      "draftVersion": 1,
      "title": "Updated Title",
      "price": 600000
    }
  },
  "reqId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**No-op Save (No Changes Detected):**
```json
{
  "_version": 1,
  "currentStep": 2,
  "data": {}
}
```

**Response (200 OK - Version NOT incremented):**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_version": 1,
      "draftVersion": 1
    },
    "changedFields": [],
    "hasChanges": false
  }
}
```

---

### 3. Get Latest Draft
**Endpoint:** `GET /api/listings/draft/latest`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `type` (optional): Filter by type (post|tour|training|academy)

**Request:**
```bash
GET /api/listings/draft/latest?type=post
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "type": "post",
      "currentStep": 2,
      "_version": 1,
      "draftVersion": 1,
      "lastAutosavedAt": "2025-05-19T10:35:00Z",
      "title": "Handmade Carpet",
      "description": "Beautiful traditional carpet"
    }
  }
}
```

**Error Response (404 - No Draft Found):**
```json
{
  "success": false,
  "error": {
    "code": "DRAFT_NOT_FOUND",
    "message": "No active draft found"
  }
}
```

---

### 4. Get Draft by ID
**Endpoint:** `GET /api/listings/draft/:id`

**Authentication:** Required (Bearer token)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "type": "post",
      "status": "active",
      "currentStep": 2,
      "_version": 1,
      "draftVersion": 1,
      "title": "Handmade Carpet",
      "description": "Beautiful traditional carpet",
      "tags": ["carpet", "traditional"],
      "price": 550000,
      "forSale": true,
      "category": "carpet"
    }
  }
}
```

---

### 5. List All Drafts (Paginated)
**Endpoint:** `GET /api/listings/draft`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `limit` (default: 10, max: 100): Number of drafts per page
- `skip` (default: 0): Pagination offset

**Request:**
```bash
GET /api/listings/draft?limit=10&skip=0
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "drafts": [
      {
        "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
        "type": "post",
        "title": "Handmade Carpet",
        "currentStep": 2,
        "_version": 1,
        "lastAutosavedAt": "2025-05-19T10:35:00Z"
      },
      {
        "_id": "65e8a1b2c3d4e5f6g7h8i9j1",
        "type": "tour",
        "title": "Tehran City Tour",
        "currentStep": 1,
        "_version": 0,
        "lastAutosavedAt": "2025-05-19T10:30:00Z"
      }
    ],
    "total": 12,
    "hasMore": true,
    "limit": 10,
    "skip": 0
  }
}
```

---

### 6. Delete Draft
**Endpoint:** `DELETE /api/listings/draft/:id`

**Authentication:** Required (Bearer token)

**Behavior:** Soft-deletes by marking status as "discarded"

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Draft deleted successfully"
  }
}
```

---

### 7. Publish Draft to Listing
**Endpoint:** `POST /api/listings/:draftId/publish`

**Authentication:** Required (Bearer token)

**Request Body (Optional - Final Data Overrides):**
```json
{
  "title": "Final Title Override"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "listing": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j2",
      "type": "post",
      "title": "Handmade Carpet",
      "description": "Beautiful traditional carpet",
      "owner": "64d1a2b3c4d5e6f7g8h9i0j1",
      "draftId": "65e8a1b2c3d4e5f6g7h8i9j0",
      "status": "published",
      "price": 550000,
      "forSale": true,
      "tags": ["carpet", "traditional"],
      "createdAt": "2025-05-19T10:40:00Z"
    },
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "status": "published",
      "listingId": "65e8a1b2c3d4e5f6g7h8i9j2"
    },
    "message": "Draft published successfully"
  }
}
```

**Error Response (422 - Incomplete Draft):**
```json
{
  "success": false,
  "error": {
    "code": "INCOMPLETE_DRAFT",
    "message": "Missing required fields: description, price",
    "missingFields": ["description", "price"]
  }
}
```

---

### 8. Get Draft Statistics
**Endpoint:** `GET /api/listings/draft/stats/:userId`

**Authentication:** Required (Bearer token)

**Authorization:** Users can only view their own stats (or admins can view any user's)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "activeCount": 3,
      "publishedCount": 15,
      "discardedCount": 2,
      "typeDistribution": {
        "post": 5,
        "tour": 2,
        "training": 3,
        "academy": 1
      }
    }
  }
}
```

---

## Multi-Step Form Workflow

### Frontend Autosave Flow

```javascript
// 1. User starts form - Create draft
const draftResponse = await fetch('/api/listings/draft', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ type: 'post', currentStep: 1 })
});
const { data: { draft } } = await draftResponse.json();
const draftId = draft._id;
const currentVersion = draft._version;

// Store in state/context
setState({ draftId, currentVersion, currentStep: 1 });

// 2. User fills Step 1 (Title, Description) - Debounced autosave
const autosave = debounce(async (data) => {
  const response = await fetch(`/api/listings/${draftId}/draft`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      _version: currentVersion,
      currentStep: 1,
      data: {
        title: data.title,
        description: data.description,
        tags: data.tags
      }
    })
  });
  
  const result = await response.json();
  
  if (response.status === 409) {
    // Version conflict - show conflict UI
    showConflictDialog(result.error.draft);
    // Reload draft or merge intelligently
    const latestDraft = await fetch('/api/listings/draft/latest');
    setState(await latestDraft.json());
  } else if (result.success) {
    // Update local version
    setState({ 
      currentVersion: result.data.draft._version,
      hasUnsavedChanges: false,
      lastAutosavedAt: result.data.draft.lastAutosavedAt
    });
  }
}, 5000); // Autosave every 5 seconds after last keystroke

// 3. User moves to Step 2 - Explicit save before step change
async function handleStepChange(nextStep) {
  const response = await fetch(`/api/listings/${draftId}/draft`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      _version: currentVersion,
      currentStep: nextStep,
      data: { /* step 2 specific fields */ }
    })
  });
  
  if (response.ok) {
    const { data } = await response.json();
    setState({ 
      currentVersion: data.draft._version,
      currentStep: nextStep 
    });
  }
}

// 4. User completes form - Publish to listing
async function handleSubmit() {
  const response = await fetch(`/api/listings/${draftId}/publish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ /* final overrides */ })
  });
  
  const result = await response.json();
  
  if (result.success) {
    const listingId = result.data.listing._id;
    navigate(`/listings/${listingId}`);
  } else if (response.status === 422) {
    // Show missing fields error
    setErrors(result.error.missingFields);
  }
}
```

---

## Conflict Resolution Strategy

When `_version` mismatch (409 Conflict) occurs:

```javascript
// Option 1: Strict Last-Write-Wins (Current)
// Client receives conflict error with current server state
// Frontend must decide: reload, discard local, or custom merge

// Option 2: Merge-Friendly (Future Enhancement)
// Server intelligently merges non-conflicting fields:
// - Arrays (tags, images): union/dedup
// - Dates: take later value
// - Strings: notify user to choose

// Response body includes conflicting version for inspection:
{
  "error": {
    "code": "VERSION_CONFLICT",
    "currentVersion": 5,
    "expectedVersion": 2,
    "draft": { /* server's latest state */ }
  }
}
```

---

## Tour Discriminator Example

### Create Tour Draft
```json
{
  "type": "tour",
  "currentStep": 1,
  "title": "Mountain Adventure Tour",
  "description": "3-day hiking expedition"
}
```

### Autosave Tour Details (Step 2)
```json
{
  "_version": 0,
  "currentStep": 2,
  "data": {
    "startDate": "2025-06-15T09:00:00Z",
    "endDate": "2025-06-18T18:00:00Z",
    "duration": "3 days",
    "durationDays": 3,
    "capacity": 15,
    "itinerary": ["Day 1: Base camp setup", "Day 2: Summit hike", "Day 3: Descent"]
  }
}
```

---

## Training Discriminator Example

### Create Training Draft
```json
{
  "type": "training",
  "currentStep": 1,
  "title": "Traditional Carpet Weaving Course",
  "description": "Learn ancient Persian weaving techniques"
}
```

### Autosave Schedule (Step 2)
```json
{
  "_version": 0,
  "currentStep": 2,
  "data": {
    "level": "beginner",
    "capacity": 10,
    "startDate": "2025-06-01T14:00:00Z",
    "endDate": "2025-08-30T16:00:00Z",
    "schedule": "Weekly: Monday 14:00-16:00, Wednesday 14:00-16:00",
    "instructor": "Master Weaver Ali"
  }
}
```

---

## Academy Discriminator Example

### Create Academy Draft
```json
{
  "type": "academy",
  "title": "Ceramic Art Institute",
  "description": "Comprehensive ceramic arts education"
}
```

### Autosave Details
```json
{
  "_version": 0,
  "data": {
    "addressDetails": "123 Art Street, Isfahan",
    "phone": "+98-31-12345678",
    "workingHours": "Saturday-Thursday, 9 AM - 5 PM",
    "website": "https://ceramicarts.ir"
  }
}
```

---

## Version Control & Change Detection

**Version Semantics:**
- `_version`: Internal optimistic lock counter (incremented on each successful PATCH)
- `draftVersion`: Public version counter (only incremented on actual field changes)
- `lastAutosavedAt`: Timestamp of last autosave (updated on every PATCH, even no-op saves)

**Change Detection Example:**

```json
// Client sends (no actual changes):
{
  "_version": 3,
  "data": {}
}

// Server response (_version unchanged):
{
  "success": true,
  "data": {
    "draft": {
      "_version": 3,
      "draftVersion": 2,
      "lastAutosavedAt": "2025-05-19T10:35:30Z"
    },
    "changedFields": [],
    "hasChanges": false
  }
}
```

---

## TTL Cleanup (90 Days)

MongoDB automatically deletes drafts based on `createdAt`:
- **Active drafts** without recent updates are deleted after 90 days
- **Published drafts** (status = "published") are also eligible for deletion
- **Discarded drafts** (status = "discarded") follow the same 90-day TTL

**To prevent deletion:** Autosave the draft (updates `createdAt` TTL timer on each PATCH via `lastAutosavedAt`)

---

## Error Codes Reference

| Code | HTTP | Meaning | Recovery |
|------|------|---------|----------|
| VALIDATION_ERROR | 400 | Invalid input format | Fix input, retry |
| VERSION_CONFLICT | 409 | Stale _version | Reload draft, retry |
| DRAFT_NOT_FOUND | 404 | Draft ID doesn't exist | Create new draft |
| DRAFT_NOT_ACTIVE | 400 | Draft already published/discarded | Cannot update |
| INCOMPLETE_DRAFT | 422 | Required fields missing | Complete required fields |
| UNAUTHORIZED | 403 | Not draft owner | Check ownership |
| DRAFT_ALREADY_PUBLISHED | 400 | Draft already published | Cannot re-publish |

---

## Best Practices

1. **Always include `_version`** in PATCH requests for optimistic locking
2. **Debounce autosaves** (5s recommended) to avoid excessive network calls
3. **Store `_version` in frontend state** and update after each successful PATCH
4. **Handle 409 conflicts gracefully** — show "Draft updated elsewhere" message
5. **Validate required fields before publishing** using 422 response `missingFields`
6. **Use lazy-load** — Fetch draft on form mount, not on every keystroke
7. **Add UI indicators** for "Autosaving...", "Autosaved ✓" states using `lastAutosavedAt`

---

## Testing Draft Autosave Conflicts

```bash
# Terminal 1: Start first autosave (v0 → v1)
curl -X PATCH http://localhost:3000/api/listings/65e8a1b2c3d4e5f6g7h8i9j0/draft \
  -H "Authorization: Bearer TOKEN" \
  -d '{"_version":0,"data":{"title":"Update A"}}'

# Terminal 2: Attempt simultaneous update with same v0
curl -X PATCH http://localhost:3000/api/listings/65e8a1b2c3d4e5f6g7h8i9j0/draft \
  -H "Authorization: Bearer TOKEN" \
  -d '{"_version":0,"data":{"title":"Update B"}}'
  
# Terminal 2 receives 409 Conflict with current version 1
```

---

## Database Indexes

```javascript
// These indexes are automatically created by Mongoose:

// 1. TTL Index on createdAt (90 days)
db.drafts.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 7776000 })

// 2. Owner + Type + Status for quick lookups
db.drafts.createIndex({ "owner": 1, "type": 1, "status": 1 })

// 3. Owner + Status for filtering
db.drafts.createIndex({ "owner": 1, "status": 1 })

// 4. LastAutosavedAt for "active" draft queries
db.drafts.createIndex({ "lastAutosavedAt": 1 })

// 5. Sparse draftId index on listings collection
db.user_listings.createIndex({ "draftId": 1 }, { sparse: true })
```

---

## Production Readiness Checklist

- ✅ Optimistic locking prevents race conditions
- ✅ Change detection avoids spurious version bumps
- ✅ TTL index auto-deletes stale drafts
- ✅ Ownership validation on all endpoints
- ✅ HTTP status codes: 201 (create), 200 (update), 409 (conflict), 422 (incomplete)
- ✅ Validation errors include field details for frontend
- ✅ Logging of version conflicts for debugging
- ✅ No sensitive data in responses
- ✅ Proper error envelope format (success, error, reqId)
- ✅ Support for all 4 discriminator types (post, tour, training, academy)
- ✅ Separate drafts collection (no collision with published listings)

