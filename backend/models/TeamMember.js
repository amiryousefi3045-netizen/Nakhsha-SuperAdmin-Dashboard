const mongoose = require("mongoose");

const TEAM_ROLES = ["manager", "staff"];

const TeamMemberSchema = new mongoose.Schema(
  {
    sellerProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: TEAM_ROLES,
      default: "staff",
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

// A user belongs to at most one store team, and a store holds a given user
// only once. The login-time membership resolution in middleware/seller.js
// relies on this 1:1 invariant.
TeamMemberSchema.index({ userId: 1 }, { unique: true });
TeamMemberSchema.index({ sellerProfileId: 1, userId: 1 }, { unique: true });
TeamMemberSchema.index({ sellerProfileId: 1, createdAt: -1 });

module.exports = mongoose.model("TeamMember", TeamMemberSchema);
module.exports.TEAM_ROLES = TEAM_ROLES;