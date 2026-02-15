# OTP Authentication Security Implementation

## Overview

This document describes the comprehensive security measures implemented for the OTP-based authentication system in Nakhsha backend.

## Security Features Implemented

### 1. ✅ MongoDB TTL Index

**Location:** `models/OtpCode.js`

```javascript
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**Purpose:**

- Automatically deletes expired OTP codes from database
- Prevents storage bloat
- Ensures old codes cannot be reused
- MongoDB handles cleanup automatically

**Configuration:**

- TTL: `OTP_TTL_SECONDS` (default: 120 seconds)

---

### 2. ✅ Resend Attempt Limiting

**Location:** `routes/auth.js` - `/otp/start` endpoint

**Limits:**

- **Cooldown:** 120 seconds between resend requests (configurable via `OTP_RESEND_COOLDOWN_SECONDS`)
- **Max resends:** 10 per hour per phone number
- **Block duration:** 30 minutes after exceeding limit

**Implementation:**

```javascript
const MAX_RESEND_PER_HOUR = 10;
const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

if (existing.resendCount >= MAX_RESEND_PER_HOUR) {
  existing.blockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  // Returns 429 status with block details
}
```

**Tracked Fields:**

- `resendCount`: Number of resend requests
- `lastSentAt`: Timestamp of last OTP sent
- `blockedUntil`: Temporary block expiration time
- `createdAt`: Window start time

---

### 3. ✅ Verification Attempt Limiting

**Location:** `routes/auth.js` - `/otp/verify` endpoint

**Limits:**

- **Max attempts:** 8 per OTP code (configurable via `OTP_MAX_ATTEMPTS`)
- **Block duration:** 15 minutes after exceeding limit
- **Tracking:** Per-code attempt counter with timestamps

**Implementation:**

```javascript
if (record.attempts >= OTP_MAX_ATTEMPTS) {
  record.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  // Logs suspicious activity
  // Returns 429 status with block details
}
```

**Features:**

- Increments counter on each failed attempt
- Tracks `lastAttemptAt` timestamp
- Automatically blocks phone number after max attempts
- Provides `attemptsRemaining` in response
- Deletes OTP record on successful verification (prevents reuse)

---

### 4. ✅ Brute-Force Attack Prevention

**Multi-layered approach:**

#### A. IP-Based Rate Limiting

**Config:** `utils/rateLimiter.js`

```javascript
IP_WINDOW_MINUTES: 15,
IP_MAX_ATTEMPTS: 10,
```

- Tracks requests per IP address
- 10 requests per 15-minute window
- Returns 429 status when exceeded

#### B. Phone-Based Rate Limiting

```javascript
PHONE_WINDOW_MINUTES: 2,
PHONE_MAX_ATTEMPTS: 5,
```

- Tracks requests per phone number
- 5 requests per 2-minute window
- Prevents targeting specific numbers

#### C. Global Rate Limiting

```javascript
GLOBAL_WINDOW_MINUTES: 5,
GLOBAL_MAX_ATTEMPTS: 100,
```

- System-wide request limit
- Protects against DDoS
- Returns 503 status when exceeded

#### D. Sequential Attack Prevention

- Resend limits prevent SMS flooding
- Verification limits prevent code guessing
- Temporary phone blocking (15-30 minutes)
- IP tracking per phone number

---

### 5. ✅ Rate Limiter per IP and Phone

**Location:** `utils/rateLimiter.js` - `otpRateLimit` middleware

**Applied to:**

- `POST /api/auth/otp/start`
- `POST /api/auth/otp/verify`

**Features:**

- In-memory rate limit store (Map-based)
- Separate windows for IP and phone
- Automatic cleanup of expired entries
- Rate limit headers in response:
  - `X-RateLimit-IP-Remaining`
  - `X-RateLimit-IP-Reset`

**Implementation:**

```javascript
// IP check
const ipLimit = checkRateLimit(clientIP, "ip");
if (!ipLimit.allowed) {
  return res.status(429).json({
    message: "تعداد درخواست‌ها از این IP بیش از حد مجاز است",
    retryAfterSeconds: ipLimit.retryAfterSeconds,
  });
}

// Phone check
const phoneLimit = checkRateLimit(phone, "phone");
if (!phoneLimit.allowed) {
  return res.status(429).json({
    message: "تعداد درخواست‌ها برای این شماره بیش از حد مجاز است",
    retryAfterSeconds: phoneLimit.retryAfterSeconds,
  });
}
```

---

### 6. ✅ Suspicious Activity Logging

**Location:** `utils/rateLimiter.js` - `detectSuspiciousActivity()`

**Detects:**

1. **Missing/Suspicious User-Agent**
   - No User-Agent header
   - Very short User-Agent (< 10 chars)
   - Indicator: `suspicious_user_agent`

2. **Bot-like Activity**
   - Patterns: bot, spider, crawler, curl, wget, python, axios, node
   - Indicator: `bot_user_agent`

3. **Rapid Requests**
   - More than 20 requests per minute from same IP
   - Indicator: `rapid_requests`

4. **Multiple Phone Numbers from Same IP**
   - More than 5 different phone numbers from one IP per hour
   - Indicator: `multiple_phones_from_ip`

5. **Verification Without Request**
   - Trying to verify OTP without requesting one first
   - Indicator: `verify_without_request`

6. **Too Many Verification Attempts**
   - Exceeding max verification attempts
   - Indicator: `too_many_verification_attempts`

**Logging Implementation:**

```javascript
logger.warn("Suspicious OTP activity detected", {
  clientIP,
  phone,
  userAgent,
  indicators: suspiciousIndicators,
  indicatorCount: suspiciousIndicators.length,
  timestamp: new Date().toISOString(),
});

// Also recorded to metrics
otpMetrics.recordSuspiciousActivity(indicators, phone, ip, userAgent);
```

**Actions on Detection:**

- Logs warning with comprehensive details
- Records to metrics system
- Blocks request if 3+ indicators detected
- Returns 429 status with error message

---

## Database Schema

### OtpCode Model

```javascript
{
  phone: String,              // Indexed for fast lookup
  codeHash: String,           // Hashed code (NEVER plaintext)
  expiresAt: Date,            // TTL index trigger
  attempts: Number,           // Verification attempt counter
  resendCount: Number,        // Resend request counter
  lastSentAt: Date,           // Last OTP send time
  lastAttemptAt: Date,        // Last verification attempt
  blockedUntil: Date,         // Temporary block expiration
  ipAddresses: [String],      // Track IPs for this phone (max 5)
  createdAt: Date,            // Auto-generated
  updatedAt: Date,            // Auto-generated
}
```

**Indexes:**

- `phone`: Single field index for lookups
- `expiresAt`: TTL index for auto-deletion

---

## Environment Variables

```bash
# OTP TTL (seconds)
OTP_TTL_SECONDS=120

# Resend cooldown (seconds)
OTP_RESEND_COOLDOWN_SECONDS=120

# Max verification attempts
OTP_MAX_ATTEMPTS=8

# JWT configuration
JWT_SECRET=your-secret-key
JWT_TTL=7d
```

---

## Error Responses

### 1. Rate Limited (429)

```json
{
  "error": "RATE_LIMITED",
  "message": "لطفاً N ثانیه صبر کنید",
  "details": {
    "retryAfterSeconds": 60,
    "cooldown": true
  }
}
```

### 2. Temporarily Blocked (429)

```json
{
  "error": "TEMPORARILY_BLOCKED",
  "message": "این شماره موقتاً مسدود است. N دقیقه صبر کنید",
  "details": {
    "retryAfterSeconds": 900,
    "blocked": true
  }
}
```

### 3. Too Many Attempts (429)

```json
{
  "error": "TOO_MANY_ATTEMPTS",
  "message": "تعداد تلاش‌ها بیش از حد. این شماره به مدت N دقیقه مسدود شد",
  "details": {
    "retryAfterSeconds": 900,
    "blocked": true
  }
}
```

### 4. Invalid OTP (400)

```json
{
  "error": "OTP_INVALID",
  "message": "",
  "details": {
    "field": "code",
    "attemptsRemaining": 5
  }
}
```

### 5. Expired OTP (400)

```json
{
  "error": "OTP_EXPIRED",
  "message": "کد منقضی شده است. لطفاً کد جدید درخواست کنید",
  "details": {
    "field": "code",
    "expired": true
  }
}
```

---

## Security Best Practices

### ✅ Implemented

1. **OTP codes are hashed** - Never stored in plaintext
2. **TTL on OTP records** - Auto-delete expired codes
3. **Rate limiting** - IP and phone-based limits
4. **Resend limits** - Prevent SMS flooding
5. **Verification limits** - Prevent brute-force guessing
6. **Temporary blocking** - Auto-block after abuse
7. **IP tracking** - Monitor distributed attacks
8. **Suspicious activity detection** - Bot and attack pattern detection
9. **Comprehensive logging** - All security events logged
10. **Timing-safe comparison** - Prevents timing attacks on code verification

### 🔒 SMS Provider Security

- Existing SMS provider maintained (Melipayamak)
- SMS sent asynchronously (non-blocking)
- Timeout handling in SMS service
- Success/failure logged to metrics
- No plaintext codes in logs

### 🚀 Future Enhancements (Optional)

1. **Redis for rate limiting** - Replace in-memory store for multi-server deployments
2. **Geolocation checks** - Flag requests from unexpected countries
3. **Device fingerprinting** - Track suspicious device patterns
4. **CAPTCHA integration** - Add after suspicious activity detected
5. **IP reputation services** - Block known malicious IPs
6. **SMS provider fallback** - Multiple SMS providers for reliability
7. **Admin dashboard** - Monitor security events in real-time
8. **Rate limit per account** - Additional user-level limits after registration

---

## Testing Recommendations

### Manual Testing

1. **Test resend cooldown:**

   ```bash
   # Request OTP twice rapidly
   curl -X POST http://localhost:5001/api/auth/otp/start \
     -H "Content-Type: application/json" \
     -d '{"phone":"09123456789"}'
   ```

2. **Test max resends:**

   ```bash
   # Request OTP 11 times within an hour
   # Should block on 11th attempt
   ```

3. **Test verification attempts:**

   ```bash
   # Try wrong code 8+ times
   # Should block after 8 attempts
   ```

4. **Test IP rate limiting:**

   ```bash
   # Make 11 requests from same IP within 15 minutes
   # Should block on 11th attempt
   ```

5. **Test suspicious activity:**
   ```bash
   # Request with bot User-Agent
   curl -A "curl/7.0" http://localhost:5001/api/auth/otp/start ...
   ```

### Automated Testing

Create test suite covering:

- Resend limits
- Verification limits
- Rate limits (IP, phone, global)
- Suspicious activity detection
- Temporary blocking
- TTL expiration
- Error responses

---

## Monitoring

### Key Metrics to Monitor

1. **OTP request rate** - Requests per minute/hour
2. **Failed verification rate** - Percentage of failed attempts
3. **Blocked phones** - Count of temporarily blocked numbers
4. **Blocked IPs** - Count of rate-limited IPs
5. **Suspicious activity** - Count and types of indicators
6. **SMS failures** - SMS delivery success rate
7. **Average verification time** - User experience metric

### Log Locations

- Application logs: `backend/logs/`
- Security events: Search for "warn" level logs
- OTP metrics: Available via `otpMetrics` service

---

## Migration Notes

### Database Migration

No migration needed. New fields will be auto-created on first OTP request:

- `resendCount`
- `lastAttemptAt`
- `blockedUntil`
- `ipAddresses`

### Breaking Changes

**None.** All changes are backward compatible.

### Rollback Plan

If issues occur:

1. Comment out rate limiting middleware in routes
2. Remove resend limit checks
3. Revert to simple verification attempt logic
4. Original code preserved in git history

---

## Summary

All security requirements have been successfully implemented:

- ✅ OTP codes have MongoDB TTL index
- ✅ Resend attempts limited per phone number (10/hour)
- ✅ Verification attempts limited per code (8 max)
- ✅ Brute-force prevention (multi-layered)
- ✅ Rate limiter works per IP and phone
- ✅ Suspicious activity logged comprehensively

The implementation maintains the existing SMS provider and login flow while adding comprehensive security safeguards against abuse, brute-force attacks, and fraudulent activity.
