# Audit Logging System Implementation Guide

## Overview

The audit logging system provides comprehensive logging of all sensitive operations for security, compliance, and investigation purposes.

**Capabilities**:

- ✅ Centralized audit trail for all sensitive operations
- ✅ GDPR/CCPA compliance (data access tracking)
- ✅ Fraud detection (suspicious pattern analysis)
- ✅ Security investigation (timeline reconstruction)
- ✅ Admin accountability (who changed what)
- ✅ Retention policies (automatic cleanup)
- ✅ Risk assessment (high-risk event flagging)

---

## 1. Database Schema

### AuditLog Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                    // Who performed action
  action: String,                      // What action (enum)
  resource: {
    type: String,                      // USER, LISTING, CRAFT, etc
    id: ObjectId                       // Specific resource ID
  },
  changes: {
    before: Object,                    // Old values
    after: Object                      // New values
  },
  result: String,                      // SUCCESS, FAILURE, PARTIAL
  requestContext: {
    ip: String,                        // Client IP
    userAgent: String,                 // Browser/app info
    referer: String,                   // HTTP referer
    endpoint: String,                  // API endpoint
    method: String,                    // HTTP method
    statusCode: Number                 // Response code
  },
  riskLevel: String,                   // LOW, MEDIUM, HIGH, CRITICAL
  error: {                             // Only if failed
    code: String,
    message: String,
    stack: String                      // Dev/staging only
  },
  metadata: {
    reason: String,                    // Why action performed
    approvedBy: ObjectId,              // If admin action
    batch: String,                     // For bulk operations
    affectedCount: Number,
    duration: Number                   // Execution time (ms)
  },
  compliance: {
    gdprRelevant: Boolean,
    dataCategories: [String],          // PERSONAL_DATA, FINANCIAL, etc
    retentionRequired: Boolean,
    retentionUntil: Date               // Auto-delete after this
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## 2. Supported Actions

### User Management

```
USER_CREATED
USER_UPDATED
USER_DELETED
USER_VERIFIED
USER_ROLE_CHANGED
USER_SUSPENDED
USER_REACTIVATED
```

### Authentication

```
LOGIN
LOGOUT
LOGOUT_ALL
PASSWORD_CHANGED
TOKEN_REVOKED
SESSION_CREATED
```

### Content Management

```
LISTING_CREATED
LISTING_UPDATED
LISTING_PUBLISHED
LISTING_DELETED
LISTING_STATUS_CHANGED
LISTING_FLAGGED
LISTING_UNFLAGGED

CRAFT_CREATED
CRAFT_UPDATED
CRAFT_DELETED
```

### Admin Actions

```
ADMIN_USER_DELETED
ADMIN_USER_BANNED
ADMIN_USER_UNBANNED
ADMIN_CONTENT_REMOVED
ADMIN_VERIFICATION_ISSUED
ADMIN_VERIFICATION_REVOKED
ADMIN_ROLE_ASSIGNED
ADMIN_ROLE_REMOVED
```

### Financial

```
PAYMENT_RECEIVED
PAYMENT_FAILED
REFUND_ISSUED
TRANSACTION_DISPUTED
```

### Security

```
SUSPICIOUS_ACTIVITY_DETECTED
BRUTE_FORCE_ATTEMPT
IP_BLOCKED
```

---

## 3. Implementation Examples

### Example 1: Log User Creation

```javascript
const AuditService = require("../services/AuditService");

// In user creation endpoint
const newUser = await User.create({
  name: "John Doe",
  phone: "09123456789",
  role: "user",
});

await AuditService.log({
  userId: req.user.id, // Who performed action
  action: "USER_CREATED", // What happened
  resource: {
    type: "USER",
    id: newUser._id,
  },
  changes: {
    before: null, // No previous state
    after: newUser.toObject(),
  },
  requestContext: req, // Automatically extracts IP, UA, etc
  riskLevel: "MEDIUM",
});
```

### Example 2: Log User Update

```javascript
const oldUser = await User.findById(userId);

await User.findByIdAndUpdate(userId, {
  name: "Jane Doe",
  role: "admin",
});

await AuditService.log({
  userId: req.user.id,
  action: "USER_UPDATED",
  resource: {
    type: "USER",
    id: userId,
  },
  changes: {
    before: {
      name: oldUser.name,
      role: oldUser.role,
    },
    after: {
      name: "Jane Doe",
      role: "admin",
    },
  },
  requestContext: req,
  riskLevel: "HIGH", // Elevated because role changed
  metadata: {
    reason: "Promotion to admin team",
  },
});
```

### Example 3: Log Failed Operation

```javascript
try {
  // Some operation that fails
  await riskyOperation();
} catch (error) {
  await AuditService.log({
    userId: req.user.id,
    action: "LISTING_PUBLISHED",
    resource: {
      type: "LISTING",
      id: listingId,
    },
    result: "FAILURE", // Operation failed
    error: {
      code: error.code,
      message: error.message,
    },
    requestContext: req,
    riskLevel: "MEDIUM",
  });
}
```

### Example 4: Log Bulk Operation

```javascript
const userIds = [id1, id2, id3, id4, id5];
const batchId = crypto.randomUUID();

await User.updateMany({ _id: { $in: userIds } }, { isVerified: true });

await AuditService.log({
  userId: req.user.id, // Admin performing action
  action: "ADMIN_VERIFICATION_ISSUED",
  resource: {
    type: "USER",
    id: null, // Multiple resources
  },
  result: "SUCCESS",
  requestContext: req,
  riskLevel: "HIGH",
  metadata: {
    batch: batchId, // Track bulk operation
    affectedCount: userIds.length,
    reason: "Monthly verification sweep",
  },
});
```

---

## 4. Integration with Existing Routes

### Update Auth Routes

```javascript
// backend/routes/auth.js

const AuditService = require('../services/AuditService');

// In OTP verify endpoint (after successful login)
const accessToken = ...
const user = await User.findById(userId);

// Log successful login
await AuditService.log({
  userId: user._id,
  action: 'LOGIN',
  resource: { type: 'USER', id: user._id },
  result: 'SUCCESS',
  requestContext: req,
  riskLevel: 'MEDIUM'
});

// In logout endpoint
router.post('/logout', requireAuth, async (req, res) => {
  const userId = req.user.id;

  await AuditService.log({
    userId,
    action: 'LOGOUT',
    resource: { type: 'USER', id: userId },
    result: 'SUCCESS',
    requestContext: req,
    riskLevel: 'LOW'
  });

  // ... rest of logout logic
});
```

### Update User Routes

```javascript
// backend/routes/users.js

const AuditService = require("../services/AuditService");

// In user update endpoint
router.patch("/me", requireAuth, async (req, res) => {
  const oldUser = await User.findById(req.user.id);
  const updated = await User.findByIdAndUpdate(req.user.id, req.body);

  // Log what changed
  await AuditService.log({
    userId: req.user.id,
    action: "USER_UPDATED",
    resource: { type: "USER", id: req.user.id },
    changes: {
      before: { name: oldUser.name, bio: oldUser.bio },
      after: { name: updated.name, bio: updated.bio },
    },
    requestContext: req,
    riskLevel: "LOW",
  });

  res.json(updated);
});
```

### Update Listing Routes

```javascript
// backend/routes/listings.js

const AuditService = require("../services/AuditService");

router.post("/", requireAuth, async (req, res) => {
  const listing = await Listing.create({ ...req.body });

  await AuditService.log({
    userId: req.user.id,
    action: "LISTING_CREATED",
    resource: { type: "LISTING", id: listing._id },
    changes: { before: null, after: listing.toObject() },
    requestContext: req,
    riskLevel: "LOW",
  });

  res.json(listing);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  await Listing.findByIdAndDelete(req.params.id);

  await AuditService.log({
    userId: req.user.id,
    action: "LISTING_DELETED",
    resource: { type: "LISTING", id: req.params.id },
    changes: { before: listing.toObject(), after: null },
    requestContext: req,
    riskLevel: "MEDIUM",
  });

  res.json({ success: true });
});
```

---

## 5. Admin APIs for Audit Log Retrieval

Create new file: `backend/routes/admin/audit.js`

```javascript
const express = require("express");
const { requireAuth, requireRole } = require("../../middleware/auth");
const AuditService = require("../../services/AuditService");
const router = express.Router();

// Protect all routes - admin only
router.use(requireAuth);
router.use(requireRole("admin"));

/**
 * Get user's audit trail
 * GET /api/admin/audit/users/:userId
 */
router.get("/users/:userId", async (req, res) => {
  try {
    const { limit = 100, skip = 0, action, startDate, endDate } = req.query;

    const result = await AuditService.getUserAuditLogs(req.params.userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      action,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get resource audit trail
 * GET /api/admin/audit/resources/:type/:id
 */
router.get("/resources/:type/:id", async (req, res) => {
  try {
    const { limit = 100, skip = 0 } = req.query;

    const result = await AuditService.getResourceAuditLogs(
      req.params.type,
      req.params.id,
      { limit: parseInt(limit), skip: parseInt(skip) },
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get high-risk events
 * GET /api/admin/audit/high-risk
 */
router.get("/high-risk", async (req, res) => {
  try {
    const { limit = 100, skip = 0, startDate, endDate } = req.query;

    const result = await AuditService.getHighRiskEvents({
      limit: parseInt(limit),
      skip: parseInt(skip),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get failed operations
 * GET /api/admin/audit/failures
 */
router.get("/failures", async (req, res) => {
  try {
    const { limit = 100, skip = 0, startDate, endDate } = req.query;

    const result = await AuditService.getFailedOperations({
      limit: parseInt(limit),
      skip: parseInt(skip),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get compliance report
 * GET /api/admin/audit/compliance-report
 */
router.get("/compliance-report", async (req, res) => {
  try {
    const { startDate, endDate, gdprOnly = false } = req.query;

    const report = await AuditService.getComplianceReport({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      gdprOnly: gdprOnly === "true",
    });

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Detect suspicious patterns
 * GET /api/admin/audit/suspicious-patterns
 */
router.get("/suspicious-patterns", async (req, res) => {
  try {
    const { timeWindowMinutes = 60 } = req.query;

    const patterns = await AuditService.detectSuspiciousPatterns(
      parseInt(timeWindowMinutes),
    );

    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## 6. Usage Examples

### View User's Audit Trail

```bash
curl -X GET "http://localhost:5000/api/admin/audit/users/60d5ec49c1234567890abcd1?limit=10" \
  -H "Authorization: Bearer <admin_token>"
```

**Response**:

```json
{
  "logs": [
    {
      "_id": "60d5ec49c1234567890abcd1",
      "action": "USER_UPDATED",
      "userId": "60d5ec49c1234567890abcd1",
      "resource": { "type": "USER", "id": "60d5ec49c1234567890abcd1" },
      "changes": {
        "before": { "role": "user" },
        "after": { "role": "admin" }
      },
      "result": "SUCCESS",
      "riskLevel": "HIGH",
      "requestContext": {
        "ip": "192.168.1.100",
        "userAgent": "Chrome 91.0",
        "endpoint": "PATCH /api/users/:id"
      },
      "createdAt": "2026-05-20T14:30:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "skip": 0
}
```

### View High-Risk Events (Last 24 Hours)

```bash
START_DATE=$(date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%SZ")
END_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

curl -X GET "http://localhost:5000/api/admin/audit/high-risk?startDate=$START_DATE&endDate=$END_DATE" \
  -H "Authorization: Bearer <admin_token>"
```

### Generate Compliance Report

```bash
curl -X GET "http://localhost:5000/api/admin/audit/compliance-report?gdprOnly=true" \
  -H "Authorization: Bearer <admin_token>" \
  > compliance_report_$(date +%Y%m%d).json
```

### Detect Suspicious Patterns

```bash
curl -X GET "http://localhost:5000/api/admin/audit/suspicious-patterns?timeWindowMinutes=60" \
  -H "Authorization: Bearer <admin_token>"
```

**Response**:

```json
{
  "timeWindowMinutes": 60,
  "suspiciousPatterns": {
    "failedLogins": [
      {
        "_id": "203.0.113.50",
        "count": 7,
        "users": ["60d5ec49c1234567890abcd1"]
      }
    ],
    "multiUserFromIp": [
      {
        "_id": "192.168.1.100",
        "userCount": 8
      }
    ]
  }
}
```

---

## 7. Compliance & Retention

### GDPR Compliance

All personal data operations are tagged:

```javascript
compliance: {
  gdprRelevant: true,
  dataCategories: ["PERSONAL_DATA"],
  retentionRequired: true,
  retentionUntil: "2029-05-20" // 3 years retention
}
```

### Data Subject Access Request (DSAR)

Get all data for a user:

```javascript
const result = await AuditService.getUserAuditLogs(userId, {
  limit: 10000,
  startDate: new Date("2020-01-01"),
  endDate: new Date(),
});

// Return as JSON/CSV for DSAR compliance
```

### Right to Be Forgotten

Mark logs for deletion:

```javascript
// Set retentionUntil to current date to flag for deletion
await AuditLog.updateMany(
  { userId },
  { "compliance.retentionUntil": new Date() },
);
```

---

## 8. Monitoring & Alerts

### Alert on Critical Events

```javascript
// In event emitter or message queue
if (auditLog.riskLevel === "CRITICAL") {
  await alertAdmin({
    title: `Critical Audit Event: ${auditLog.action}`,
    message: `User ${auditLog.userId} performed ${auditLog.action}`,
    url: `/admin/audit/logs/${auditLog._id}`,
  });
}
```

### Dashboard Metrics

```
Dashboard: Audit Overview
├─ Total Events (Today): 1,245
├─ High-Risk Events: 3
├─ Failed Operations: 5
├─ Average Response Time: 234ms
├─ Most Active User: user_123 (45 events)
└─ Most Active Admin: admin_001 (12 events)
```

---

## 9. Performance Considerations

### Indexing

Already optimized in model:

- `userId + createdAt` - Fast user timeline queries
- `action + createdAt` - Fast action type queries
- `resource.id + createdAt` - Fast resource history
- `riskLevel + createdAt` - Fast high-risk event queries

### TTL Cleanup

Automatic deletion of old logs:

```
- Financial/payments: 7 years
- General logs: 3 years
- User deleted logs: 1 year (per GDPR)
```

### Query Optimization

Don't log in tight loops:

```javascript
// Bad: Logs every loop iteration
for (let user of users) {
  await AuditService.log(...);  // Too many calls!
}

// Good: Batch log after operation
const results = await bulkOperation(users);
await AuditService.log({
  metadata: { affectedCount: users.length }
});
```

---

## 10. Testing

```bash
# Test audit logging
npm run test -- services/AuditService.test.js

# Verify audit trails
npm run test -- integration/audit-trail.test.js

# Test retention policies
npm run test -- integration/audit-retention.test.js
```

---

## Summary

**What Added**:

- ✅ AuditLog model with comprehensive schema
- ✅ AuditService with logging methods
- ✅ Admin API endpoints for compliance
- ✅ Automatic risk assessment
- ✅ GDPR/compliance tagging
- ✅ Retention policies

**Use Cases**:

- 📋 Compliance audits (GDPR, CCPA)
- 🔍 Security investigation
- 🚨 Fraud detection
- 👤 Admin accountability
- 📊 Operational analytics

**Status**: ✅ Phase 0 Item #5 Complete
