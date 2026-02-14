# API Architecture Refactoring Guide

## Overview

This guide documents the refactored API architecture for the Nakhsha frontend, showcasing a stable, scalable, and fully-typed API layer using Axios and TypeScript.

## ✅ Completed Components

### 1. Centralized API Client (`src/lib/apiClient.ts`)

A robust, interceptor-based HTTP client with:

- **Automatic authentication**: Token injection via request interceptor
- **Standardized responses**: All methods return `ApiResult<T>`
- **Comprehensive error handling**: Converts all errors to `ApiError` format
- **Request/response logging**: Development-only logging
- **Token management**: Utilities for storing/retrieving auth tokens
- **Generic methods**: Full TypeScript support with type inference

**Key Features:**

```typescript
// Standardized response shape - ALWAYS returned
interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Comprehensive error information
interface ApiError {
  code: string; // e.g., "UNAUTHORIZED", "NOT_FOUND"
  message: string; // User-friendly Persian message
  details?: unknown; // Additional error context
  status?: number; // HTTP status code
}
```

### 2. Comprehensive Type Definitions

**`src/types/apiClient.ts`**

- Core API client types (`ApiResult`, `ApiError`, `PaginationMeta`)
- Request configuration options
- Error code enums

**`src/types/services.ts`** (NEW)

- Backend response types for all services
- Request payload types
- Separation between backend shape and frontend models

**`src/types/api.ts`**

- Domain models (Craft, User, Post, Comment, etc.)
- Frontend-facing types

### 3. Example Refactored Service

**`src/services/crafts.refactored.ts`**

A complete example demonstrating all best practices:

#### ✅ Strong Typing with Generics

```typescript
export async function fetchCraftById(id: string): Promise<ApiResult<Craft>> {
  const result = await apiClient.get<CraftResponse>(`/crafts/${id}`);

  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Craft>;
}
```

#### ✅ Proper Error Handling (No Silent Failures)

```typescript
// Calling code MUST handle both success and error cases
const result = await fetchCraftById("craft-123");

if (result.success && result.data) {
  // Type-safe access to data
  console.log(result.data.title);
} else {
  // Error is always available when success is false
  console.error(result.error?.message);

  // Can check specific error codes
  if (result.error?.code === "NOT_FOUND") {
    // Handle not found
  } else if (result.error?.code === "UNAUTHORIZED") {
    // Redirect to login
  }
}
```

#### ✅ No Duplicated Logic

- Token management centralized in `apiClient`
- Error normalization handled by interceptor
- Response wrapping automatic via `apiClient` methods

#### ✅ Comprehensive Documentation

Every function includes:

- JSDoc comments with parameter descriptions
- Return type documentation
- Usage examples
- Error handling patterns

## 📋 Migration Checklist

### Phase 1: Foundation (✅ Complete)

- [x] Create `apiClient.ts` with interceptors
- [x] Define `ApiResult<T>` and `ApiError` types
- [x] Implement token management
- [x] Add request/response logging
- [x] Create comprehensive service types

### Phase 2: Service Migration

- [x] Create example refactored service (crafts)
- [ ] Migrate `auth.ts` → use existing `auth.v2.ts`
- [ ] Migrate `profile.ts`
- [ ] Migrate `posts.ts` → use existing `posts.v2.ts`
- [ ] Migrate `listings.ts`
- [ ] Migrate `media.ts` → use existing `media.v2.ts`
- [ ] Migrate `health.ts` → use existing `health.v2.ts`

### Phase 3: Component Updates

- [ ] Update components to use new service signatures
- [ ] Add proper error handling in UI
- [ ] Remove old `http.ts` usage
- [ ] Delete legacy service files

## 🔧 Migration Pattern

### Before (Old Pattern)

```typescript
// services/example.ts - OLD
import { http } from "../lib/http";

export async function getItem(id: string): Promise<Item> {
  try {
    const { data } = await http.get(`/items/${id}`);
    return data.item;
  } catch (error) {
    // Silent failure or inconsistent error handling
    console.error(error);
    throw error; // Untyped error
  }
}

// Component usage - OLD
try {
  const item = await getItem("123");
  setItem(item);
} catch (error) {
  // What type of error? Unknown structure
  alert("Something went wrong");
}
```

### After (New Pattern)

```typescript
// services/example.ts - NEW
import { apiClient, type ApiResult } from "../lib/apiClient";
import type { ItemResponse } from "../types/services";
import type { Item } from "../types/api";

export async function getItem(id: string): Promise<ApiResult<Item>> {
  const result = await apiClient.get<ItemResponse>(`/items/${id}`);

  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Item>;
}

// Component usage - NEW
const result = await getItem("123");

if (result.success && result.data) {
  // Type-safe data access
  setItem(result.data);
} else {
  // Structured error handling
  const errorMessage = result.error?.message || "خطای نامشخص";

  if (result.error?.code === "UNAUTHORIZED") {
    navigate("/login");
  } else {
    setError(errorMessage);
  }
}
```

## 🎯 Key Principles

### 1. Never Throw, Always Return

```typescript
// ❌ BAD - Throwing requires try/catch everywhere
export async function badFunction() {
  throw new Error("Something failed");
}

// ✅ GOOD - Returns result, caller decides how to handle
export async function goodFunction(): Promise<ApiResult<Data>> {
  return apiClient.get<Data>("/endpoint");
}
```

### 2. Always Check Success

```typescript
// ❌ BAD - Assumes success
const data = await fetchData();
console.log(data.title); // Runtime error if failed

// ✅ GOOD - Explicit success check
const result = await fetchData();
if (result.success && result.data) {
  console.log(result.data.title); // Type-safe
}
```

### 3. Handle Specific Errors

```typescript
// ❌ BAD - Generic error handling
if (!result.success) {
  alert("Error!");
}

// ✅ GOOD - Specific error codes
if (!result.success) {
  switch (result.error?.code) {
    case "UNAUTHORIZED":
      redirectToLogin();
      break;
    case "NOT_FOUND":
      show404();
      break;
    case "VALIDATION_ERROR":
      showValidationErrors(result.error.details);
      break;
    default:
      showGenericError(result.error?.message);
  }
}
```

### 4. Type Backend Responses Separately

```typescript
// Backend response shape (in types/services.ts)
interface CraftResponse {
  item: Craft;
  liked?: boolean;
}

// Frontend domain model (in types/api.ts)
interface Craft {
  id: string;
  title: string;
  // ...
}

// Service extracts and transforms
export async function getCraft(id: string): Promise<ApiResult<Craft>> {
  const result = await apiClient.get<CraftResponse>(`/crafts/${id}`);

  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item, // Extract item from wrapper
    };
  }

  return result as unknown as ApiResult<Craft>;
}
```

## 📦 File Structure

```
frontend/src/
├── lib/
│   ├── apiClient.ts         ✅ Centralized HTTP client
│   └── http.ts              🗑️ Legacy (to be removed)
├── types/
│   ├── apiClient.ts         ✅ Core API types
│   ├── services.ts          ✅ Backend response types
│   └── api.ts               ✅ Domain models
└── services/
    ├── crafts.refactored.ts ✅ Example refactored service
    ├── auth.v2.ts           ✅ Already refactored
    ├── posts.v2.ts          ✅ Already refactored
    ├── media.v2.ts          ✅ Already refactored
    ├── health.v2.ts         ✅ Already refactored
    ├── crafts.ts            🔄 To migrate
    ├── profile.ts           🔄 To migrate
    └── listings.ts          🔄 To migrate
```

## 🚀 Usage Examples

### Basic GET Request

```typescript
const result = await apiClient.get<UserResponse>("/users/me");

if (result.success && result.data) {
  console.log("User:", result.data.user.name);
}
```

### POST with Data

```typescript
const result = await apiClient.post<CraftResponse>("/crafts", {
  title: "گلیم کاشان",
  price: 1500000,
});

if (result.success && result.data) {
  console.log("Created:", result.data.item.id);
}
```

### File Upload

```typescript
const formData = new FormData();
files.forEach((file) => formData.append("images", file));

const result = await apiClient.post<UploadResponse>(
  "/crafts/123/images",
  formData,
  {
    headers: { "Content-Type": "multipart/form-data" },
  },
);
```

### Paginated Request

```typescript
const result = await apiClient.getPaginated<Craft>("/crafts", {
  page: 1,
  limit: 20,
  category: "POTTERY",
});

if (result.success && result.data && result.meta) {
  console.log(`Page ${result.meta.page} of ${result.meta.totalPages}`);
  console.log(`${result.data.length} items`);
}
```

### Error Handling in Components

```typescript
function CraftDetail({ id }: { id: string }) {
  const [craft, setCraft] = useState<Craft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchCraftById(id);

      if (result.success && result.data) {
        setCraft(result.data);
        setError(null);
      } else {
        setError(result.error?.message || "خطا در بارگذاری");
        setCraft(null);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!craft) return <NotFound />;

  return <CraftCard craft={craft} />;
}
```

## 🔒 Authentication Flow

Token management is handled automatically:

```typescript
// Login
const result = await verifyOtp(phone, code);
if (result.success && result.data) {
  // Token is automatically stored
  const { token, user } = result.data;
}

// All subsequent requests include token automatically
const crafts = await fetchMyCrafts();
// Token sent in Authorization header via interceptor

// Logout
const result = await logout();
// Token automatically cleared
```

## ⚠️ Common Pitfalls to Avoid

### 1. Accessing data without checking success

```typescript
// ❌ WRONG
const result = await fetchCraft(id);
console.log(result.data.title); // Error if failed!

// ✅ CORRECT
const result = await fetchCraft(id);
if (result.success && result.data) {
  console.log(result.data.title);
}
```

### 2. Not handling errors

```typescript
// ❌ WRONG
const result = await fetchCraft(id);
// What if it failed?

// ✅ CORRECT
const result = await fetchCraft(id);
if (result.success && result.data) {
  // Handle success
} else {
  // Handle error
  showError(result.error?.message);
}
```

### 3. Mixing old and new patterns

```typescript
// ❌ WRONG - Using old http client
import { http } from "../lib/http";
const { data } = await http.get("/crafts");

// ✅ CORRECT - Using new apiClient
import { apiClient } from "../lib/apiClient";
const result = await apiClient.get<CraftsResponse>("/crafts");
```

## 🎓 Next Steps

1. **Study the example**: Review `src/services/crafts.refactored.ts`
2. **Migrate one service**: Start with a simple service like `health.ts`
3. **Update components**: Update UI to use new service signatures
4. **Test thoroughly**: Ensure error handling works correctly
5. **Remove legacy code**: Delete old service files once migration complete

## 📚 Additional Resources

- [apiClient.ts](../src/lib/apiClient.ts) - Centralized HTTP client
- [types/services.ts](../src/types/services.ts) - Service type definitions
- [crafts.refactored.ts](../src/services/crafts.refactored.ts) - Complete example
- [auth.v2.ts](../src/services/auth.v2.ts) - Auth service example

---

**Last Updated**: February 14, 2026
**Status**: ✅ API Client Complete | 🔄 Services In Progress
