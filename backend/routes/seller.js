/**
 * Seller Dashboard Routes
 *
 * Every route in this file is protected by:
 *   requireAuth             -> valid JWT + account not blocked
 *   requireRole("seller")   -> role === "seller" (server checks DB, never JWT)
 *   requireSellerProfile    -> a SellerProfile document must exist
 *
 * Ownership security invariants:
 *   - All `sellerId` filters are derived from the authenticated seller.
 *   - Client-supplied `sellerId`/`sellerUserId` is never accepted.
 *   - Resources of another seller return 404 (not 403) to avoid leaking
 *     the existence of other sellers' resources.
 */
const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireSellerProfile } = require("../middleware/seller");
const { sellerWriteLimiter } = require("../middleware/rateLimiter");
const sellerController = require("../controllers/SellerController");

const router = Router();

// Write endpoints (catalog/inventory/profile mutations) are rate-limited per
// IP. Express-rate-limit runs before the controller; NODE_ENV=test bypasses
// it so integration tests stay green (mirrors heavyLimiter behavior).
const write = [requireAuth, requireRole("seller"), requireSellerProfile, sellerWriteLimiter];

// ── Dashboard ───────────────────────────────────────────────────────────────
router.get(
  "/dashboard",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getDashboard,
);

// ── Profile ─────────────────────────────────────────────────────────────────
router.get(
  "/profile",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getProfile,
);
router.patch("/profile", write, sellerController.updateProfile);

// ── Products ────────────────────────────────────────────────────────────────
router.get(
  "/products",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.listProducts,
);
router.post("/products", write, sellerController.createProduct);
router.get(
  "/products/:id",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getProduct,
);
router.patch("/products/:id", write, sellerController.updateProduct);
router.delete("/products/:id", write, sellerController.deleteProduct);
router.patch("/products/:id/status", write, sellerController.updateProductStatus);

// ── Inventory ───────────────────────────────────────────────────────────────
router.get(
  "/inventory",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.listInventory,
);
router.patch(
  "/inventory/:productId",
  write,
  sellerController.adjustStock,
);
router.get(
  "/inventory/:productId/history",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getStockHistory,
);

// ── Orders / Fulfillment ────────────────────────────────────────────────────
// Order mutations are part of the rate-limited seller write surface. Reads
// (list/detail/fulfillment) stay unthrottled like the other catalogs.
router.get(
  "/orders",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.listSellerOrders,
);
router.get(
  "/orders/:id",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getSellerOrder,
);
router.patch(
  "/orders/:id/status",
  write,
  sellerController.changeOrderStatus,
);
router.get(
  "/fulfillment",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getSellerFulfillment,
);

// ── Finance ─────────────────────────────────────────────────────────────────
// Finance reads stay unthrottled; payout mutations are part of the seller
// write surface (rate-limited like the other mutations).
router.get(
  "/finance",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getFinance,
);
router.get(
  "/payouts",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getPayouts,
);
router.post("/payouts", write, sellerController.requestPayout);
router.patch("/payouts/:id/cancel", write, sellerController.cancelPayout);

// ── Analytics ───────────────────────────────────────────────────────────────
router.get(
  "/analytics",
  requireAuth,
  requireRole("seller"),
  requireSellerProfile,
  sellerController.getAnalytics,
);

module.exports = router;