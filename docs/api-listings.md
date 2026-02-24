# Listings API

Base path: `/api/listings`

---

## GET /api/listings/near

Find `Listing` documents (collection `user_listings`) near a geographic point,
sorted by distance (closest first).

### Query Parameters

| Parameter  | Type   | Required | Default | Constraints                     | Description                           |
| ---------- | ------ | -------- | ------- | ------------------------------- | ------------------------------------- |
| `lat`      | number | **yes**  | —       | −90 … 90                        | Latitude of the search centre         |
| `lng`      | number | **yes**  | —       | −180 … 180                      | Longitude of the search centre        |
| `radiusKm` | number | no       | `5`     | min `0.1`, max `50`             | Search radius in km (capped at 50)    |
| `limit`    | number | no       | `100`   | min `1`, max `500`              | Max results to return (capped at 500) |
| `type`     | string | no       | —       | `post\|tour\|training\|academy` | Filter by listing type                |

> **Radius cap**: if `radiusKm > 50` the request succeeds and the effective
> radius is silently reduced to 50 km (a warning is logged server-side).
>
> **Limit cap**: if `limit > 500` the effective limit is silently reduced to 500.

### Example Request

```
GET /api/listings/near?lat=35.69&lng=51.42&radiusKm=5&type=post&limit=20
```

### Success Response `200 OK`

```json
{
  "success": true,
  "reqId": "3f8b1c2a-...",
  "data": {
    "items": [
      {
        "id": "664f1b2a...",
        "type": "post",
        "title": "سفال دست‌ساز",
        "description": "توضیحات محصول",
        "tags": ["سفال", "هنر"],
        "images": ["/uploads/abc.webp"],
        "imagesAbs": ["https://api.nakhsha.ir/uploads/abc.webp"],
        "location": {
          "type": "Point",
          "coordinates": [51.42, 35.69]
        },
        "status": "published",
        "owner": "6640a1f2...",
        "distanceMeters": 142.3,
        "createdAt": "2026-02-01T10:00:00.000Z",
        "updatedAt": "2026-02-01T10:00:00.000Z"
      }
    ],
    "meta": {
      "radiusKm": 5,
      "limit": 20,
      "count": 1
    }
  }
}
```

### Error Responses

| HTTP | `error.code`        | Cause                                                |
| ---- | ------------------- | ---------------------------------------------------- |
| 400  | `VALIDATION_ERROR`  | Missing `lat`/`lng`, out-of-range values, bad `type` |
| 429  | `TOO_MANY_REQUESTS` | Heavy-endpoint rate limit exceeded (30 req/min/IP)   |
| 500  | `GEO_INDEX_ERROR`   | 2dsphere index missing on the collection             |
| 500  | `INTERNAL_ERROR`    | Unexpected server error                              |

Error body shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "پارامتر lat الزامی و باید عدد باشد",
    "details": { "field": "lat" }
  },
  "reqId": "..."
}
```

---

## POST /api/listings

Create a new listing. Requires a valid JWT in the `Authorization: Bearer <token>` header.

### Listing Types

| `type`     | Extra fields (inside `details`)                          |
| ---------- | -------------------------------------------------------- |
| `post`     | `price?`, `forSale?`, `category?`, `attributes?`         |
| `tour`     | `startDate?`, `durationDays?`, `capacity?`, `itinerary?` |
| `training` | `schedule` (**required**), `level?`, `instructor?`       |
| `academy`  | `addressDetails?`, `phone?`, `workingHours?`, `website?` |

### Request Body

```json
{
  "type": "post",
  "title": "سفال دست‌ساز تهرانی",
  "description": "توضیحات کامل محصول",
  "tags": ["سفال", "هنر"],
  "images": ["/uploads/abc.webp"],
  "location": { "type": "Point", "coordinates": [51.42, 35.69] },
  "status": "published",
  "details": {
    "price": 150000,
    "forSale": true,
    "category": "سفالگری"
  }
}
```

### Success Response `201 Created`

```json
{
  "success": true,
  "reqId": "...",
  "item": {
    "id": "...",
    "type": "post",
    "title": "سفال دست‌ساز تهرانی",
    "images": ["/uploads/abc.webp"],
    "imagesAbs": ["https://api.nakhsha.ir/uploads/abc.webp"],
    "price": 150000,
    ...
  }
}
```

---

## GET /api/listings/:id

Retrieve a single listing by its MongoDB ObjectId.

### Success Response `200 OK`

```json
{
  "success": true,
  "reqId": "...",
  "item": { ... }
}
```

### Error Responses

| HTTP | `error.code`       | Cause                        |
| ---- | ------------------ | ---------------------------- |
| 400  | `VALIDATION_ERROR` | `id` is not a valid ObjectId |
| 404  | `NOT_FOUND`        | No listing with that id      |

---

## Implementation Notes

- **Collection**: `user_listings` (separate from the legacy `listings` collection used by the Craft model).
- **Geospatial index**: sparse `2dsphere` index on the `location` field. Only documents that include a `location` value are indexed; documents without coordinates coexist safely in the collection.
- **Rate limiting**: `GET /near` is protected by the `heavyLimiter` middleware (30 requests/min per IP in production).
- **Discriminators**: `PostListing`, `TourListing`, `TrainingListing`, and `AcademyListing` are Mongoose discriminators of the base `Listing` model, sharing the same collection under the `type` key.
- **Images**: stored as relative server paths (e.g. `/uploads/abc.webp`). The response always includes `imagesAbs` with fully-qualified URLs derived from `PUBLIC_BASE_URL` or the incoming request origin.
