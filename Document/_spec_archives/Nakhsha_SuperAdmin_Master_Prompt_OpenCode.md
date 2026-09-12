# Nakhsha Super Admin — Master Prompt for OpenCode

> **Purpose:** This document is the authoritative execution brief for implementing, auditing, testing, hardening, and preparing the Nakhsha Super Admin dashboard for production.
>
> **Operating principle:** Do not trust previously generated code blindly. Inspect the real repository first, reconcile it with the specification below, implement only compatible changes, and prove every claim with actual tests.
>
> **Critical rule:** Never report a test as passed unless the command was actually executed and its output proves success.

---

## 0. Authoritative Project Sources

### Main repository

- Git repository:
  - https://github.com/OmidG9/Nakhsha.git
- Main branch:
  - https://github.com/OmidG9/Nakhsha/tree/main
- README:
  - https://github.com/OmidG9/Nakhsha/blob/main/README.md
- Raw README:
  - https://raw.githubusercontent.com/OmidG9/Nakhsha/main/README.md

### Primary specification document

The user explicitly designated the following Word document as the **primary source of truth** for the Super Admin project:

- File:
  - `SuperAdminNakhshaFundumentals (2).docx`
- Local path in the working environment when this prompt was prepared:
  - `/mnt/data/SuperAdminNakhshaFundumentals (2).docx`

The document is 19 pages and defines:
1. Functional requirements.
2. Non-functional requirements.
3. Design constraints.
4. Software quality attributes.
5. Phase 1 — backend/database.
6. Phase 2 — frontend core.
7. Phase 3 — dashboard pages.
8. Phase 4 — QA/integration.
9. Technology stack.
10. Comparative strengths/weaknesses and improvement opportunities.

### Generated project reports

These were generated during the previous engineering review and may be used as secondary context:

- Comprehensive audit:
  - `/mnt/data/Nakhsha_SuperAdmin_Comprehensive_Audit_Report.pdf`
- Success + Bug Fix Roadmap:
  - `/mnt/data/Nakhsha_SuperAdmin_Success_and_BugFix_Roadmap.pdf`

Do not treat these reports as a higher authority than the Word specification or the actual repository.

---

# 1. Project Goal

Build an exclusive, secure, production-ready **Super Admin dashboard** for Nakhsha.

The implementation must:
- Preserve the existing Nakhsha architecture.
- Avoid unnecessary rewrites.
- Never weaken existing authentication/security.
- Be fully protected on the backend.
- Be guarded on the frontend.
- Use a singleton Super Admin model.
- Keep the existing `creatorType` feature completely independent from role/permission logic.
- Be RTL and Persian-first.
- Be responsive.
- Be testable end-to-end.
- Be ready for deployment only after all required checks pass.

---

# 2. Non-Negotiable Security Rules

These rules override convenience.

## 2.1 Singleton Super Admin

There must be exactly one `super_admin` account.

- No admin endpoint may create a `super_admin`.
- No admin endpoint may promote a user to `super_admin`.
- The only legal assignment path is the automatic OTP login flow using `SUPER_ADMIN_PHONE`.
- The system must not silently replace an existing Super Admin.
- The database must enforce uniqueness, not only application code.
- Protect normal save operations with validation/pre-save logic.
- Protect race conditions with a MongoDB partial unique index.

Recommended database invariant:

```js
{
  unique: true,
  partialFilterExpression: {
    role: "super_admin"
  }
}
```

## 2.2 Self-protection

A Super Admin can never:
- change their own role;
- change their own permissions;
- block/unblock their own account;
- delete their own account.

Check `req.user.id` against the target id on the server.

The UI must also disable/hide those controls for the current-user row.

## 2.3 Never delete Super Admin

Deletion of any account with:

```text
role === "super_admin"
```

must be rejected server-side, regardless of UI state.

## 2.4 Admin API authorization

Every `/api/admin/*` endpoint must be protected by:

```text
requireAuth
→ requireRole("super_admin")
```

The ordinary `admin` role must never be sufficient.

## 2.5 Current account state must come from DB

`requireRole` must query the current User document directly from MongoDB on every protected request.

Do not trust the JWT role or blocked state alone.

A currently blocked user must be rejected even if their JWT is still valid.

Required Persian message:

```text
حساب کاربری شما مسدود شده است
```

## 2.6 Role-change token invalidation

Immediately after a user role changes:
- revoke all active refresh tokens for the target user;
- preserve the existing refresh-token architecture;
- use the existing revoke semantics if available;
- do not leave stale privileged sessions alive.

## 2.7 Allowlist updates

Every mutable admin endpoint must use an explicit allowlist.

Never allow:
- `phone` / `mobile`;
- `_id`;
- authentication fields;
- `creatorType`;
- unrelated profile internals;
- arbitrary Mongo operators.

`creatorType` belongs to a separate feature and must be preserved exactly as it exists in the current codebase.

## 2.8 Regex safety

Any user-provided search text used in MongoDB regex must be escaped/sanitized first.

Do not pass raw user input into `$regex`.

## 2.9 Validation

Validate every:
- request body;
- query string;
- security-sensitive payload;
- audit payload

with Zod before controller logic.

Invalid requests should return HTTP 400 with:

```json
{
  "success": false,
  "message": "..."
}
```

## 2.10 Unified error response

All backend errors must use:

```json
{
  "success": false,
  "message": "..."
}
```

Technical information must be server-side only.

Never return:
- stack traces;
- database error internals;
- filesystem paths;
- secrets;
- internal query details.

---

# 3. Backend Technology Contract

Current intended stack:

- Node.js 20+
- Express 5
- CommonJS
- MongoDB 7+ specification target
- Mongoose
- Zod
- JWT
- Refresh Tokens
- OTP

Important repository reality:

- The specification document describes strict TypeScript in one section.
- The actual Nakhsha backend is JavaScript/CommonJS.
- **Do not migrate the whole backend to TypeScript unless a later task explicitly requests it.**
- Preserve the actual architecture already used by Nakhsha.

---

# 4. User Model Requirements

Update the existing User model.

Final role enum:

```text
user
tour_leader
admin
super_admin
```

Add:

```text
isBlocked: Boolean, default false
moderatorNote: String, optional
permissions: String[] 
```

Allowed permissions:

```text
DELETE_USERS
APPROVE_CONTENT
VIEW_AUDIT_LOGS
```

Permission semantics:

- `admin` → may have granular permissions.
- `super_admin` → all capabilities are implicitly granted; permissions array should remain empty.
- `user` → permissions must remain empty.
- `tour_leader` → permissions must remain empty.

Do not redefine or reinterpret `creatorType`.

The model must reject attempts to store a second `super_admin`.

---

# 5. Listing Model Requirements

Current supported status must become:

```text
draft
pending
published
rejected
archived
```

Preserve the existing Listing architecture and discriminator behavior.

Do not invent a second Listing system.

Before changing field names or ownership relationships, inspect the real model.

---

# 6. AuditLog Requirements

There must be a single coherent AuditLog implementation.

Target Super Admin contract:

```text
actorId   -> User reference, required
action    -> controlled enum, required
targetId  -> ObjectId, optional
details   -> Object or String, required
ip        -> String
timestamps: true
```

Expected actions include:

```text
USER_ROLE_CHANGE
USER_PERMISSIONS_CHANGE
USER_BLOCK
USER_DELETE
LISTING_STATUS_CHANGE
LISTING_EDIT
```

Validate audit payload with Zod before insert.

Do not create a second conflicting `AuditLog` model if the repository already has one. Adapt the existing model safely or migrate it deliberately.

---

# 7. OTP Super Admin Assignment

Locate the real OTP verification endpoint.

The logic must execute:
- after the user is found or created;
- after a fresh user document is available;
- before access/refresh tokens are issued.

Read:

```js
process.env.SUPER_ADMIN_PHONE
```

The current Nakhsha model uses `phone`; the prompt may use `mobile` as generic wording.

Normalize both values using the repository's existing phone-normalization function where applicable.

If:

```text
SUPER_ADMIN_PHONE is configured
AND current user's normalized phone matches
AND current role is not super_admin
```

then:
1. Set role to `super_admin`.
2. Save.
3. Let Singleton enforcement reject a conflicting second Super Admin.
4. If successful, write `USER_ROLE_CHANGE` AuditLog.
5. Actor is the user/system itself.
6. Details must explicitly say the role was auto-assigned through `SUPER_ADMIN_PHONE`.

If another Super Admin already exists:
- do not crash login;
- log a server-side warning;
- restore/use the user's previous role;
- issue normal tokens for the previous role;
- never leak the conflict to the client.

This operation must be idempotent.

No Super Admin seed script.

Remove any legacy manual Super Admin seed/creation script only if it actually exists in the repository after inspection.

---

# 8. Admin Statistics Service

Create/maintain:

```text
backend/services/adminStats.js
```

Functions:

```text
getOverviewStats()
getGrowthTrend(days = 30)
getContentDistribution()
getTopCities(limit = 10)
getRecentActivity(limit = 20)
```

Requirements:
- all functions async;
- Mongoose Aggregation;
- `$match` as early as practical to leverage indexes;
- no full collection fetch followed by large in-memory processing;
- hard limits;
- predictable response shapes.

Expected overview:

```text
total users
active/published content
pending content
blocked users
```

Growth:
- daily grouping by date;
- users and content;
- default last 30 days.

Content distribution:
- by content type;
- by status if API contract requires it.

Recent activity:
- latest AuditLog records;
- actor name;
- newest first.

---

# 9. Admin Controller

Create/maintain:

```text
backend/controllers/AdminController.js
```

Methods:

```text
getStats
getUsers
updateUserRole
updateUserPermissions
toggleUserBlock
deleteUser
getListings
updateListingStatus
updateListingContent
getAuditLogs
```

Every method:
- async;
- wrapped in try/catch;
- unified Persian errors;
- Zod validation;
- correct HTTP status;
- no secret leakage.

## User operations

### getUsers
Support:
- name search;
- phone/mobile search;
- id search;
- regex escaping;
- pagination;
- hard cap 100.

### updateUserRole
Allowed target roles:

```text
user
tour_leader
admin
```

Never allow:

```text
super_admin
```

Explicit rejection:

```text
ساخت یا ارتقای سوپر ادمین از این طریق مجاز نیست
```

Reject self role change with 403.

If new role != `admin`, reset permissions to `[]`.

After success:
- invalidate target tokens;
- write AuditLog.

### updateUserPermissions
Only for users currently having role `admin`.

Allowed permissions only:

```text
DELETE_USERS
APPROVE_CONTENT
VIEW_AUDIT_LOGS
```

Write `USER_PERMISSIONS_CHANGE`.

### toggleUserBlock
Reject self.

Reject blocking/unblocking Super Admin.

Write `USER_BLOCK`.

If blocking, invalidate active tokens if that is part of current security architecture.

### deleteUser
Reject:
- current user;
- Super Admin.

On success:
- delete;
- revoke active sessions where applicable;
- write `USER_DELETE`.

---

# 10. Listing Controller

Support:

```text
getListings
updateListingStatus
updateListingContent
```

Filtering:
- type;
- status.

Pagination:
- hard cap 100.

Status changes:
- draft;
- pending;
- published;
- rejected;
- archived.

Content edit allowlist:

```text
title
description
```

Nothing else.

Record edit history and increment revision using the existing model architecture when present.

When the relevant craft/artisan listing is approved/published:
- update the linked user's identity-verification field;
- do not confuse `creatorType` with role;
- do not redefine the meaning of `creatorType`.

If the real repository has a separate Craft model instead of a Craft Listing discriminator:
- handle that with a dedicated Crafts endpoint/service;
- do not force Crafts through the generic Listing model.

---

# 11. Admin Routes

Create/maintain:

```text
backend/routes/admin.js
```

All routes must be protected globally by:

```text
requireAuth
requireRole("super_admin")
```

Routes:

```text
GET    /api/admin/stats
GET    /api/admin/users
PATCH  /api/admin/users/:id/role
PATCH  /api/admin/users/:id/permissions
PATCH  /api/admin/users/:id/block
DELETE /api/admin/users/:id
GET    /api/admin/listings
PATCH  /api/admin/listings/:id/status
PATCH  /api/admin/listings/:id
GET    /api/admin/audit-logs
GET    /api/admin/settings
```

Mount in server:

```js
app.use("/api/admin", adminRoutes);
```

`/:id` should be treated as the canonical target identifier.

Do not require callers to duplicate the id in the body unless there is a justified backward-compatibility reason.

---

# 12. Error Handler

The error middleware must be the final Express error middleware.

It must:
- map validation/database/unexpected errors;
- choose sensible HTTP codes;
- log technical details server-side;
- return only:

```json
{
  "success": false,
  "message": "..."
}
```

Never expose stack traces.

---

# 13. Environment / Settings

Expose only status, never values.

Example safe response:

```json
{
  "key": "SUPER_ADMIN_PHONE",
  "isConfigured": true
}
```

Never return:
- phone value;
- JWT secret;
- Mongo URI;
- OTP secret;
- refresh secret.

Settings should include at least:

```text
SUPER_ADMIN_PHONE
JWT_SECRET
MONGODB_URI
REFRESH_TOKEN_SECRET
OTP_SECRET
ALLOWED_ORIGINS
SENTRY_DSN
```

Only the configured/unconfigured state is allowed to reach the frontend.

Database health:
- report `up`/`down`;
- never expose credentials or connection strings.

---

# 14. Frontend Technology Contract

Current intended stack:

- React 19
- Vite 7
- React Router v7
- TypeScript 5.3+
- strict mode
- no `any`
- TailwindCSS v4
- lucide-react
- Recharts where compatible

Every frontend command below must pass before release:

```text
npx tsc --noEmit
npm run lint
npm run build
```

All domain models:
- use `interface`.

Use `type` for:
- unions;
- utility types;
- discriminated unions.

IDs:
```text
string
```

Timestamps:
```text
string
```

---

# 15. API Types

`frontend/src/types/api.ts`

Required domain models:

```text
AdminUser
StatsOverview
GrowthPoint
ContentDistributionItem
AdminAuditLog
PaginatedResponse<T>
```

Recommended role union:

```ts
"user" | "tour_leader" | "admin" | "super_admin"
```

Permissions:

```ts
"DELETE_USERS" | "APPROVE_CONTENT" | "VIEW_AUDIT_LOGS"
```

Listing statuses:

```ts
"draft" | "pending" | "published" | "rejected" | "archived"
```

`creatorType` must remain loosely typed and optional in admin-facing types if needed.

If raw backend responses use `_id`, normalize `_id` → `id` inside the API/service layer.

---

# 16. Frontend Admin Service

`frontend/src/services/admin.ts`

Functions:

```text
getStats
getUsers
updateUserRole
updateUserPermissions
toggleUserBlock
deleteUser
getListings
updateListingStatus
updateListingContent
getAuditLogs
getAdminSettings
```

Precise input/output types only.

No `any`.

Use the existing `apiClient`.

Important:
- do not leak Axios implementation into pages;
- services are the network boundary.

For block/unblock, the service must accept the desired boolean state:

```text
toggleUserBlock(id, isBlocked)
```

because both actions must work.

---

# 17. Shared UI Kit

Create/maintain:

```text
components/ui/
```

Components:

```text
StatusBadge
StatCard
DataTable
Pagination
ConfirmDialog
Switch
LineChart
PieChart
```

Requirements:
- generic types where appropriate;
- no `any`;
- RTL;
- Nakhsha red palette;
- accessible controls;
- Skeleton loading;
- Empty states.

`DataTable<T>` should expose strongly typed columns and row renderers.

---

# 18. Persian UI Rules

All UI is RTL.

Use logical Tailwind utilities:
- `ps-*`
- `pe-*`
- `ms-*`
- `me-*`
- `start-*`
- `end-*`
- `text-start`
- `text-end`

Do not rely on left/right-specific layout classes for admin layout.

Use Vazirmatn.

All visible numbers:

```js
value.toLocaleString("fa-IR")
```

All absolute dates:
- Jalali/Solar Hijri;
- e.g. `fa-IR-u-ca-persian` or a reliable Jalali library.

Relative timestamps:
- Persian locale;
- e.g. “۱۰ دقیقه پیش”.

---

# 19. Admin Layout

`AdminLayout.tsx`

Must include:
- right-aligned RTL sidebar;
- Dashboard;
- Users;
- Listings;
- Crafts;
- Audit Logs;
- Settings;
- responsive mobile hamburger;
- header;
- current user name;
- logout;
- nested `<Outlet />`.

Use CSS variables for:
- primary red;
- darker red;
- soft red;
- surface;
- background;
- border;
- text;
- muted.

---

# 20. SuperAdminGuard

Create:

```text
SuperAdminGuard.tsx
```

Use current auth context/hook.

If:

```text
role !== "super_admin"
```

redirect using:

```tsx
<Navigate to="/" replace />
```

Do not show a permission error screen.

Wait for auth hydration before redirecting so valid sessions are not prematurely redirected.

---

# 21. Nested Admin Routes

Configure:

```text
/admin
/admin/users
/admin/listings
/admin/crafts
/admin/audit-logs
/admin/settings
```

All rendered under:

```text
SuperAdminGuard
→ AdminLayout
→ Outlet
```

---

# 22. Avatar Dropdown

Locate the real existing user avatar dropdown.

Show:

```text
ورود به داشبورد سوپر ادمین
```

only when:

```text
currentUser.role === "super_admin"
```

Never show it for:
- user;
- tour_leader;
- admin.

UI hiding is not security; backend protection remains mandatory.

---

# 23. AdminDashboard

Required:
- four StatCards:
  - total users;
  - active content;
  - pending content;
  - blocked users.
- 30-day LineChart;
- content-type PieChart;
- top cities;
- recent admin activity;
- actor name;
- Persian relative timestamp.

Loading:
- Skeleton only.

Failure:
- unified Persian message.

Empty:
- explicit Empty State.

No plain spinner.

---

# 24. AdminUsers

Required columns:
- name;
- mobile;
- role;
- active/blocked;
- actions.

Search:
- name;
- mobile;
- id;
- debounce >= 300ms.

Role select:
- `user`;
- `tour_leader`;
- `admin`;
- **never show `super_admin` as a selectable option**.

Current-user row:
- role;
- permissions;
- block;
- delete
must be disabled or inaccessible.

Super Admin row:
- role;
- permissions;
- block;
- delete
must be disabled or inaccessible.

Permissions button:
- only when role is `admin`.

Permissions modal:
- one Switch per permission;
- `اجازه حذف کاربران`;
- `اجازه تایید محتوا`;
- `مشاهده لاگ‌ها`.

Save through:
```text
updateUserPermissions(id, permissions)
```

Show Persian success/error toast.

Block/unblock:
- ConfirmDialog.

Delete:
- ConfirmDialog.

Pagination:
- hard cap 100.

---

# 25. AdminListings + AdminCrafts

Required:
- DataTable;
- type filter;
- status filter;
- status options:
  - draft;
  - pending;
  - published;
  - rejected;
  - archived.
- approve/reject/archive or status select;
- ConfirmDialog for irreversible operations;
- inline edit title/description;
- edit history after save;
- refresh from backend after mutation.

For Crafts:
- if the real repository uses a separate Craft model, integrate that actual model;
- do not fake Craft records as generic Listings;
- when publication causes backend identity-verification changes, refresh row state from backend;
- never reinterpret `creatorType`.

---

# 26. AdminAuditLogs

Required:
- DataTable;
- filter by actor;
- filter by action;
- show actor name;
- show action;
- show target;
- show details;
- show IP;
- show Jalali date/time;
- pagination <= 100.

Empty State and Skeleton required.

---

# 27. AdminSettings

Required:
- environment variable names;
- configured/unconfigured status only;
- explicit SUPER_ADMIN_PHONE status;
- database health;
- last health-check time.

Never expose environment values.

---

# 28. Loading / Empty / Error Rules

Across all Admin pages:

## Loading

Must use Skeleton.

Never use a plain spinner.

## Empty

Show a friendly Persian Empty State.

## Error

Show a unified Persian message.

Do not expose raw technical errors.

---

# 29. Known Issues Found During Previous Engineering Pass

These are not assumptions; they were identified from the previous code/repository analysis.

## 29.1 User phone field naming

The real User model uses `phone`, while some prompts use `mobile`.

Resolution:
- backend internal field remains `phone`;
- frontend admin-facing domain may call it `mobile` if that is the established UI contract;
- service maps `phone` → `mobile`;
- do not rename the existing DB field casually.

## 29.2 Existing AuditLog architecture mismatch

The repository already has an AuditLog model with an older/richer shape.

Risk:
- creating a second model with the same Mongoose model name can cause conflicts;
- controller payload may not match the old schema.

Resolution:
- use one AuditLog model;
- migrate/adapt deliberately;
- ensure controller and model contract match;
- validate audit payload with Zod.

## 29.3 Controller route/body id mismatch

Earlier generated controller code expected `targetId` in bodies while routes were specified as:

```text
/users/:id
/listings/:id
```

Resolution:
- route parameter must be canonical;
- use `req.params.id`;
- validate `req.params.id`;
- body should contain only editable/mutation-specific fields.

## 29.4 Craft model mismatch

The real project has a separate Craft model/collection architecture.

Risk:
- generic Listing page may not correctly manage real Crafts.

Resolution:
- inspect actual Craft model, routes and ownership relations;
- build dedicated Craft API/page if necessary.

## 29.5 Role filter pagination

Client-only role filtering is incorrect for large datasets.

Resolution:
- add server-side `role` filter to `getUsers`;
- filter before pagination;
- keep hard page size <= 100.

## 29.6 Edit history rendering

History data can contain nested before/after values.

Risk:
```js
String(object)
```
may render `[object Object]`.

Resolution:
- explicitly render nested changes;
- display before/after clearly.

## 29.7 Toggle block API

`toggleUserBlock(id)` is insufficient if the server requires `isBlocked`.

Resolution:
```text
toggleUserBlock(id, isBlocked)
```

## 29.8 Recharts compatibility

Use Recharts only if the actually installed version is compatible with React 19.

If build/type conflicts occur:
- do not force dependency hacks;
- use an internal SVG chart fallback.

## 29.9 Existing npm/node reality

At the time of this prompt:
- local Node: `v24.19.0`;
- local npm: `11.17.0`;
- Git: `2.55.0.windows.5`.

The repository's backend installation completed successfully:
- `npm install` added 553 packages;
- `npm ls --depth=0` showed dependencies installed;
- package-lock changes caused by npm install were restored;
- Git working tree became clean again.

Warnings observed during npm install included deprecated packages and npm pending install-script approvals. Do not approve scripts automatically. Investigate only if tests prove a package needs it.

---

# 30. Current Local Test State / Checkpoint

The user is working on:

```text
C:\Projects\Nakhsha
```

Current branch:

```text
super-admin-testing
```

Confirmed:
- Git installed.
- Node installed.
- npm installed.
- branch exists.
- working tree clean after dependency cleanup.
- backend dependencies installed and listed successfully.

Not yet confirmed at the checkpoint:
- `.env` created;
- MongoDB connection;
- `SUPER_ADMIN_PHONE` environment variable;
- backend runtime;
- frontend runtime;
- TypeScript;
- lint;
- build;
- Jest;
- API integration tests.

Last intended environment check:

```powershell
git status --short

node -e "require('dotenv').config({path:'../.env'}); console.log({NODE_ENV:process.env.NODE_ENV, MONGODB_URI_SET:Boolean(process.env.MONGODB_URI), JWT_SECRET_SET:Boolean(process.env.JWT_SECRET), SUPER_ADMIN_PHONE_SET:Boolean(process.env.SUPER_ADMIN_PHONE), PORT:process.env.PORT})"
```

Do not print secrets.

---

# 31. Required Test Strategy

The implementation should be tested in layers.

## Layer A — Syntax / model loading

Example:

```bash
node -e "require('./models/User.js'); require('./models/Listing.js'); require('./models/AuditLog.js'); console.log('OK')"
```

## Layer B — Statistics

Example:

```bash
node -e "const s = require('./services/adminStats.js'); s.getOverviewStats().then(console.log).catch(e=>{console.error(e); process.exit(1)})"
```

## Layer C — Lint / syntax

Backend:
```bash
npm run lint
node -c controllers/AdminController.js
```

Frontend:
```bash
npx tsc --noEmit
npm run build
```

## Layer D — Runtime protection

Start backend and verify an unauthenticated admin request returns 401.

Example:

```bash
node -e "require('./server.js')" &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/admin/stats
kill %1
```

Expected:
```text
401
```

## Layer E — Super Admin singleton

After testing automatic assignment:

```bash
node -e "require('./models/User.js').countDocuments({role:'super_admin'}).then(n=>{console.log('super_admin count =', n); process.exit(n>1?1:0)})"
```

Expected:
```text
super_admin count = 1
```

## Layer F — Full CI-style checks

Backend:

```bash
npm run lint
npm test
```

Frontend:

```bash
npx tsc --noEmit
npm run build
```

Never run a combined command across folders unless the root scripts explicitly support it.

---

# 32. Mandatory Security Test Matrix

Before release, test at minimum:

### User roles
- normal user → denied admin API;
- tour leader → denied admin API;
- admin → denied admin API;
- super_admin → allowed admin API.

### Block state
- super_admin blocked in DB → admin API rejected immediately;
- ordinary user blocked → cannot access protected endpoints;
- valid stale JWT must not bypass DB block check.

### Self protection
- own role → 403;
- own permissions → denied or disabled;
- own block → 403;
- own delete → 403.

### Super Admin
- UI cannot assign super_admin;
- API cannot assign super_admin;
- existing super_admin cannot be deleted;
- duplicate Super Admin cannot be created;
- automatic phone assignment is idempotent.

### Input validation
- malformed ObjectId;
- invalid role;
- invalid permission;
- unknown fields;
- too-large pagination;
- regex special characters;
- invalid status.

### Audit
Every sensitive operation produces the expected AuditLog:
- role;
- permissions;
- block;
- delete;
- listing status;
- listing edit.

### Token invalidation
After role change:
- active refresh token must no longer produce a valid privileged session.

---

# 33. Manual Browser Test Matrix

Use Chrome.

Test at widths:
- 375px;
- 768px;
- 1280px+.

Verify:
- RTL;
- sidebar;
- mobile hamburger;
- no horizontal layout break;
- charts;
- tables;
- modal;
- keyboard navigation;
- focus visibility;
- ConfirmDialog;
- Skeleton;
- Empty State.

---

# 34. Required Applications / Tools for Local Work

Recommended:

### Mandatory
- VS Code
- Git for Windows
- Node.js 20+ / currently Node 24.19.0
- MongoDB Atlas account OR a supported local MongoDB installation
- MongoDB Compass
- Postman
- Chrome

### Optional
- GitHub Desktop
- Docker Desktop

Primary project URLs:

- GitHub:
  https://github.com/OmidG9/Nakhsha
- README:
  https://github.com/OmidG9/Nakhsha/blob/main/README.md
- Node:
  https://nodejs.org/
- Git:
  https://git-scm.com/download/win
- VS Code:
  https://code.visualstudio.com/
- MongoDB Atlas:
  https://www.mongodb.com/atlas
- MongoDB Compass:
  https://www.mongodb.com/try/download/compass
- Postman:
  https://www.postman.com/downloads/

---

# 35. Environment Security Rules

Never commit:
```text
.env
API keys
JWT secrets
MongoDB passwords
OTP credentials
Sentry secrets
private keys
```

Verify:

```bash
git status --short
```

before every commit.

Never paste secret values into chat.

---

# 36. Git Workflow

Use an isolated branch:

```text
super-admin-testing
```

Do not push to `main` until:
1. code is integrated;
2. tests pass;
3. manual security matrix passes;
4. browser tests pass;
5. deployment smoke test passes.

Preferred workflow:

```bash
git status
git diff
git add ...
git commit -m "feat: add Nakhsha super admin dashboard"
```

Then push the testing branch first:

```bash
git push -u origin super-admin-testing
```

Only merge to `main` after review.

---

# 37. OpenCode Operating Instructions

OpenCode must follow this sequence:

## Step 1
Inspect the entire repository before editing.

At minimum inspect:
```text
backend/
frontend/
scripts/
docs/
Document/
package.json
backend/package.json
frontend/package.json
.env.example
README.md
README_COMPREHENSIVE.md
SETUP_LOCAL_DEVELOPMENT.md
DEPLOYMENT_VPS_NODOCKER.md
MIGRATION_SUMMARY.md
```

## Step 2
Inspect actual implementations of:
```text
User
Listing
Craft
AuditLog
RefreshToken
auth middleware
OTP login
server.js
apiClient
AuthContext
App.tsx
avatar dropdown
Tailwind setup
frontend types
```

## Step 3
Compare real code against this prompt and the Word specification.

Create a discrepancy list before editing.

## Step 4
Implement in phases.

## Step 5
After each phase:
- run relevant tests;
- fix failures;
- do not proceed while a phase has unresolved blocking errors.

## Step 6
At each completion point report:
- changed files;
- reason for each change;
- test commands;
- real outputs;
- known limitations.

## Step 7
Never invent successful output.

If a test could not be run:
```text
UNVERIFIED
```

not:
```text
PASS
```

---

# 38. Recommended Implementation Order

## Phase 1 — Backend core
1. User model.
2. Listing status.
3. Single AuditLog contract.
4. Singleton unique index.
5. adminStats.
6. AdminController.
7. requireRole DB check.
8. admin routes.
9. centralized error handler.
10. OTP auto assignment.
11. settings/health endpoint.

## Phase 2 — Frontend core
1. API types.
2. admin service.
3. StatusBadge.
4. StatCard.
5. DataTable.
6. Pagination.
7. ConfirmDialog.
8. Switch.
9. charts.
10. AdminLayout.
11. SuperAdminGuard.

## Phase 3 — Pages
1. Dashboard.
2. Users.
3. PermissionsModal.
4. Listings.
5. Crafts.
6. Audit Logs.
7. Settings.

## Phase 4 — QA
1. typecheck.
2. lint.
3. build.
4. backend tests.
5. API smoke tests.
6. auth/security matrix.
7. browser responsive tests.
8. deployment smoke test.
9. final diff audit.
10. only then push/merge.

---

# 39. Definition of Done

The dashboard is NOT considered complete until all are true:

- exactly one Super Admin;
- no API path can create/promote another;
- self-lock/delete/role-change blocked server and UI;
- every admin API guarded;
- blocked state checked from DB;
- stale JWT cannot bypass block;
- role changes revoke active sessions;
- sensitive actions audited;
- audit payload Zod-validated;
- regex search sanitized;
- all bodies/queries validated;
- list pages max 100;
- no secret values exposed;
- frontend has no `any`;
- `tsc --noEmit` passes;
- lint passes;
- build passes;
- backend tests pass;
- runtime 401 test passes;
- Super Admin count test passes;
- browser/mobile UI passes;
- Crafts use the real project model/relationship;
- role filter is server-side before pagination;
- edit history renders before/after correctly;
- final Git diff is reviewed;
- no unintended files/secrets are committed.

---

# 40. Final Instruction to OpenCode

**Act as a senior/staff-level full-stack engineer and security reviewer, not a code generator.**

Before making any change:
1. inspect the real file;
2. understand dependencies;
3. preserve existing behavior;
4. identify conflicts;
5. make the smallest safe change;
6. test it;
7. fix failures;
8. retest;
9. report exact results.

Never:
- invent repository structure;
- invent fields;
- create duplicate models;
- migrate technologies unnecessarily;
- silently change unrelated features;
- alter `creatorType` semantics;
- expose secrets;
- claim tests passed without evidence;
- bypass the user's staged validation process.

When the repository and the specification conflict, prefer:
1. explicit security requirements;
2. explicit Word specification;
3. actual repository constraints;
4. the least invasive compatibility-preserving implementation.

At the end of each phase, stop and report the exact phase status.

---

# Appendix A — Project Files / Documents Referenced in This Work

Primary user-provided specification:
- `SuperAdminNakhshaFundumentals (2).docx`

Repository documentation observed/mentioned:
- `README.md`
- `README_COMPREHENSIVE.md`
- `SETUP_LOCAL_DEVELOPMENT.md`
- `DEPLOYMENT_VPS_NODOCKER.md`
- `MIGRATION_SUMMARY.md`
- `.env.example`

Relevant implementation areas:
- `backend/models/User.js`
- `backend/models/Listing.js`
- `backend/models/AuditLog.js`
- `backend/models/RefreshToken.js`
- `backend/middleware/auth.js`
- `backend/middleware/errorHandler.js`
- `backend/routes/auth.js`
- `backend/routes/admin.js`
- `backend/services/adminStats.js`
- `backend/controllers/AdminController.js`
- `backend/server.js`
- `frontend/src/types/api.ts`
- `frontend/src/services/admin.ts`
- `frontend/src/components/AdminLayout.tsx`
- `frontend/src/components/SuperAdminGuard.tsx`
- `frontend/src/components/UserAvatarDropdown.tsx`
- `frontend/src/components/ui/StatusBadge.tsx`
- `frontend/src/components/ui/StatCard.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/Pagination.tsx`
- `frontend/src/components/ui/ConfirmDialog.tsx`
- `frontend/src/components/ui/Switch.tsx`
- `frontend/src/components/ui/LineChart.tsx`
- `frontend/src/components/ui/PieChart.tsx`
- `frontend/src/components/admin/PermissionsModal.tsx`
- `frontend/src/components/admin/AdminListingManager.tsx`
- `frontend/src/pages/admin/AdminDashboard.tsx`
- `frontend/src/pages/admin/AdminUsers.tsx`
- `frontend/src/pages/admin/AdminListings.tsx`
- `frontend/src/pages/admin/AdminCrafts.tsx`
- `frontend/src/pages/admin/AdminAuditLogs.tsx`
- `frontend/src/pages/admin/AdminSettings.tsx`

---

# Appendix B — Current Last Confirmed Local Checkpoint

```text
Repository:
C:\Projects\Nakhsha

Branch:
super-admin-testing

Git:
2.55.0.windows.5

Node:
v24.19.0

npm:
11.17.0

Working tree:
clean

Backend dependency installation:
successful

MongoDB:
not yet confirmed locally

.env:
not yet confirmed

Full TypeScript/lint/build/backend-test:
not yet proven from local output
```

The next local step after reading this master prompt is to finish the environment/DB setup and then test the implementation phase-by-phase.
