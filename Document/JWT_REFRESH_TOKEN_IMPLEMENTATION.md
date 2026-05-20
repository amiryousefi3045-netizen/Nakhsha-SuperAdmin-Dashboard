# JWT Refresh Token System Implementation Guide

## Overview

This document describes the new JWT Refresh Token system for Nakhsha, which provides:

- ✅ Short-lived access tokens (15 minutes) for API requests
- ✅ Long-lived refresh tokens (30 days) for session management
- ✅ Automatic token rotation on refresh (prevents token reuse attacks)
- ✅ Immediate revocation capability (logout)
- ✅ Multi-device session management
- ✅ Security audit trail (IP, device, revision count)

---

## 1. Architecture

### Before (Old System)

```
Client Login (OTP)
    ↓
Server generates 7-day JWT token
    ↓
Client stores token in memory/localStorage
    ↓
If token stolen → 7 days of unauthorized access
    ↓
Logout not possible (token can't be revoked)
```

### After (New System)

```
Client Login (OTP)
    ↓
Server generates:
  - Short-lived AccessToken (15 min)
  - Long-lived RefreshToken (30 days, stored in DB)
    ↓
Client stores:
  - AccessToken in memory (API requests)
  - RefreshToken in secure storage (refresh endpoint)
    ↓
AccessToken expires → Client calls /auth/refresh
    ↓
Server issues new AccessToken + rotates RefreshToken
    ↓
If token stolen → Only 15 min access
    ↓
Logout revokes RefreshToken in DB
```

---

## 2. Database Schema

### RefreshToken Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),           // Owner
  tokenHash: String (unique),              // SHA256(token) - never plaintext
  deviceId: String (optional),             // "device_123" for multi-device
  deviceInfo: {
    userAgent: String,                     // Browser/app identifier
    ipAddress: String,                     // Client IP
    lastUsedAt: Date,                      // When token was last used
  },
  expiresAt: Date,                         // Token validity end
  revokedAt: Date (nullable),              // Revocation timestamp
  rotationCount: Number,                   // How many times rotated
  previousTokenHash: String,               // For detecting reuse attacks
  revocationReason: Enum,                  // LOGOUT, EXPIRED, PASSWORD_CHANGE, etc.
  createdAt: Date,
  updatedAt: Date,
}
```

**Indexes**:

- `tokenHash` (unique): Fast lookup by token
- `userId + revokedAt`: Find active tokens for user
- `userId + expiresAt`: Sort by expiry
- `expiresAt` (TTL): Auto-delete after 30 days

---

## 3. API Endpoints

### POST /api/auth/otp/verify (Modified)

**Old Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {...}
}
```

**New Response**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "refreshExpiresAt": "2026-06-19T12:34:56Z",
  "user": {...},
  "token": "eyJhbGciOiJIUzI1NiIs..." // Deprecated, kept for compatibility
}
```

**Token Lifetimes**:

- `accessToken`: 15 minutes (quick API access)
- `refreshToken`: 30 days (session persistence)

---

### POST /api/auth/refresh (New)

**Purpose**: Get a new access token using a refresh token

**Request**:

```bash
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "a1b2c3d4e5f6..."}'
```

**Request Body**:

```json
{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response (200 OK)**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs... (new)",
  "refreshToken": "z9y8x7w6v5u4t3s2r1q0p... (rotated)",
  "refreshExpiresAt": "2026-06-19T12:34:56Z"
}
```

**What Happens**:

1. Token verified in DB
2. Old token marked as revoked (rotation)
3. New token generated (fresh 30-day expiry)
4. Old token hash stored as `previousTokenHash` (for attack detection)

**Error Responses**:

```json
// Token not found
{"error": {"code": "TOKEN_INVALID", "message": "Invalid refresh token"}}

// Token already revoked (logout)
{"error": {"code": "TOKEN_INVALID", "message": "Token revoked"}}

// Token expired
{"error": {"code": "TOKEN_INVALID", "message": "Token expired"}}
```

---

### POST /api/auth/logout (New)

**Purpose**: Logout current device/session

**Request**:

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "a1b2c3d4e5f6..."}'
```

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**What Happens**:

1. Refresh token marked as revoked with reason "LOGOUT"
2. Token added to revocation list (can't be reused)
3. User must re-login on this device
4. Other devices' sessions remain active

---

### POST /api/auth/logout-all (New)

**Purpose**: Logout from all devices simultaneously

**Request**:

```bash
curl -X POST http://localhost:5000/api/auth/logout-all \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Logged out from all devices",
  "revokedCount": 5
}
```

**Use Cases**:

- User suspects account compromise
- Password change (immediate revocation of all sessions)
- Security incident
- Admin lockout

---

### GET /api/auth/sessions (New)

**Purpose**: List active sessions (devices) for user

**Request**:

```bash
curl -X GET http://localhost:5000/api/auth/sessions \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200 OK)**:

```json
{
  "sessions": [
    {
      "_id": "60d5ec49c1234567890abcd1",
      "deviceId": "device_browser_chrome_windows",
      "deviceInfo": {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
        "ipAddress": "192.168.1.100",
        "lastUsedAt": "2026-05-20T14:30:00Z"
      },
      "expiresAt": "2026-06-19T12:34:56Z",
      "createdAt": "2026-05-20T12:34:56Z"
    },
    {
      "_id": "60d5ec49c1234567890abcd2",
      "deviceId": "device_mobile_safari_ios",
      "deviceInfo": {
        "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 ...)",
        "ipAddress": "203.0.113.50",
        "lastUsedAt": "2026-05-19T10:15:00Z"
      },
      "expiresAt": "2026-06-18T14:22:33Z",
      "createdAt": "2026-05-18T14:22:33Z"
    }
  ]
}
```

**UI Use Case**:

```
Settings → Sessions → Active Devices
┌─────────────────────────────────────┐
│ Browser (Chrome) - Windows          │
│ Last active: 2 hours ago            │
│ IP: 192.168.1.100                   │
│ [Logout from this device]           │
├─────────────────────────────────────┤
│ Mobile (Safari) - iOS               │
│ Last active: Yesterday              │
│ IP: 203.0.113.50                    │
│ [Logout from this device]           │
├─────────────────────────────────────┤
│ [Logout from all devices]           │
└─────────────────────────────────────┘
```

---

## 4. Frontend Implementation

### Token Manager Updates

**Old Token Manager**:

```typescript
const token = localStorage.getItem("auth_token");
// Send as: Authorization: Bearer <token>
```

**New Token Manager**:

```typescript
interface AuthTokens {
  accessToken: string; // Short-lived (15 min)
  refreshToken: string; // Long-lived (30 days)
  refreshExpiresAt: Date; // Expiry of refresh token
}

class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setTokens(accessToken: string, refreshToken: string, refreshExpiresAt: Date) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    // Store refresh token securely (secure storage if available)
    sessionStorage.setItem("refresh_token", refreshToken);
  }

  getAccessToken(): string {
    // Returns current valid access token
    return this.accessToken;
  }

  async refreshAccessToken(): Promise<string> {
    const response = await api.post("/auth/refresh", {
      refreshToken: this.refreshToken,
    });

    // Update tokens
    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;

    return this.accessToken;
  }

  async logout(): Promise<void> {
    await api.post("/auth/logout", {
      refreshToken: this.refreshToken,
    });
    this.clear();
  }

  clear() {
    this.accessToken = null;
    this.refreshToken = null;
    sessionStorage.removeItem("refresh_token");
  }
}
```

### API Interceptor with Auto-Refresh

```typescript
// Add to API client
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If access token expired (401)
    if (
      error.response?.status === 401 &&
      error.response?.data?.error?.code === "TOKEN_EXPIRED"
    ) {
      try {
        // Try to refresh
        const newAccessToken = await tokenManager.refreshAccessToken();

        // Retry original request with new token
        error.config.headers["Authorization"] = `Bearer ${newAccessToken}`;
        return apiClient.request(error.config);
      } catch (refreshError) {
        // Refresh failed → force re-login
        tokenManager.clear();
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);
```

---

## 5. Security Features

### 1. Token Rotation (Prevents Reuse)

```
Timeline:
  T0: User logs in
      AccessToken-1: valid for 15 min
      RefreshToken-1: valid for 30 days

  T1: AccessToken-1 expires (15 min)
      Client calls /auth/refresh with RefreshToken-1
      Server:
        - Revokes RefreshToken-1
        - Issues AccessToken-2 + RefreshToken-2
        - Stores RefreshToken-1 hash in previousTokenHash

  T2: Attacker tries to reuse RefreshToken-1
      Server detects it was already rotated
      Rejects request
      Logs security event
```

### 2. Revocation on Logout

```
Before: Logout = just delete local token
        Token could still be used server-side for 7 days

After:  Logout = mark token as revoked in DB
        Token cannot be used immediately
        All future requests with old token rejected
```

### 3. IP & Device Tracking

```
Each refresh token stores:
  - IP address (detect location change)
  - User Agent (detect device change)
  - Last used timestamp (detect suspicious activity)

Example threat detection:
  Same refresh token used from:
    10.0.0.1 (New York) at 12:00 PM
    203.0.113.50 (Tokyo) at 12:05 PM (5 min gap)
  → Physically impossible → Likely compromised token
```

### 4. Automatic Cleanup

```
MongoDB TTL Index: expiresAt
  Expired tokens auto-deleted after 30 days
  No manual cleanup needed
  Reduces DB bloat
```

---

## 6. Migration Guide (Existing Clients)

### Step 1: Update Login Response Handling

**Before**:

```typescript
const response = await api.post("/auth/otp/verify", { phone, code });
localStorage.setItem("token", response.token);
```

**After**:

```typescript
const response = await api.post("/auth/otp/verify", { phone, code });
tokenManager.setTokens(
  response.accessToken,
  response.refreshToken,
  new Date(response.refreshExpiresAt),
);
```

### Step 2: Update API Requests

**Before**:

```typescript
api.defaults.headers["Authorization"] =
  `Bearer ${localStorage.getItem("token")}`;
```

**After**:

```typescript
api.defaults.headers["Authorization"] =
  `Bearer ${tokenManager.getAccessToken()}`;
```

### Step 3: Add Auto-Refresh Interceptor

See section 4 above for implementation.

### Step 4: Update Logout Handler

**Before**:

```typescript
localStorage.removeItem("token");
```

**After**:

```typescript
await tokenManager.logout();
```

### Step 5: Add Sessions UI (Optional)

Create new "Active Sessions" page using `/api/auth/sessions` endpoint.

---

## 7. Monitoring & Debugging

### Logging

Every token operation is logged:

```
[2026-05-20 14:30:00] Refresh token created: userId=60d5ec49c1234567890abcd1
[2026-05-20 14:31:00] Token refreshed: userId=60d5ec49c1234567890abcd1, rotation=1
[2026-05-20 14:32:00] Token revoked (LOGOUT): userId=60d5ec49c1234567890abcd1
[2026-05-20 14:33:00] All tokens revoked (LOGOUT_ALL): userId=60d5ec49c1234567890abcd1
```

### Metrics to Track

```
- Total active sessions: Sum of non-revoked tokens
- Average session duration: Mean of (revokedAt - createdAt)
- Token rotation rate: Count of rotationCount > 0
- Suspicious activity: Tokens revoked after short duration
- Geographic anomalies: Tokens used from impossible locations
```

### Debugging Endpoints

```bash
# List all sessions for a user (admin)
GET /api/admin/users/{userId}/sessions

# Get token details (debug)
GET /api/debug/tokens/{tokenHash}

# Clear all tokens for user (emergency)
POST /api/admin/users/{userId}/revoke-all
```

---

## 8. Backward Compatibility

The new system maintains backward compatibility:

- Old `token` field still returned in login response
- API accepts both `token` and `accessToken` in Authorization header
- Gradual migration possible (old clients work, new clients get benefits)

**Timeline**:

- Month 1-2: Deploy new system, both old/new work
- Month 2-3: Encourage clients to upgrade
- Month 3+: Deprecate old `token` field (still functional)
- Month 6+: Remove old token system

---

## 9. Testing

### Manual Testing

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "09xxxxxxxxx", "code": "123456"}'
# Response: accessToken, refreshToken, refreshExpiresAt

# 2. Use access token (valid for 15 min)
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"

# 3. Wait 15 minutes, then refresh
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
# Response: New accessToken, new refreshToken

# 4. Logout current session
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'

# 5. Try to use revoked token
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<revokedToken>"}'
# Response: 401 Unauthorized
```

### Automated Tests

```bash
npm run test -- routes/auth.test.js
# Should include:
# - Login returns both tokens ✓
# - Access token expires after 15 min ✓
# - Refresh token rotates on use ✓
# - Old refresh token cannot be reused ✓
# - Logout revokes token ✓
# - Logout-all revokes all tokens ✓
# - Sessions API shows active devices ✓
```

---

## 10. Rollback Procedure

If issues occur:

```bash
# Keep old system active temporarily
ENABLE_OLD_TOKEN_SYSTEM=true npm start

# Clients can use either:
# - New: accessToken + refreshToken
# - Old: token (7-day JWT)

# Gradually migrate users
# Monitor error rates
# Fix issues
# Re-enable new system

# Remove old system
ENABLE_OLD_TOKEN_SYSTEM=false npm start
```

---

## Summary

**What Changed**:

- ✅ Access tokens now 15 minutes instead of 7 days
- ✅ Refresh tokens enable token rotation
- ✅ Logout immediately revokes tokens
- ✅ Multi-device session management
- ✅ Security audit trail for compliance

**Benefits**:

- 🔐 Much stronger security (short access token lifetime)
- 🔄 Automatic token rotation (replay attack prevention)
- 🚪 Immediate logout capability
- 📱 Multi-device session visibility
- 📊 Audit trail for compliance

**Status**: ✅ Phase 0 Item #4 Complete
