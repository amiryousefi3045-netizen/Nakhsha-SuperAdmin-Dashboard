# NAKHSHA — Stage 33: Returns, RMA & Refunds (P1-04)

**Branch:** `feature/seller-dashboard`
**Stage:** 33
**Gap closed:** P1-04 — "returned/refund amount, RMA workflow, buyer request, FulfillmentSeller returned transition"
**Source of truth:** `Document/Nakhsha_Seller_Dashboard_Progress_Report.html:319`

---

## 1. The gap

The order state machine already knew `delivered → returned` and already put the
units back on hand. What it could not answer — and what every buyer dispute
actually turns on — was:

- **why** the goods are coming back,
- **who asked** (buyer claim vs. seller walk-in),
- **what the seller decided** (approve / reject / receive),
- **how much money went back**, and whether it was the full amount or a
  deduction.

On top of that, a buyer had no way to open a return at all, and a seller had no
queue to work through. `FulfillmentSeller` had no action for a delivered order.

Closing this with a single "mark as returned" button would have been the wrong
fix: it would move stock and status with no reason, no amount and no audit row.
Money movement needs its own lifecycle, so the RMA is a **first-class document**
with its own state machine, and the order only becomes `returned` as a
*side effect of an issued refund*.

---

## 2. Domain model

`backend/models/ReturnRequest.js` — the RMA. `order.status` stays a statement
about the **goods**; the RMA is the statement about the **dispute**.

| Field | Purpose |
|---|---|
| `sellerId` | Authoritative; never accepted from the client. Derived from the order, so a request can never be filed against another store's order. |
| `buyerUserId` | `null` for a seller-filed (walk-in) request — there is no claiming buyer. |
| `rmaNumber` | Per-seller human-readable number, minted race-safely via `AtomicCounter.nextSequence("rma:<sellerId>")`. Unique per seller. |
| `openKey` | `String(orderId)` while the request is open. **Unique sparse index** ⇒ at most one open request per order, any number of closed ones. |
| `reason` | Buyer's stated complaint. Required. |
| `resolutionNote` | The seller's answer. |
| `items[]` | Snapshot of the order lines, so the queue renders without a per-row join. |
| `refundAmount` / `refundedAt` | Integer Rial, may be **less** than the order total. |
| `timeline[]` | Every state the request passed through, with actor and note. |

### State machine

```
requested ──► approved ──► received ──► refunded
    │            │                        (terminal)
    ├──► rejected (terminal) ◄──┘
    ├──► cancelled (terminal)
    └──► cancelled ◄── approved
```

`OPEN_RETURN_STATUSES = [requested, approved, received]`. Only a terminal state
releases `openKey`; while a claim is `approved` or `received` the order still
carries one open dispute and a second claim is refused with `409`.

Refund is deliberately **not** reachable from the status endpoint — it is the
only transition that moves money, so it has its own validated entry point.

`backend/models/Order.js` gained `payment.refundedAmount` and
`payment.refundedAt`, so the finance ledger can never claim a full refund when a
partial one happened.

---

## 3. Return window

`RETURN_WINDOW_DAYS = 7`, measured from the order's recorded `delivered` timeline
entry (not wall-clock "createdAt").

- Eligibility is computed **server-side only** and shipped to the client with
  the order receipt (`returnEligible` / `returnDeadline`). A stale browser clock
  can never offer a return the store would have to refuse.
- Boundaries are pinned by tests: day 6 accepted, day 8 refused.
- Seller-filed returns obey the same window — a walk-in return 30 days after
  delivery is refused, because the window is a property of the *delivery*, not
  of who files.

---

## 4. API

### Seller (`/api/seller/returns`)

| Method | Path | Guard |
|---|---|---|
| GET | `/returns` | seller |
| GET | `/returns/:id` | seller (scoped by `sellerId`) |
| POST | `/returns` | manager/owner — walk-in, filed directly as `approved` |
| PATCH | `/returns/:id/status` | manager/owner |
| POST | `/returns/:id/refund` | **owner only** (`requireOwnerOnly`) |

### Buyer (`/api/storefront`)

| Method | Path | Guard |
|---|---|---|
| GET | `/orders/:orderId` | own order; now also returns `returns`, `returnEligible`, `returnDeadline` |
| POST | `/orders/:orderId/returns` | own order + window + one-open-request |
| GET | `/returns` | own claims only |

`GET /storefront/returns` is declared **after** `/orders/:orderId` and the order
router is mounted before the catalog router, so the one-segment path is not
swallowed by the catalog's `/:slug`.

### Isolation

Every query is scoped by the authenticated subject. A request belonging to
another store returns `404 RETURN_NOT_FOUND`; another buyer's order returns
`404 ORDER_NOT_FOUND`. Neither reveals that the resource exists.

---

## 5. Audit

Money and disputes are auditable end to end:

| Action | Risk | When |
|---|---|---|
| `RETURN_REQUESTED` | MEDIUM | buyer opens a claim |
| `RETURN_FILED` | MEDIUM | seller files on the buyer's behalf |
| `RETURN_STATUS_CHANGED` | MEDIUM | seller adjudicates |
| `REFUND_ISSUED` | **HIGH** | money issued (carries the amount) |

Seller actions publish a store-scoped `order` event with the order's **real**
status, so a live dashboard refetches without ever labelling a merely-filed
claim as a return.

---

## 6. Frontend

- `frontend/src/types/returns.ts` — the RMA contract in one neutral module.
  Both the buyer and seller describe the same return, so the state machine lives
  once; duplicating it is how the two sides start disagreeing about whether a
  claim is still open.
- `frontend/src/pages/seller/ReturnsSeller.tsx` — the RMA queue: status KPIs,
  status filter chips, pagination, approve / reject (note required) / receive /
  cancel, a walk-in filing form, and the refund dialog.
  - The refund amount is bounded by the **order total from the server**, not by
    the sum of the item lines — those disagree as soon as a discount applies,
    and an over-refund is the one mistake here that cannot be walked back.
  - The refund button is hidden for non-owners, mirroring `requireOwnerOnly`,
    rather than left to fail with a 403 after the seller typed an amount.
- `frontend/src/pages/storefront/BuyerOrderPage.tsx` — the buyer files a return
  from their own receipt, with the deadline shown and the current claim's
  timeline. Eligibility comes from the server.
- `frontend/src/pages/seller/FulfillmentSeller.tsx` — **no** `delivered →
  returned` quick-step button. Delivered orders link to the returns queue
  instead. This is the P1-04 gap closed correctly rather than papered over.
- Nav entry «مرجوعی و استرداد» and route `/seller/returns`.

---

## 7. Bugs found and fixed along the way

1. **`AuditLog.action` enum was missing every RMA action.** It contained
   `REFUND_ISSUED` but not `RETURN_REQUESTED` / `RETURN_FILED` /
   `RETURN_STATUS_CHANGED`. Because `action` is an enum, `auditLog.save()`
   failed validation and `AuditService.log`'s catch **silently swallowed** it —
   the entire RMA audit trail was being discarded. Found because a test asserted
   the row existed and got `null`.
2. **`transitionReturn` released `openKey` on every transition**, including
   `approved` and `received`. Both are still open, so a second claim could be
   filed against an order whose first claim was unresolved. Now released only on
   a terminal state.
3. **`returnEligibility` dereferenced `order.timeline` before its own null
   guard**, throwing a `TypeError` instead of returning a clean verdict.
4. **`listSellerReturns` could return `counts: undefined`** while its declared
   return type promised a `ReturnCounts` — `unwrap` returns `res.data`
   verbatim. The type was a lie; the client now fills the missing half.
5. **Pre-existing St32 gate regression (not from this stage):**
   `BulkRowOutcome` was one loose union, so `failed[0].reason` — which the
   server always sends — was a type error. `npx tsc --noEmit` was already
   failing at `HEAD` before Stage 33 began. Replaced with three precise
   per-bucket row types matching what the backend actually pushes.

---

## 8. Tests

`backend/__tests__/seller-returns.test.js` — **32 tests**, covering:

- **Buyer opens a claim**: RMA minted, items snapshotted, timeline seeded;
  second claim on the same order refused (`409`); non-delivered order refused;
  another buyer's order is a `404`; day 6 accepted / day 8 refused; reason
  required; own-claims-only listing; receipt exposes the affordance.
- **Seller adjudication**: queue + counts + per-seller distinct RMA numbers;
  another store sees nothing and gets `404` by id; manager may approve, staff
  may not (`403`); rejection requires a justification; `requested → received`
  is refused as a skipped step (`409`); refund before receipt refused.
- **Role separation**: refund is owner-only — manager and staff both `403`.
- **The money**: over-total refund refused; zero, negative and non-integer
  amounts refused; full refund moves the order to `returned`, sets
  `payment.status = refunded`, restores stock by exactly the ordered qty, and
  writes a `HIGH`-risk `REFUND_ISSUED` audit with the amount; a partial refund
  is recorded as the partial amount, not the order total; `openKey` is still
  held while open and released only after the refund closes it; a rejected
  claim leaves the order's status and payment untouched and frees the order for
  a fresh claim.
- **Seller-filed**: filed straight into `approved` with no claiming buyer; other
  store's order refused; own order accepted; window still enforced.
- **Service guards**: unknown order id does not leak; a seller-entered order
  has no claimable buyer identity.

Frontend service tests: **+13** (8 seller, 5 buyer) covering payload shapes,
note omission, the refund returning both RMA and order, and domain errors
propagating rather than being swallowed.

### Gates

| Gate | Baseline (St32) | Stage 33 |
|---|---|---|
| Backend jest | 937 / 937, 58 suites | **969 / 969, 59 suites** |
| Backend eslint | 0 errors, 66 warnings | **0 errors, 66 warnings** |
| Frontend vitest | 173 / 173 | **186 / 186** |
| `tsc --noEmit` | ❌ failing (pre-existing) | **clean** |
| Frontend eslint | clean | **clean** |

No new npm dependencies. No network access required.

---

## 9. Scope notes

- **P0-01 (real payment gateway) is untouched.** The refund records an intended
  ledger entry against the mock provider; actually moving money through a
  gateway remains P0-01.
- The refund path is **not** wrapped in a Mongo transaction. A crash between the
  order transition and the RMA write would leave a `received` claim against a
  `returned` order. The state is recoverable and re-running the refund is
  idempotent in effect, but making it atomic is the natural hardening follow-up
  if the deployment gains a replica set.
- The buyer's "my returns" list endpoint exists and is client-typed, but claims
  are surfaced on the order receipt rather than on a dedicated page.

---

## 10. Files

**New**
- `backend/models/ReturnRequest.js`
- `backend/services/ReturnService.js`
- `backend/__tests__/seller-returns.test.js`
- `frontend/src/types/returns.ts`
- `frontend/src/pages/seller/ReturnsSeller.tsx`
- `docs/reports/NAKHSHA_STAGE33_RETURNS_RMA.md`

**Modified**
- `backend/models/Order.js` — `payment.refundedAmount` / `refundedAt`
- `backend/models/AuditLog.js` — three missing RMA audit actions
- `backend/controllers/SellerController.js` — five return handlers
- `backend/controllers/StorefrontOrderController.js` — buyer return handlers
- `backend/routes/seller.js` — five routes
- `backend/routes/storefront-order.js` — three routes + validation schemas
- `frontend/src/types/seller.ts`, `types/storefront.ts` — RMA types
- `frontend/src/services/sellerService.ts`, `storefrontService.ts` — clients
- `frontend/src/pages/seller/FulfillmentSeller.tsx` — RMA path
- `frontend/src/pages/storefront/BuyerOrderPage.tsx` — buyer return UI
- `frontend/src/App.tsx`, `components/seller/SellerLayout.tsx` — route + nav
- `frontend/src/services/__tests__/*.test.ts` — +13 tests
