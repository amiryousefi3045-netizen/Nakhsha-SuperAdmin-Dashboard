/\*\*

- EDITABLE LISTING API — QUICK REFERENCE
-
- Fast lookup for API usage and integration
  \*/

# Editable Listing API Quick Reference

## 🔗 Endpoints Summary

| Method | Endpoint                                | Auth        | Purpose                     |
| ------ | --------------------------------------- | ----------- | --------------------------- |
| PATCH  | `/api/listings/:id`                     | ✅ Required | Update listing              |
| GET    | `/api/listings/:id/edit`                | Optional    | Get edit form data          |
| GET    | `/api/listings/:id/history`             | Optional    | View edit history           |
| GET    | `/api/listings/:id/revisions/:revision` | Optional    | View specific revision diff |

---

## 📝 PATCH /api/listings/:id

**Update a listing with revision control and image diffing.**

### Request

```http
PATCH /api/listings/507f1f77bcf86cd799439011 HTTP/1.1
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description",
  "tags": ["craft", "handmade"],
  "images": ["/uploads/image1.jpg", "/uploads/image2.jpg"],
  "location": {
    "type": "Point",
    "coordinates": [51.3890, 35.6892]
  },
  "revision": 5,
  "details": {
    "price": 150000,
    "forSale": true,
    "category": "pottery"
  },
  "reason": "Updated product photos and price"
}
```

### Request Fields

| Field       | Type     | Required | Notes                          |
| ----------- | -------- | -------- | ------------------------------ |
| title       | string   | ❌       | 5-200 chars, trim              |
| description | string   | ❌       | 1-5000 chars, trim             |
| tags        | string[] | ❌       | Array of tags                  |
| images      | string[] | ❌       | Relative paths: /uploads/...   |
| location    | GeoJSON  | ❌       | Type: "Point", [lng, lat]      |
| revision    | number   | ✅       | **CRITICAL**: Current revision |
| details     | object   | ❌       | Type-specific fields           |
| reason      | string   | ❌       | Optional: why editing          |

### Response - Success (200)

```json
{
  "success": true,
  "data": {
    "item": {
      "id": "507f1f77bcf86cd799439011",
      "revision": 6,
      "updatedAt": "2026-05-19T10:30:00.000Z",
      "images": {
        "current": ["/uploads/image1.jpg", "/uploads/image2.jpg"],
        "imagesAbs": [
          "https://example.com/uploads/image1.jpg",
          "https://example.com/uploads/image2.jpg"
        ],
        "added": ["/uploads/image2.jpg"],
        "removed": [],
        "reordered": false
      }
    }
  },
  "requestId": "req-123"
}
```

### Response - Errors

#### 401 Unauthorized (Not logged in)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "ورود الزامی است برای ویرایش آگهی"
  }
}
```

#### 403 Forbidden (Not owner)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "آن را مجاز نیستید برای ویرایش این آگهی"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "آگهی یافت نشد"
  }
}
```

#### 409 Conflict (Concurrent Edit)

```json
{
  "success": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "آگهی توسط کاربر دیگری تغییر کرده است. لطفاً مجدداً بارگذاری کنید.",
    "currentRevision": 6,
    "clientRevision": 5
  }
}
```

#### 400 Bad Request (Validation Error)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "اطلاعات ورودی نامعتبر است",
    "details": {
      "issues": [
        {
          "field": "images.0",
          "message": "تصویر باید با \"/\" شروع شود",
          "code": "custom"
        }
      ]
    }
  }
}
```

---

## 🎯 GET /api/listings/:id/edit

**Get listing data optimized for edit form.**

### Request

```http
GET /api/listings/507f1f77bcf86cd799439011/edit HTTP/1.1
```

### Response

```json
{
  "success": true,
  "data": {
    "item": {
      "id": "507f1f77bcf86cd799439011",
      "type": "post",
      "title": "Beautiful Ceramic Vase",
      "description": "Handmade from local clay...",
      "tags": ["pottery", "craft"],
      "images": ["/uploads/1.jpg", "/uploads/2.jpg"],
      "imagesAbs": ["https://...", "https://..."],
      "location": {
        "type": "Point",
        "coordinates": [51.389, 35.6892]
      },
      "revision": 5,
      "price": 150000,
      "forSale": true,
      "category": "pottery",
      "attributes": {
        "material": "clay",
        "height": "30cm"
      }
    }
  }
}
```

---

## 📜 GET /api/listings/:id/history

**Get complete edit history of a listing.**

### Request

```http
GET /api/listings/507f1f77bcf86cd799439011/history?limit=20 HTTP/1.1
```

### Query Parameters

| Parameter | Type   | Default | Max |
| --------- | ------ | ------- | --- |
| limit     | number | 50      | 100 |

### Response

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "timestamp": "2026-05-19T10:30:00.000Z",
        "revision": 3,
        "editor": {
          "id": "user-123",
          "name": "احمد رضایی",
          "email": "ahmad@example.com"
        },
        "changedFields": ["title", "price"],
        "changesSummary": {
          "title": "Beautiful Ceramic...",
          "price": 150000
        },
        "reason": "Updated product photos and price"
      },
      {
        "timestamp": "2026-05-18T14:20:00.000Z",
        "revision": 2,
        "editor": {
          "id": "user-123",
          "name": "احمد رضایی"
        },
        "changedFields": ["description"],
        "changesSummary": {
          "description": "Handmade from local clay..."
        }
      }
    ],
    "totalRevisions": 4
  }
}
```

---

## 🔍 GET /api/listings/:id/revisions/:revision

**View what changed in a specific revision.**

### Request

```http
GET /api/listings/507f1f77bcf86cd799439011/revisions/3 HTTP/1.1
```

### Response

```json
{
  "success": true,
  "data": {
    "diff": {
      "timestamp": "2026-05-19T10:30:00.000Z",
      "editor": "user-123",
      "newRevision": 3,
      "changes": {
        "title": "Original Title",
        "price": 100000,
        "images": ["/uploads/old.jpg"]
      },
      "reason": "Updated product photos"
    }
  }
}
```

---

## 🧠 Key Concepts

### Revision Numbers

- Start at `0` for new listings
- Increment with each successful update
- **Required in PATCH request** for optimistic locking
- Client must send the revision they fetched

```javascript
// Fetch
GET /edit → revision: 5

// Update with same revision
PATCH → { revision: 5, ... } ✅

// Update with wrong revision
PATCH → { revision: 4, ... } ❌ → 409 Conflict
```

### Image Paths

- Always relative: `/uploads/filename.jpg`
- Never absolute URLs
- Must start with `/`
- Cannot contain `../` (path traversal protection)

```javascript
✅ Valid:   "/uploads/abc123.webp"
❌ Invalid: "https://external.com/img.jpg"
❌ Invalid: "../../../etc/passwd"
❌ Invalid: "uploads/img.jpg"  // Missing leading /
```

### Conflict Handling

When 409 Revision Conflict occurs:

1. **Frontend receives:**
   - Current revision in database
   - Client's revision sent
2. **Frontend should:**
   - Show "Listing updated by another user" message
   - Offer to reload the latest version
   - Let user retry merge

3. **Resolution:**
   - `GET /edit` to fetch latest (new revision)
   - Apply edits again with new revision
   - Re-submit PATCH

```javascript
// Example conflict resolution flow
async function retryAfterConflict(listingId) {
  // 1. Fetch latest
  const latest = await fetch(`/api/listings/${listingId}/edit`);
  const { item } = await latest.json();

  // 2. User re-applies their edits
  const updated = { ...item, title: "New Title" };

  // 3. Retry with new revision
  return fetch(`/api/listings/${listingId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...updated,
      revision: item.revision, // New revision!
    }),
  });
}
```

---

## 🛠️ Integration Examples

### React Hook

```javascript
import { useState } from "react";

function useListingEdit(listingId) {
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchForEdit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/edit`);
      const { data } = await res.json();
      setListing(data.item);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const save = async (updates) => {
    if (!listing) return;

    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          revision: listing.revision,
        }),
      });

      if (res.status === 409) {
        // Conflict: re-fetch and retry
        await fetchForEdit();
        throw new Error("تغییر همزمان شناسایی شد");
      }

      const { data } = await res.json();
      setListing({ ...listing, ...data.item });
      return data.item;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return { listing, loading, error, fetchForEdit, save };
}
```

### cURL Examples

```bash
# Fetch for edit
curl -X GET https://api.example.com/api/listings/abc123/edit

# Update listing
curl -X PATCH https://api.example.com/api/listings/abc123 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Title",
    "revision": 5
  }'

# View history
curl -X GET 'https://api.example.com/api/listings/abc123/history?limit=10'

# View specific revision diff
curl -X GET https://api.example.com/api/listings/abc123/revisions/3
```

---

## 🔐 Type-Specific Details

### POST Listing Details

```javascript
details: {
  price: 150000,                    // Required for sales
  forSale: true,
  category: "pottery",
  attributes: {
    material: "clay",
    height: "30cm",
    glaze: "traditional"
  }
}
```

### TOUR Listing Details

```javascript
details: {
  startDate: "2026-06-01T09:00:00Z",
  endDate: "2026-06-05T17:00:00Z",
  duration: "5 days",
  durationDays: 5,
  capacity: 20,
  itinerary: "Day 1: Tehran..."
}
```

### TRAINING Listing Details

```javascript
details: {
  schedule: [
    {
      dayOfWeek: 0,              // 0=Sunday, 6=Saturday
      startTime: "09:00",
      endTime: "11:00"
    }
  ],
  capacity: 15,
  level: "beginner",
  instructor: "Master Artisan"
}
```

### ACADEMY Listing Details

```javascript
details: {
  addressDetails: "No. 123 Main St, Tehran",
  phone: "+98-21-...",
  workingHours: "9AM-5PM, Sat-Thu",
  website: "https://example.com"
}
```

---

## ⏱️ Performance Tips

1. **Use GET /edit for forms**
   - Optimized response size
   - Contains revision for next update

2. **Handle 409 conflicts gracefully**
   - Don't just retry immediately
   - Fetch fresh data and inform user

3. **Batch requests wisely**
   - One PATCH per user action
   - Don't debounce too aggressively (lost updates risk)

4. **Image optimization**
   - Pre-validate paths on client
   - Limit to reasonable array size

---

## 📊 Status Codes

| Code | Meaning          | Action                                       |
| ---- | ---------------- | -------------------------------------------- |
| 200  | Success          | Use updated data                             |
| 400  | Validation error | Check `issues` array, fix input              |
| 401  | Unauthorized     | User not authenticated                       |
| 403  | Forbidden        | User not listing owner                       |
| 404  | Not found        | Listing doesn't exist                        |
| 409  | Conflict         | Concurrent edit detected, re-fetch and retry |
| 500  | Server error     | Retry or contact support                     |

---

## 🐛 Common Issues

### "REVISION_CONFLICT" keeps happening

**Cause:** Another tab/user editing simultaneously  
**Fix:** Fetch latest data before retrying

### "INVALID_IMAGES" error

**Cause:** Image paths don't start with `/` or contain `../`  
**Fix:** Ensure all paths are relative: `/uploads/filename.jpg`

### "UNAUTHORIZED" after update

**Cause:** Token expired or permission changed  
**Fix:** Refresh page, re-authenticate

### Update succeeds but data doesn't change

**Cause:** Sending empty update object  
**Fix:** Include at least one field to change

---

## 📚 Related Endpoints

- `POST /api/listings` — Create new listing
- `GET /api/listings/:id` — View listing (full data)
- `GET /api/listings/near?lat=...&lng=...` — Geo search
- `DELETE /api/listings/:id` — Delete listing (separate endpoint)

---

**Last Updated:** May 19, 2026  
**API Version:** 1.0  
**Environment:** Production
