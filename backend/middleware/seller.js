const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const { createErrorResponse } = require("../utils/response");

/**
 * Loads the seller context and attaches it as `req.seller`.
 *
 * Must run AFTER requireRole("seller") (or requireAuth) — it does not
 * re-validate the token/account itself. Resolution order:
 *   1. A SellerProfile owned by the user  -> owner (req.sellerMember = null).
 *   2. A TeamMember roster entry          -> member of that store
 *      (req.sellerMember = { id, userId, role }); req.seller is the store.
 *   3. No profile and no membership       -> 403 SELLER_PROFILE_REQUIRED.
 */
async function requireSellerProfile(req, res, next) {
  try {
    const profile = await SellerProfile.findOne({ userId: req.user.id }).lean();
    if (profile) {
      if (profile.status === "suspended") {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "SELLER_SUSPENDED",
              "حساب فروشندگی شما مسدود شده است. با پشتیبانی تماس بگیرید.",
              null,
              req.id,
            ),
          );
      }
      req.seller = profile;
      req.sellerMember = null;
      return next();
    }

    const member = await TeamMember.findOne({ userId: req.user.id }).lean();
    if (member) {
      const store = await SellerProfile.findById(member.sellerProfileId).lean();
      if (!store) {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "SELLER_PROFILE_REQUIRED",
              "برای استفاده از داشبورد فروشنده ابتدا پروفایل فروشگاه را ایجاد کنید",
              null,
              req.id,
            ),
          );
      }
      if (store.status === "suspended") {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "SELLER_SUSPENDED",
              "حساب فروشندگی شما مسدود شده است. با پشتیبانی تماس بگیرید.",
              null,
              req.id,
            ),
          );
      }
      req.seller = store;
      req.sellerMember = {
        id: String(member._id),
        userId: String(member.userId),
        role: member.role,
      };
      return next();
    }

    return res
      .status(403)
      .json(
        createErrorResponse(
          "SELLER_PROFILE_REQUIRED",
          "برای استفاده از داشبورد فروشنده ابتدا پروفایل فروشگاه را ایجاد کنید",
          null,
          req.id,
        ),
      );
  } catch (e) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "خطای داخلی سرور",
          null,
          req.id,
        ),
      );
  }
}

/**
 * Owner-only capability guard. Runs after requireSellerProfile; rejects team
 * members (manager/staff) from owner-scoped surfaces (settings writes, team
 * management, finance).
 */
function requireOwnerOnly(req, res, next) {
  if (req.sellerMember) {
    return res
      .status(403)
      .json(
        createErrorResponse(
          "FORBIDDEN",
          "این بخش فقط برای مالک فروشگاه در دسترس است",
          { requiredRole: "owner" },
          req.id,
        ),
      );
  }
  next();
}

/**
 * Manager-or-owner capability guard. Restricts the given surface to the store
 * owner and `manager` roster members (e.g. analytics, order status changes).
 */
function requireManagerOrOwner(req, res, next) {
  if (req.sellerMember && req.sellerMember.role !== "manager") {
    return res
      .status(403)
      .json(
        createErrorResponse(
          "FORBIDDEN",
          "این عملیات برای نقش شما مجاز نیست",
          { requiredRole: "manager" },
          req.id,
        ),
      );
  }
  next();
}

/**
 * Checks that the target resource belongs to the requesting seller.
 * For use on route handlers that load a product by :id.
 */
function isSellerOwner(seller) {
  return (resource) =>
    resource &&
    (String(resource.sellerId) === String(seller._id) ||
      String(resource.sellerUserId) === String(seller.userId));
}

module.exports = { requireSellerProfile, requireOwnerOnly, requireManagerOrOwner, isSellerOwner };