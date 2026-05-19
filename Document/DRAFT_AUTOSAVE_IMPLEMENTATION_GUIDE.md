# Draft Autosave System - Implementation Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  React Component ← Context (stores draftId, _version, data)    │
│         ↓                                                        │
│   Debounced Autosave Handler (5s idle)                         │
│         ↓                                                        │
│   PATCH /api/listings/:id/draft (with _version optimistic lock)│
└──────────────────────────────────────────────────────────────────┘
                            ↓ HTTP
┌──────────────────────────────────────────────────────────────────┐
│                      BACKEND LAYERS                              │
├──────────────────────────────────────────────────────────────────┤
│ Routes (drafts.js)                                               │
│   └─ PATCH /:id/draft → Calls Controller                        │
├──────────────────────────────────────────────────────────────────┤
│ Controller (DraftController.js)                                  │
│   └─ Parses request → Calls Service                             │
├──────────────────────────────────────────────────────────────────┤
│ Service (DraftService.js) - Business Logic                      │
│   ├─ Detects changes (detectChanges helper)                    │
│   ├─ Prepares update payload                                    │
│   ├─ Calls Repository.updateDraftPartial()                      │
│   └─ Formats response                                           │
├──────────────────────────────────────────────────────────────────┤
│ Repository (DraftRepository.js) - Data Access                   │
│   ├─ Retrieves draft from DB                                    │
│   ├─ Checks optimistic lock (_version)                          │
│   ├─ Updates if version matches                                 │
│   ├─ Increments _version & draftVersion                         │
│   └─ Returns success/conflict result                            │
├──────────────────────────────────────────────────────────────────┤
│ Validation (draftValidation.js) - Zod Schemas                   │
│   ├─ createDraftSchema (required fields)                        │
│   ├─ autosaveDraftSchema (partial updates)                      │
│   ├─ publishDraftSchema (final publication)                     │
│   └─ validateDraftForPublish (type-specific rules)              │
├──────────────────────────────────────────────────────────────────┤
│ Models (Draft.js, Listing.js)                                   │
│   ├─ Draft: Base schema with discriminators (post|tour|...)     │
│   ├─ TTL index (90 days on createdAt)                           │
│   ├─ Listing: Updated with draftId reference                    │
│   └─ Mongoose handles schema enforcement                        │
└──────────────────────────────────────────────────────────────────┘
                            ↓
                    MongoDB drafts collection
```

---

## File Structure

```
backend/
├── models/
│   ├── Draft.js                    # Draft schema (new)
│   └── Listing.js                  # Updated with draftId
├── routes/
│   └── drafts.js                   # Draft endpoints (new)
├── controllers/
│   └── DraftController.js          # HTTP handlers (new)
├── services/
│   └── DraftService.js             # Business logic (new)
├── repository/
│   └── DraftRepository.js          # Data access layer (new)
├── utils/
│   └── draftValidation.js          # Zod schemas (new)
├── middleware/
│   └── validate.js                 # Reused for draft validation
├── __tests__/
│   └── drafts.test.js              # Jest tests (new)
└── server.js                       # Updated to register draft routes
```

---

## Data Flow: Complete Example

### Scenario: User Creates & Autosaves a Carpet Listing (Post Type)

#### Step 1: Initialize Draft (User opens form)

**Frontend:**
```javascript
const createDraftResponse = await fetch('/api/listings/draft', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ type: 'post', currentStep: 1 })
});
const { data: { draft } } = await createDraftResponse.json();
// draft._id = "65e8a1b2..."
// draft._version = 0
// draft.draftVersion = 0
```

**Backend Flow:**
```
DraftController.createDraft()
  └─ req.body = { type: 'post', currentStep: 1 }
  └─ DraftService.initializeDraft(userId, 'post', {currentStep: 1})
      └─ DraftRepository.createDraft({owner: userId, type: 'post', data: {...}})
          └─ new Draft({...}) → db.drafts.insertOne()
          └─ Returns: { _id, _version: 0, draftVersion: 0, ... }
      └─ Formats response (removes internal fields)
  └─ Returns: 201 Created with draft object
```

**Database:**
```javascript
// Inserted into db.drafts:
{
  _id: ObjectId("65e8a1b2c3d4e5f6g7h8i9j0"),
  owner: ObjectId("64d1a2b3c4d5e6f7g8h9i0j1"),
  type: "post",
  status: "active",
  currentStep: 1,
  _version: 0,
  draftVersion: 0,
  lastAutosavedAt: ISODate("2025-05-19T10:30:00Z"),
  createdAt: ISODate("2025-05-19T10:30:00Z"),
  updatedAt: ISODate("2025-05-19T10:30:00Z")
}
```

---

#### Step 2: User Types Title & Description (Debounced Autosave)

**Frontend:**
```javascript
const autosave = debounce(async () => {
  const response = await fetch(`/api/listings/65e8a1b2c3d4e5f6g7h8i9j0/draft`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      _version: 0,  // Client's current version
      currentStep: 1,
      data: {
        title: 'Handmade Carpet',
        description: 'Beautiful traditional carpet with natural dyes',
        tags: ['carpet', 'traditional']
      }
    })
  });
  const { data } = await response.json();
  setCurrentVersion(data.draft._version); // Update to 1
}, 5000);

// Trigger on keyup: onTitleChange → autosave()
```

**Backend Flow:**
```
DraftController.updateDraft()
  └─ req.body = { _version: 0, currentStep: 1, data: {...} }
  └─ DraftService.autosaveDraft(draftId, userId, payload)
      ├─ Verify ownership: draft.owner === userId ✓
      ├─ Check status: draft.status === 'active' ✓
      ├─ Detect changes: { title, description, tags }
      │  hasChanges = true, changedFields = ['title', 'description', 'tags']
      └─ DraftRepository.updateDraftPartial(
          draftId, 
          { title, description, tags },
          expectedVersion: 0,
          incrementVersion: true
      )
          ├─ Fetch draft: db.drafts.findById(draftId)
          ├─ Optimistic lock check: draft._version (0) === expectedVersion (0) ✓
          ├─ Apply changes: draft.title = '...' etc.
          ├─ Increment: draft._version = 1, draft.draftVersion = 1
          ├─ Update: draft.lastAutosavedAt = now
          └─ Save: db.drafts.findByIdAndUpdate() → returns updated draft
      └─ Returns: { success: true, draft, changedFields: [...], hasChanges: true }
  └─ Returns: 200 OK with updated draft
```

**Database Update:**
```javascript
// db.drafts.findByIdAndUpdate(
//   {_id: ObjectId("65e8a1b2...")},
//   {
//     $set: {
//       title: 'Handmade Carpet',
//       description: 'Beautiful traditional carpet...',
//       tags: ['carpet', 'traditional'],
//       _version: 1,
//       draftVersion: 1,
//       lastAutosavedAt: ISODate("2025-05-19T10:35:00Z"),
//       updatedAt: ISODate("2025-05-19T10:35:00Z")
//     }
//   }
// )
```

**Frontend Response:**
```json
{
  "success": true,
  "data": {
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "_version": 1,
      "draftVersion": 1,
      "title": "Handmade Carpet",
      "description": "Beautiful traditional carpet with natural dyes",
      "tags": ["carpet", "traditional"],
      "lastAutosavedAt": "2025-05-19T10:35:00Z"
    },
    "changedFields": ["title", "description", "tags"],
    "hasChanges": true
  }
}
```

---

#### Step 3: Race Condition - Concurrent Edits

**Two clients, same draft:**
- **Client A** sends: `_version: 1, data: { price: 500000 }`
- **Client B** sends: `_version: 1, data: { forSale: false }`

**First to arrive (Client A):**
```
✓ version matches (db._version = 1)
→ update succeeds
→ db._version incremented to 2
→ response: 200 OK
→ Client A updates state: _version = 2
```

**Second to arrive (Client B):**
```
✗ version mismatch (db._version = 2, expected = 1)
→ update fails
→ response: 409 CONFLICT
→ Client B receives conflict error with server's current draft
→ Frontend shows: "Draft was updated elsewhere. Refresh?"
```

**409 Response (Conflict):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Draft was updated elsewhere. Please refresh.",
    "currentVersion": 2,
    "expectedVersion": 1,
    "draft": {
      "_id": "65e8a1b2c3d4e5f6g7h8i9j0",
      "_version": 2,
      "price": 500000,
      "forSale": true,
      "title": "Handmade Carpet"
    }
  }
}
```

**Frontend Recovery:**
```javascript
if (response.status === 409) {
  // Option 1: Show conflict dialog
  showDialog("Draft updated elsewhere. Reload changes?");
  
  // Option 2: Auto-reload latest
  const latestDraft = await fetch('/api/listings/draft/latest');
  const { data: { draft } } = await latestDraft.json();
  setState({
    draft,
    currentVersion: draft._version,
    hasConflict: true
  });
}
```

---

#### Step 4: Publish to Listing

**Frontend:**
```javascript
const publishResponse = await fetch(`/api/listings/65e8a1b2c3d4e5f6g7h8i9j0/publish`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    // Optional final overrides
    category: 'traditional-carpets'
  })
});
```

**Backend Flow:**
```
DraftController.publishDraft()
  └─ req.params.draftId = "65e8a1b2c3d4e5f6g7h8i9j0"
  └─ DraftService.promoteDraftToListing(draftId, userId, finalData)
      ├─ Fetch draft
      ├─ Verify ownership
      ├─ validateDraftForPublish(draft, 'post')
      │  ├─ Checks: title ✓, description ✓, price ✓
      │  └─ Returns: { valid: true }
      ├─ Merge draft data + final overrides
      └─ Listing.create({
          type: 'post',
          title: 'Handmade Carpet',
          description: '...',
          price: 500000,
          owner: userId,
          status: 'published',
          tags: ['carpet', 'traditional'],
          draftId: ObjectId("65e8a1b2c3d4e5f6g7h8i9j0"),
          ...
      })
          └─ db.user_listings.insertOne()
          └─ Returns: { _id: ObjectId("65e8a1b2c3d4e5f6g7h8i9j2"), ... }
      └─ DraftRepository.publishDraft(draftId, listingId)
          └─ db.drafts.findByIdAndUpdate({status: 'published', listingId: ...})
  └─ Returns: 201 Created with listing + draft objects
```

**Database Changes:**

```javascript
// Inserted into db.user_listings:
{
  _id: ObjectId("65e8a1b2c3d4e5f6g7h8i9j2"),
  type: "post",
  title: "Handmade Carpet",
  description: "Beautiful traditional carpet with natural dyes",
  owner: ObjectId("64d1a2b3c4d5e6f7g8h9i0j1"),
  draftId: ObjectId("65e8a1b2c3d4e5f6g7h8i9j0"),  // Links back to draft
  status: "published",
  price: 500000,
  forSale: true,
  tags: ["carpet", "traditional"],
  createdAt: ISODate("2025-05-19T10:40:00Z")
}

// Updated in db.drafts:
db.drafts.findByIdAndUpdate(
  {_id: ObjectId("65e8a1b2c3d4e5f6g7h8i9j0")},
  {
    $set: {
      status: "published",
      listingId: ObjectId("65e8a1b2c3d4e5f6g7h8i9j2")
    }
  }
)
```

---

## Optimistic Locking Deep Dive

**Problem:** Without locking, concurrent autosaves from multiple clients can lose updates.

**Solution:** Optimistic Locking via `_version`

```
Client A State       Client B State       Database
_version: 0          _version: 0          _version: 0

     │                    │                    │
     └─ PATCH v:0 ───────→│ ← same _version
                          │
                    ┌─────→ Concurrent!
                    │
             Response 200   Response 409
             v: 1 ✓         (v: 1, not 0)
             
Client A: _v=1      Client B: conflict!
Proceed             Reload & retry
```

**Code:** [DraftRepository.js](../repository/DraftRepository.js#L63)

```javascript
async updateDraftPartial(draftId, changes, expectedVersion, incrementVersion) {
  const draft = await this.getDraftByIdForUpdate(draftId);
  
  // Check: does DB version match client's expected version?
  if (draft._version !== expectedVersion) {
    return {
      success: false,
      versionConflict: true,
      currentVersion: draft._version,
      expectedVersion
    };
  }
  
  // Version matches → safe to update
  Object.assign(draft, changes);
  draft._version += 1;  // Increment for next client
  await draft.save();
  
  return { success: true, draft };
}
```

---

## Change Detection

**Goal:** Only increment `draftVersion` if actual changes detected.

**Implementation:** [draftValidation.js](../utils/draftValidation.js#L85)

```javascript
const detectChanges = (oldData, newData) => {
  const changedFields = [];
  
  Object.keys(newData || {}).forEach((key) => {
    if (JSON.stringify(oldData?.[key]) !== JSON.stringify(newData[key])) {
      changedFields.push(key);
    }
  });
  
  return {
    changedFields,
    hasChanges: changedFields.length > 0
  };
};

// Called in DraftService.autosaveDraft():
const { hasChanges } = detectChanges(draft, autosavePayload.data);
const incrementVersion = hasChanges;  // Only if actual changes
```

**Result:**

```javascript
// Frontend sends empty data:
PATCH /api/listings/123/draft
{ _version: 5, data: {} }

// Server detects no changes:
changedFields: []
hasChanges: false
incrementVersion: false

// Response: _version stays 5 (not incremented)
// But lastAutosavedAt is updated
{
  "success": true,
  "data": {
    "draft": { "_version": 5, "draftVersion": 3 },
    "hasChanges": false
  }
}
```

---

## TTL Cleanup (MongoDB)

**TTL Index:** Auto-deletes drafts 90 days after `createdAt`

```javascript
// Schema definition:
draftSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }  // 7,776,000 seconds
);

// MongoDB background process scans every 60s:
// If (now - createdAt) > 90 days → delete document
```

**Implication:** Each PATCH updates `updatedAt` but NOT `createdAt`, so TTL timer is NOT reset.
- Solution: If you want to extend TTL, manually update `createdAt` in special cases (admin recovery feature).

---

## Type-Specific Discriminators

### Post Type
```javascript
const post = await DraftService.initializeDraft(userId, 'post', {
  title: 'Item',
  price: 100,
  forSale: true,
  category: 'pottery'
});
// Fields: price, forSale, category, attributes (Map)
```

### Tour Type
```javascript
const tour = await DraftService.initializeDraft(userId, 'tour', {
  title: 'Tour',
  startDate: '2025-06-01T09:00:00Z',
  endDate: '2025-06-03T18:00:00Z',
  capacity: 20
});
// Fields: startDate, endDate, duration, durationDays, capacity, itinerary
```

### Training Type
```javascript
const training = await DraftService.initializeDraft(userId, 'training', {
  title: 'Course',
  capacity: 15,
  level: 'beginner',
  instructor: 'Name'
});
// Fields: schedule, startDate, endDate, duration, capacity, level, instructor
```

### Academy Type
```javascript
const academy = await DraftService.initializeDraft(userId, 'academy', {
  title: 'Institute',
  addressDetails: '123 Street',
  phone: '+98-31-12345678'
});
// Fields: addressDetails, phone, workingHours, website
```

---

## Frontend Integration Example

### React Context + Hook

```javascript
// DraftContext.js
import { createContext, useContext, useState, useCallback } from 'react';

const DraftContext = createContext();

export function DraftProvider({ children }) {
  const [draft, setDraft] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const createDraft = useCallback(async (type, initialData) => {
    const response = await fetch('/api/listings/draft', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, ...initialData })
    });
    const result = await response.json();
    if (result.success) {
      setDraft(result.data.draft);
      setCurrentVersion(result.data.draft._version);
    }
    return result;
  }, []);

  const autosaveDraft = useCallback(async (data, currentStep) => {
    if (!draft) return { success: false };
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/listings/${draft._id}/draft`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          _version: currentVersion,
          currentStep,
          data
        })
      });
      
      const result = await response.json();
      
      if (response.status === 409) {
        setLastError('Draft updated elsewhere. Reloading...');
        // Reload latest draft
        const latest = await fetch('/api/listings/draft/latest');
        const latestResult = await latest.json();
        setDraft(latestResult.data.draft);
        setCurrentVersion(latestResult.data.draft._version);
      } else if (result.success) {
        setDraft(result.data.draft);
        setCurrentVersion(result.data.draft._version);
        setLastSavedAt(result.data.draft.lastAutosavedAt);
        setLastError(null);
      }
      
      return result;
    } finally {
      setIsSaving(false);
    }
  }, [draft, currentVersion]);

  const publishDraft = useCallback(async (finalData = {}) => {
    if (!draft) return { success: false };
    
    const response = await fetch(`/api/listings/${draft._id}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(finalData)
    });
    
    return await response.json();
  }, [draft]);

  return (
    <DraftContext.Provider value={{
      draft,
      currentVersion,
      isSaving,
      lastError,
      lastSavedAt,
      createDraft,
      autosaveDraft,
      publishDraft
    }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft() {
  return useContext(DraftContext);
}
```

### Multi-Step Form Component

```javascript
// ListingWizard.jsx
import { useDraft } from './DraftContext';
import { useCallback, useEffect, useState } from 'react';

export function ListingWizard() {
  const { draft, currentVersion, createDraft, autosaveDraft, publishDraft } = useDraft();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Initialize draft on mount
  useEffect(() => {
    if (!draft) {
      createDraft('post', { currentStep: 1 });
    }
  }, [draft]);

  // Debounced autosave
  const debouncedAutosave = useCallback(
    debounce(async (data) => {
      const result = await autosaveDraft(data, currentStep);
      if (!result.success && result.error?.code === 'INCOMPLETE_DRAFT') {
        setErrors(result.error.missingFields.reduce((acc, field) => {
          acc[field] = 'Required';
          return acc;
        }, {}));
      }
    }, 5000),
    [autosaveDraft, currentStep]
  );

  const handleFieldChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    debouncedAutosave(newData);
  };

  const handleNext = async () => {
    // Explicit save before moving step
    const result = await autosaveDraft(formData, currentStep + 1);
    if (result.success) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSubmit = async () => {
    const result = await publishDraft();
    if (result.success) {
      navigate(`/listings/${result.data.listing._id}`);
    } else if (result.error?.code === 'INCOMPLETE_DRAFT') {
      setErrors(result.error.missingFields.reduce((acc, field) => {
        acc[field] = 'Required for publication';
        return acc;
      }, {}));
    }
  };

  return (
    <div className="wizard">
      {currentStep === 1 && (
        <>
          <input
            value={formData.title || ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            placeholder="Title"
          />
          <textarea
            value={formData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Description"
          />
        </>
      )}
      
      {currentStep === 2 && (
        <>
          <input
            type="number"
            value={formData.price || ''}
            onChange={(e) => handleFieldChange('price', parseFloat(e.target.value))}
            placeholder="Price"
          />
        </>
      )}
      
      <button onClick={handleNext}>Next</button>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

// Debounce helper
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}
```

---

## Troubleshooting

### Issue: 409 Conflict on Every Save

**Cause:** Frontend not updating `_version` after successful PATCH

**Fix:**
```javascript
// ✗ Wrong
const autosave = async (data) => {
  const res = await fetch(`/api/listings/${draftId}/draft`, {
    method: 'PATCH',
    body: JSON.stringify({ _version: 0, data })  // Always 0!
  });
};

// ✓ Correct
const [currentVersion, setCurrentVersion] = useState(draft._version);

const autosave = async (data) => {
  const res = await fetch(`/api/listings/${draftId}/draft`, {
    method: 'PATCH',
    body: JSON.stringify({ _version: currentVersion, data })
  });
  const result = await res.json();
  setCurrentVersion(result.data.draft._version);  // Update!
};
```

### Issue: Draft Doesn't Persist Across Page Reload

**Cause:** Frontend lost `draftId` (stored only in React state, not localStorage)

**Fix:**
```javascript
// On mount, retrieve latest draft
useEffect(() => {
  const savedDraftId = localStorage.getItem('draftId');
  if (savedDraftId) {
    // Verify it still exists
    fetch(`/api/listings/draft/${savedDraftId}`)
      .then(r => r.json())
      .then(result => setDraft(result.data.draft));
  }
}, []);

// On create, persist ID
const createDraft = async (type) => {
  const result = await fetch('/api/listings/draft', { method: 'POST', body: JSON.stringify({ type }) });
  const draft = result.data.draft;
  localStorage.setItem('draftId', draft._id);
  setDraft(draft);
};
```

### Issue: `lastAutosavedAt` Not Updating

**Cause:** Change detection found no changes, but you still want to track saves

**Fix:** Service correctly updates `lastAutosavedAt` on every PATCH regardless of changes. Check response `lastAutosavedAt` field. This should always be the current timestamp.

### Issue: TTL Delete Triggered Too Early

**Cause:** Creating draft old; TTL clock starts from `createdAt`, not modified time

**Note:** This is intentional behavior. If you want drafts to persist longer, ensure periodic autosaves occur before 90 days elapse.

---

## Performance Considerations

1. **Debounce autosave** (5s minimum) to reduce DB writes
2. **Use `.lean()` in repository** for read-heavy queries (get latest, list)
3. **Partial updates only** via PATCH (not full draft replacement)
4. **Index optimization:**
   - `{owner: 1, type: 1, status: 1}` — Fast latest draft lookup
   - `{lastAutosavedAt: 1}` — For admin cleanup queries
   - TTL index runs MongoDB background thread every 60s

5. **Batch cleanup:** Don't run cleanup on every request; use scheduled cron job if needed

---

## Security Checklist

- ✅ **Ownership validation** on all endpoints
- ✅ **JWT authentication** required for all draft operations
- ✅ **Version check** prevents blind overwrites
- ✅ **Input validation** via Zod (prevents injection)
- ✅ **No sensitive data** in responses (password, tokens never in draft)
- ✅ **Rate limiting** inherited from parent listings routes
- ✅ **CORS checks** via helmet + CORS middleware
- ✅ **No direct URL manipulation** — IDs are ObjectIds (not sequential guessable)

---

## Monitoring & Logging

**Logged Events:**

```javascript
// Draft created
logger.info('Draft created', { draftId, type, ownerId });

// Autosave conflict
logger.warn('Autosave failed', { draftId, error: 'VERSION_CONFLICT', ownerId });

// Publish successful
logger.info('Draft published to listing', { draftId, listingId, ownerId });

// Errors
logger.error('Error autosaving draft', { error: error.message, userId });
```

**Sentry Integration:** Global errorHandler captures all 5xx errors; draft service errors are logged with context.

