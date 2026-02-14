# API Architecture Quick Reference

## 🎯 Before vs After Comparison

### Service Function Signature

```typescript
// ❌ OLD PATTERN
export async function getCraft(id: string): Promise<Craft> {
  const { data } = await http.get(`/crafts/${id}`);
  return data.item;
}

// ✅ NEW PATTERN
export async function getCraft(id: string): Promise<ApiResult<Craft>> {
  return apiClient.get<CraftResponse>(`/crafts/${id}`);
}
```

### Component Usage

```typescript
// ❌ OLD PATTERN - Prone to errors, no type safety
try {
  const craft = await getCraft(id);
  setCraft(craft);
} catch (error) {
  console.error(error); // What type? What happened?
  setError("Error"); // Vague
}

// ✅ NEW PATTERN - Type-safe, explicit error handling
const result = await getCraft(id);

if (result.success && result.data) {
  setCraft(result.data); // ✅ Type-safe
} else {
  // ✅ Structured error with code and message
  setError(result.error?.message || "خطای نامشخص");

  if (result.error?.code === "NOT_FOUND") {
    navigate("/404");
  }
}
```

## 📦 Response Structure

### Standardized ApiResult

```typescript
// Success case
{
  success: true,
  data: {
    id: "123",
    title: "گلیم کاشان",
    price: 1500000
  }
}

// Error case
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "صنعت دستی یافت نشد",
    status: 404
  }
}
```

## 🔑 Common Operations

### GET Request

```typescript
const result = await apiClient.get<DataType>("/endpoint");
```

### POST Request

```typescript
const result = await apiClient.post<ResponseType>("/endpoint", payload);
```

### PATCH/PUT Request

```typescript
const result = await apiClient.patch<ResponseType>("/endpoint/123", updates);
```

### DELETE Request

```typescript
const result = await apiClient.delete<ResponseType>("/endpoint/123");
```

### Paginated GET

```typescript
const result = await apiClient.getPaginated<ItemType>("/endpoint", {
  page: 1,
  limit: 20,
  filter: "value",
});

// result.data = items[]
// result.meta = { page, limit, total, totalPages }
```

### File Upload

```typescript
const formData = new FormData();
formData.append("image", file);

const result = await apiClient.post<UploadResponse>("/upload", formData, {
  headers: { "Content-Type": "multipart/form-data" },
});
```

## 🛡️ Error Codes

| Code               | Meaning            | HTTP Status |
| ------------------ | ------------------ | ----------- |
| `NETWORK_ERROR`    | No connection      | N/A         |
| `TIMEOUT_ERROR`    | Request timeout    | 408/504     |
| `UNAUTHORIZED`     | Not logged in      | 401         |
| `FORBIDDEN`        | No permission      | 403         |
| `NOT_FOUND`        | Resource not found | 404         |
| `VALIDATION_ERROR` | Invalid input      | 400         |
| `SERVER_ERROR`     | Backend error      | 500-503     |
| `UNKNOWN_ERROR`    | Unexpected error   | N/A         |

## 🎨 React Component Pattern

```typescript
function MyComponent() {
  const [data, setData] = useState<DataType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const result = await fetchData();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error?.message || "خطا");
        setData(null);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  if (!data) return <NotFound />;

  return <Content data={data} />;
}
```

## 🔐 Authentication Patterns

```typescript
// Login
const result = await verifyOtp(phone, code);
if (result.success && result.data) {
  const { token, user } = result.data;
  // Token auto-stored, auto-sent with all requests
}

// Check auth
if (isAuthenticated()) {
  // User is logged in
}

// Logout
clearToken();
```

## 📊 Type Definitions Locations

| Type Category     | File                 | Example                             |
| ----------------- | -------------------- | ----------------------------------- |
| API Client Core   | `types/apiClient.ts` | `ApiResult`, `ApiError`             |
| Backend Responses | `types/services.ts`  | `CraftResponse`, `OtpStartResponse` |
| Domain Models     | `types/api.ts`       | `Craft`, `User`, `Comment`          |

## ✅ Checklist for New Service Functions

- [ ] Return type is `Promise<ApiResult<T>>` or `Promise<PaginatedResult<T>>`
- [ ] Use `apiClient` instead of `http`
- [ ] Add JSDoc comment with description
- [ ] Include usage example in JSDoc
- [ ] Define backend response type in `types/services.ts`
- [ ] Extract data from wrapper response if needed
- [ ] No try/catch (apiClient handles errors)
- [ ] No throwing errors (return ApiResult instead)

## 🚀 Quick Start Template

````typescript
/**
 * [Function description]
 *
 * @param [param] - [description]
 * @returns ApiResult with [data type]
 *
 * @example
 * ```ts
 * const result = await myFunction(param);
 * if (result.success && result.data) {
 *   // Use result.data
 * } else {
 *   console.error(result.error?.message);
 * }
 * ```
 */
export async function myFunction(
  param: ParamType,
): Promise<ApiResult<ReturnType>> {
  const result = await apiClient.METHOD<BackendResponseType>(
    "/endpoint",
    data, // if POST/PUT/PATCH
  );

  // If backend wraps data, extract it
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<ReturnType>;
}
````

---

**Reference**: See [API_REFACTORING_GUIDE.md](./API_REFACTORING_GUIDE.md) for full details.
