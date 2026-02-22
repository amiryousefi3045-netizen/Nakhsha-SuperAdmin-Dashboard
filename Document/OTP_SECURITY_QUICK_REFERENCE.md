# OTP Security Quick Reference

## Security Limits & Timeouts

### Resend Protection

| Parameter                | Default     | Description                             |
| ------------------------ | ----------- | --------------------------------------- |
| Cooldown between resends | 120 seconds | Prevents rapid resend requests          |
| Max resends per hour     | 10          | Blocks phone for 30 min after exceeding |
| Resend window            | 1 hour      | Window for counting resends             |
| Block duration (resends) | 30 minutes  | After exceeding resend limit            |

### Verification Protection

| Parameter                 | Default     | Description                   |
| ------------------------- | ----------- | ----------------------------- |
| Max verification attempts | 8           | Per OTP code                  |
| Block duration (attempts) | 15 minutes  | After exceeding attempt limit |
| OTP code expiry           | 120 seconds | Auto-deleted by MongoDB TTL   |

### Rate Limiting

| Limit Type  | Window     | Max Requests | Status |
| ----------- | ---------- | ------------ | ------ |
| IP-based    | 15 minutes | 10           | 429    |
| Phone-based | 2 minutes  | 5            | 429    |
| Global      | 5 minutes  | 100          | 503    |

### Suspicious Activity Indicators

1. `suspicious_user_agent` - Missing or very short User-Agent
2. `bot_user_agent` - Bot-like User-Agent detected
3. `rapid_requests` - >20 requests per minute from IP
4. `multiple_phones_from_ip` - >5 phones from one IP per hour
5. `verify_without_request` - Verification without OTP request
6. `too_many_verification_attempts` - Exceeded max attempts

**Action threshold:** 3+ indicators = Block request (429)

---

## Environment Variables

```env
# OTP Configuration
OTP_TTL_SECONDS=120                    # OTP code expiry time
OTP_RESEND_SECONDS=120          # Time between resend requests
OTP_MAX_ATTEMPTS=8                     # Max verification attempts

# JWT Configuration
JWT_SECRET=your-secret-key-here        # REQUIRED in production
JWT_TTL=7d                             # Token validity period

# Node Environment
NODE_ENV=production                    # development | production
```

---

## MongoDB Indexes

```javascript
// OtpCode collection
{ phone: 1 }                           // Single field index
{ expiresAt: 1 }, { expireAfterSeconds: 0 }  // TTL index
```

---

## Error Codes

| Code                  | HTTP | Meaning                                 |
| --------------------- | ---- | --------------------------------------- |
| `RATE_LIMITED`        | 429  | Cooldown active or rate limit exceeded  |
| `TEMPORARILY_BLOCKED` | 429  | Phone blocked due to abuse              |
| `TOO_MANY_ATTEMPTS`   | 429  | Max verification attempts exceeded      |
| `TOO_MANY_RESENDS`    | 429  | Max resend requests exceeded            |
| `OTP_INVALID`         | 400  | Wrong OTP code                          |
| `OTP_EXPIRED`         | 400  | OTP code expired                        |
| `VALIDATION_ERROR`    | 400  | Invalid input                           |
| `SERVICE_UNAVAILABLE` | 503  | Database not ready or global rate limit |
| `INTERNAL_ERROR`      | 500  | Server error                            |

---

## Attack Mitigation Matrix

| Attack Type                       | Protection Layer       | Details                           |
| --------------------------------- | ---------------------- | --------------------------------- |
| SMS Flooding                      | Resend limits          | Max 10/hour, 120s cooldown        |
| Brute Force (code guessing)       | Verification attempts  | Max 8 attempts, then 15-min block |
| Distributed attack (multiple IPs) | Phone-based rate limit | 5 req/2min per phone              |
| Single IP attack                  | IP-based rate limit    | 10 req/15min per IP               |
| DDoS                              | Global rate limit      | 100 req/5min system-wide          |
| Bot attacks                       | User-Agent detection   | Auto-block bot patterns           |
| Account enumeration               | Same error messages    | Generic "invalid OTP" response    |
| Timing attacks                    | Timing-safe comparison | Constant-time code verification   |
| Replay attacks                    | Single-use codes       | Delete on success                 |
| Storage bloat                     | TTL index              | Auto-delete expired codes         |

---

## Response Headers

```
X-RateLimit-IP-Remaining: 7
X-RateLimit-IP-Reset: 2026-02-15T12:30:00.000Z
```

---

## Code Locations

| Feature              | File                   | Function/Section           |
| -------------------- | ---------------------- | -------------------------- |
| OTP Model            | `models/OtpCode.js`    | Schema definition          |
| OTP Start            | `routes/auth.js`       | `POST /otp/start`          |
| OTP Verify           | `routes/auth.js`       | `POST /otp/verify`         |
| Rate Limiting        | `utils/rateLimiter.js` | `otpRateLimit` middleware  |
| Suspicious Detection | `utils/rateLimiter.js` | `detectSuspiciousActivity` |
| Logging              | `utils/logger.js`      | Winston logger             |
| Metrics              | `utils/otpMetrics.js`  | OTP metrics tracking       |

---

## Testing Commands

### Test Rate Limiting

```bash
# IP rate limit - make 11 requests
for i in {1..11}; do
  curl -X POST http://localhost:5001/api/auth/otp/start \
    -H "Content-Type: application/json" \
    -d '{"phone":"09123456789"}'
  echo ""
done
```

### Test Resend Limit

```bash
# Request OTP twice within 120 seconds
curl -X POST http://localhost:5001/api/auth/otp/start \
  -H "Content-Type: application/json" \
  -d '{"phone":"09123456789"}'

sleep 5

curl -X POST http://localhost:5001/api/auth/otp/start \
  -H "Content-Type: application/json" \
  -d '{"phone":"09123456789"}'
```

### Test Verification Attempts

```bash
# Try wrong code multiple times
for i in {1..9}; do
  curl -X POST http://localhost:5001/api/auth/otp/verify \
    -H "Content-Type: application/json" \
    -d '{"phone":"09123456789","code":"000000"}'
  echo ""
done
```

### Test Bot Detection

```bash
curl -A "python-requests/2.28.0" \
  -X POST http://localhost:5001/api/auth/otp/start \
  -H "Content-Type: application/json" \
  -d '{"phone":"09123456789"}'
```

---

## Logging Examples

### Successful OTP Start

```
INFO: otp/start: saved { phone: '09123456789', expiresAt: 2026-02-15T12:32:00.000Z, resendCount: 1, clientIP: '127.0.0.1' }
```

### Rate Limited

```
WARN: Blocked suspicious OTP request { phone: '09123456789', clientIP: '127.0.0.1', indicators: ['suspicious_user_agent', 'bot_user_agent', 'rapid_requests'] }
```

### Too Many Attempts

```
WARN: OTP attempts exceeded - phone blocked { phone: '09123456789', attempts: 8, blockedUntil: 2026-02-15T12:45:00.000Z, clientIP: '127.0.0.1' }
```

### Multiple Phones from IP

```
WARN: Suspicious: Multiple phone numbers from same IP { clientIP: '127.0.0.1', phoneCount: 6 }
```

---

## Security Checklist

- [x] OTP codes hashed (never plaintext)
- [x] TTL index for auto-deletion
- [x] Resend cooldown (120s)
- [x] Resend limit (10/hour)
- [x] Verification attempts (max 8)
- [x] IP-based rate limiting
- [x] Phone-based rate limiting
- [x] Global rate limiting
- [x] Temporary blocking (15-30 min)
- [x] IP address tracking
- [x] Suspicious activity detection
- [x] Comprehensive logging
- [x] Timing-safe comparison
- [x] Single-use codes
- [x] Error message consistency

---

## Production Deployment Notes

1. **Set JWT_SECRET** - Required in production environment
2. **Monitor logs** - Watch for suspicious activity patterns
3. **Adjust limits** - Tune rate limits based on actual usage
4. **Consider Redis** - For multi-server deployments
5. **Enable monitoring** - Track OTP metrics and error rates
6. **Test SMS provider** - Verify SMS delivery works correctly
7. **Database indexes** - Ensure indexes are created in production

---

## Support & Maintenance

For issues or questions:

1. Check `backend/logs/` for error details
2. Review `OTP_SECURITY_IMPLEMENTATION.md` for full documentation
3. Monitor `otpMetrics` for unusual patterns
4. Adjust rate limits via environment variables
