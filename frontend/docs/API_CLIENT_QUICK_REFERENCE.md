# API Client Quick Reference

## Import

```ts
import {
  apiClient,
  type ApiResult,
  type PaginatedResult,
} from "@/lib/apiClient";
```

---

## HTTP Methods

### GET

```ts
const result = await apiClient.get<Craft>(`/crafts/${id}`);
```

### POST

```ts
const result = await apiClient.post<Craft>("/crafts", craftData);
```

### PUT

```ts
const result = await apiClient.put<Craft>(`/crafts/${id}`, updates);
```

### PATCH

```ts
const result = await apiClient.patch<User>("/users/me", partialUpdate);
```

### DELETE

```ts
const result = await apiClient.delete(`/crafts/${id}`);
```

### Paginated GET

```ts
const result = await apiClient.getPaginated<Craft>("/crafts", {
  page: 1,
  limit: 20,
});
```

---

## Response Handling

### Success Check

```ts
const result = await apiClient.get<Craft[]>("/crafts");

if (result.success) {
  console.log(result.data); // Craft[]
} else {
  console.error(result.error?.message); // Persian error message
}
```

### Paginated Response

```ts
const result = await apiClient.getPaginated<Craft>("/crafts");

if (result.success) {
  console.log(result.data); // Craft[]
  console.log(result.meta?.total); // 150
  console.log(result.meta?.page); // 1
  console.log(result.meta?.limit); // 20
  console.log(result.meta?.totalPages); // 8
}
```

---

## Type Definitions

### ApiResult<T>

```ts
interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
```

### PaginatedResult<T>

```ts
interface PaginatedResult<T> extends ApiResult<T[]> {
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### ApiError

```ts
interface ApiError {
  code: ApiErrorCode;
  message: string; // User-friendly Persian message
  details?: unknown;
  status?: number;
}
```

---

## Common Patterns

### Basic Service Function

```ts
export async function getCraft(id: string): Promise<ApiResult<Craft>> {
  return apiClient.get<Craft>(`/crafts/${id}`);
}
```

### With Query Parameters

```ts
export async function searchCrafts(query: string): Promise<ApiResult<Craft[]>> {
  return apiClient.get<Craft[]>("/crafts/search", {
    params: { q: query },
  });
}
```

### File Upload

```ts
export async function uploadFile(
  file: File,
): Promise<ApiResult<{ url: string }>> {
  const formData = new FormData();
  formData.append("file", file);

  return apiClient.post<{ url: string }>("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
```

### Extract Nested Data

```ts
export async function getUser(): Promise<ApiResult<User>> {
  const result = await apiClient.get<{ user: User }>("/auth/me");

  if (result.success && result.data?.user) {
    return { success: true, data: result.data.user };
  }

  return result as ApiResult<User>;
}
```

---

## Component Usage

### Basic Fetch

```tsx
const [data, setData] = useState<Craft[]>([]);
const [error, setError] = useState("");

useEffect(() => {
  const load = async () => {
    const result = await getCrafts();

    if (result.success) {
      setData(result.data || []);
    } else {
      setError(result.error?.message || "خطا در بارگذاری");
    }
  };

  load();
}, []);
```

### With Loading State

```tsx
const [state, setState] = useState({
  data: [] as Craft[],
  loading: true,
  error: "",
});

useEffect(() => {
  getCrafts().then((result) => {
    setState({
      data: result.success ? result.data || [] : [],
      loading: false,
      error: result.error?.message || "",
    });
  });
}, []);
```

### Handle Specific Errors

```tsx
const handleSubmit = async (data: CraftCreateRequest) => {
  const result = await createCraft(data);

  if (result.success) {
    toast.success("صنعت‌دستی با موفقیت ایجاد شد");
    navigate(`/crafts/${result.data?.id}`);
  } else {
    // Check error code for specific handling
    if (result.error?.code === "VALIDATION_ERROR") {
      setFieldErrors(result.error.details);
    } else if (result.error?.code === "UNAUTHORIZED") {
      navigate("/login");
    } else {
      toast.error(result.error?.message || "خطا در ایجاد");
    }
  }
};
```

---

## Error Codes

| Code               | Meaning                  |
| ------------------ | ------------------------ |
| `NETWORK_ERROR`    | اتصال به سرور برقرار نشد |
| `TIMEOUT_ERROR`    | زمان درخواست تمام شد     |
| `UNAUTHORIZED`     | نیاز به ورود دارید       |
| `FORBIDDEN`        | دسترسی مجاز نیست         |
| `NOT_FOUND`        | یافت نشد                 |
| `VALIDATION_ERROR` | خطای اعتبارسنجی          |
| `SERVER_ERROR`     | خطای سرور                |

---

## Token Management

### Automatic (Recommended)

```ts
// Token automatically added to all requests via interceptor
const result = await apiClient.get("/protected-route");
```

### Manual (if needed)

```ts
import { tokenManager } from "@/lib/apiClient";

// Get token
const token = tokenManager.getToken();

// Set token
tokenManager.setToken("jwt-token-here");

// Remove token
tokenManager.removeToken();
```

---

## Custom Headers

```ts
const result = await apiClient.get<Craft>(`/crafts/${id}`, {
  headers: {
    "X-Custom-Header": "value",
  },
});
```

---

## Timeouts

```ts
const result = await apiClient.get<Craft[]>("/crafts", {
  timeout: 10000, // 10 seconds
});
```

---

## Summary

✅ All responses: `ApiResult<T>` or `PaginatedResult<T>`  
✅ Always check `result.success` before using `result.data`  
✅ Display `result.error?.message` to users (Persian)  
✅ Tokens managed automatically  
✅ No need for try-catch in service functions  
✅ Full TypeScript support

---

**See also:**

- [Full Migration Guide](./API_CLIENT_MIGRATION.md)
- [apiClient Source](../src/lib/apiClient.ts)
- [Example: auth.v2.ts](../src/services/auth.v2.ts)
- [Example: profile.v2.ts](../src/services/profile.v2.ts)
