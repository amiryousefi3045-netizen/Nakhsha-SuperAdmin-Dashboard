const SellerProfile = require("../models/SellerProfile");
const { createErrorResponse } = require("../utils/response");

/**
 * Loads the seller's SellerProfile and attaches it as `req.seller`.
 *
 * Must run AFTER requireRole("seller") (or requireAuth) — it does not
 * re-validate the token/account itself. If the user is a seller but has no
 * SellerProfile yet, the request is rejected with 403 so the client is forced
 * to create the profile first.
 */
async function requireSellerProfile(req, res, next) {
  try {
    const profile = await SellerProfile.findOne({ userId: req.user.id }).lean();
    if (!profile) {
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
    next();
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
 * Checks that the target resource belongs to the requesting seller.
 * For use on route handlers that load a product by :id.
 */
function isSellerOwner(seller) {
  return (resource) =>
    resource &&
    (String(resource.sellerId) === String(seller._id) ||
      String(resource.sellerUserId) === String(seller.userId));
}

module.exports = { requireSellerProfile, isSellerOwner };