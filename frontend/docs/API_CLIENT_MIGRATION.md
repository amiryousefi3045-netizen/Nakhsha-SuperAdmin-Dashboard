# API Client Migration Guide

## Overview

This guide explains how to migrate from the old `http.ts` client to the new centralized `apiClient.ts`.

## Why Migrate?

### Before (Old Pattern ❌)

```ts
// Inconsistent error handling
export async function fetchCrafts(params = {}) {
  try {
    const response = await http.get("/crafts", { params });
    return response.data; // Inconsistent response shape
  } catch (error) {
    console.error("fetchCrafts error:", error.message);
    throw error; // Untyped error
  }
}
```

### After (New Pattern ✅)

```ts
// Consistent, typed, standardized
export async function fetchCrafts(
  params: CraftFilters = {},
): Promise<ApiResult<Craft[]>> {
  return apiClient.get<Craft[]>("/crafts", { params });
}

// Usage with proper error handling
const result = await fetchCrafts({ city: "تهران" });
if (result.success) {
  console.log(result.data); // Type: Craft[]
} else {
  console.error(result.error?.message); // User-friendly Persian message
}
```

## Benefits

✅ **Standardized Response Shape** - All APIs return `ApiResult<T>`  
✅ **Type Safety** - Full TypeScript support with generics  
✅ **No Silent Failures** - All errors are caught and normalized  
✅ **Automatic Token Management** - Tokens added via interceptor  
✅ **Consistent Error Messages** - Persian user-friendly messages  
✅ **Request/Response Logging** - Automatic in development mode  
✅ **Centralized Configuration** - One place to manage API settings

---

## Step-by-Step Migration

### Step 1: Import New Client

**Before:**

```ts
import { http } from "../lib/http";
```

**After:**

```ts
import { apiClient, type ApiResult } from "../lib/apiClient";
```

### Step 2: Define Response Types

**Before:**

```ts
// No specific type
export async function fetchCraft(id: string) {
  const { data } = await http.get(`/crafts/${id}`);
  return data;
}
```

**After:**

```ts
// Backend response type
interface CraftDetailResponse {
  craft: Craft;
  relatedCrafts?: Craft[];
}

// Strongly typed function
export async function fetchCraft(
  id: string,
): Promise<ApiResult<CraftDetailResponse>> {
  return apiClient.get<CraftDetailResponse>(`/crafts/${id}`);
}
```

### Step 3: Remove Try-Catch Blocks

The new `apiClient` handles all errors internally. You don't need try-catch.

**Before:**

```ts
export async function createCraft(data: CraftCreateRequest) {
  try {
    const response = await http.post("/crafts", data);
    return response.data;
  } catch (error) {
    console.error("createCraft error:", error);
    throw error;
  }
}
```

**After:**

```ts
export async function createCraft(
  data: CraftCreateRequest,
): Promise<ApiResult<Craft>> {
  return apiClient.post<Craft>("/crafts", data);
}
```

### Step 4: Update Function Signatures

Change return type from `Promise<T>` to `Promise<ApiResult<T>>`.

**Before:**

```ts
export async function updateCraft(
  id: string,
  data: CraftUpdateRequest,
): Promise<Craft> {
  const response = await http.put(`/crafts/${id}`, data);
  return response.data;
}
```

**After:**

```ts
export async function updateCraft(
  id: string,
  data: CraftUpdateRequest,
): Promise<ApiResult<Craft>> {
  return apiClient.put<Craft>(`/crafts/${id}`, data);
}
```

### Step 5: Handle Paginated Responses

**Before:**

```ts
export async function fetchCrafts(params: any) {
  const { data } = await http.get("/crafts", { params });
  return data; // { items, total, page, limit }
}
```

**After:**

```ts
export async function fetchCrafts(
  params: CraftFilters = {},
): Promise<PaginatedResult<Craft>> {
  return apiClient.getPaginated<Craft>("/crafts", params);
}

// Usage
const result = await fetchCrafts({ page: 1, limit: 20 });
if (result.success) {
  console.log(result.data); // Craft[]
  console.log(result.meta?.total); // Total count
  console.log(result.meta?.totalPages); // Total pages
}
```

### Step 6: Extract Nested Response Data

If backend wraps response in `{ user: ... }` or `{ item: ... }`, extract it:

**Before:**

```ts
export async function me(): Promise<User> {
  const { data } = await http.get("/auth/me");
  return data.user; // Backend returns { user: User }
}
```

**After:**

```ts
interface AuthMeResponse {
  user: User;
}

export async function me(): Promise<ApiResult<User>> {
  const result = await apiClient.get<AuthMeResponse>("/auth/me");

  // Extract user from wrapper
  if (result.success && result.data?.user) {
    return {
      success: true,
      data: result.data.user,
    };
  }

  return result as ApiResult<User>;
}
```

### Step 7: Update Component Usage

**Before (in components):**

```tsx
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string>("");
const [data, setData] = useState<Craft[]>([]);

useEffect(() => {
  fetchCrafts()
    .then((response) => {
      setData(response.items);
      setLoading(false);
    })
    .catch((err) => {
      setError(err.message);
      setLoading(false);
    });
}, []);
```

**After:**

```tsx
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string>("");
const [data, setData] = useState<Craft[]>([]);

useEffect(() => {
  const load = async () => {
    const result = await fetchCrafts();

    if (result.success) {
      setData(result.data || []);
    } else {
      setError(result.error?.message || "خطا در بارگذاری");
    }

    setLoading(false);
  };

  load();
}, []);
```

---

## Migration Checklist

### For Each Service File:

- [ ] Replace `import { http }` with `import { apiClient, type ApiResult }`
- [ ] Define TypeScript interfaces for backend responses
- [ ] Change return types to `Promise<ApiResult<T>>`
- [ ] Remove try-catch blocks (handled by apiClient)
- [ ] Remove manual error normalization functions
- [ ] Use `apiClient.get/post/put/patch/delete` methods
- [ ] For paginated endpoints, use `apiClient.getPaginated<T>()`
- [ ] Extract nested response data if needed
- [ ] Add JSDoc comments with usage examples
- [ ] Export all new types

### For Components Using Services:

- [ ] Update to handle `ApiResult<T>` response shape
- [ ] Check `result.success` before accessing `result.data`
- [ ] Display `result.error?.message` for user-friendly errors
- [ ] Update TypeScript types for state variables
- [ ] Remove redundant error handling code

---

## Common Patterns

### Pattern 1: Simple GET Request

```ts
export async function getCraft(id: string): Promise<ApiResult<Craft>> {
  return apiClient.get<Craft>(`/crafts/${id}`);
}
```

### Pattern 2: POST with Request Body

```ts
export async function createCraft(
  data: CraftCreateRequest,
): Promise<ApiResult<Craft>> {
  return apiClient.post<Craft>("/crafts", data);
}
```

### Pattern 3: Paginated List

```ts
export async function getCrafts(
  filters: CraftFilters,
): Promise<PaginatedResult<Craft>> {
  return apiClient.getPaginated<Craft>("/crafts", filters);
}
```

### Pattern 4: File Upload

```ts
export async function uploadImage(
  file: File,
): Promise<ApiResult<{ url: string }>> {
  const formData = new FormData();
  formData.append("file", file);

  return apiClient.post<{ url: string }>("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
```

### Pattern 5: DELETE Request

```ts
export async function deleteCraft(
  id: string,
): Promise<ApiResult<{ success: boolean }>> {
  return apiClient.delete<{ success: boolean }>(`/crafts/${id}`);
}
```

### Pattern 6: Conditional Error Handling

```ts
const result = await loginUser(credentials);

if (result.success) {
  // Success - redirect to dashboard
  navigate("/dashboard");
} else {
  // Check specific error codes
  if (result.error?.code === "INVALID_CREDENTIALS") {
    setError("نام کاربری یا رمز عبور اشتباه است");
  } else if (result.error?.code === "ACCOUNT_LOCKED") {
    setError("حساب کاربری شما قفل شده است");
  } else {
    setError(result.error?.message || "خطا در ورود");
  }
}
```

---

## Testing

### Before Migration

```ts
// Hard to test - direct http calls
const result = await http.get("/crafts");
```

### After Migration

```ts
// Easy to mock apiClient in tests
jest.mock("../lib/apiClient", () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({
      success: true,
      data: [
        /* mock crafts */
      ],
    }),
  },
}));
```

---

## Comparison Table

| Feature          | Old (http.ts)       | New (apiClient.ts)           |
| ---------------- | ------------------- | ---------------------------- |
| Response Shape   | Inconsistent        | Standardized `ApiResult<T>`  |
| Error Handling   | Manual try-catch    | Automatic normalization      |
| Type Safety      | Partial             | Full generics support        |
| Token Management | Manual in each call | Automatic via interceptor    |
| Error Messages   | Technical English   | User-friendly Persian        |
| Logging          | Manual              | Automatic in dev mode        |
| Pagination       | Custom per endpoint | Built-in `getPaginated<T>()` |

---

## Next Steps

1. **Start with auth.ts** - Already migrated as `auth.v2.ts` example
2. **Migrate one service at a time** - Don't rush, test each one
3. **Update tests** - Mock the new apiClient
4. **Update components** - Handle new response shape
5. **Remove old http.ts** - Once all services migrated

---

## Need Help?

See example implementations:

- `services/auth.v2.ts` - Full authentication service
- `services/profile.v2.ts` - Profile and content fetching
- `lib/apiClient.ts` - Core client implementation

---

## Error Code Reference

| Code               | HTTP Status   | Meaning            |
| ------------------ | ------------- | ------------------ |
| `NETWORK_ERROR`    | -             | Connection failed  |
| `TIMEOUT_ERROR`    | 408, 504      | Request timed out  |
| `UNAUTHORIZED`     | 401           | Not authenticated  |
| `FORBIDDEN`        | 403           | No permission      |
| `NOT_FOUND`        | 404           | Resource not found |
| `VALIDATION_ERROR` | 400           | Invalid input      |
| `SERVER_ERROR`     | 500, 502, 503 | Backend error      |
