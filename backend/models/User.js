const mongoose = require("mongoose");
const logger = require("../utils/logger");

/**
 * Granular permissions available for `admin` users.
 * The `super_admin` role is implicitly granted every capability and its
 * `permissions` array must always remain empty.
 */
const ALLOWED_PERMISSIONS = Object.freeze([
  "DELETE_USERS",
  "APPROVE_CONTENT",
  "VIEW_AUDIT_LOGS",
]);

const ROLES = Object.freeze([
  "user",
  "tour_leader",
  "admin",
  "super_admin",
]);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false, // Not everyone might want to provide a name initially
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    handle: {
      type: String,
      lowercase: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    location: {
      city: String,
      neighborhood: String,
      // GeoJSON Point for MongoDB geospatial queries
      geometry: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          validate: {
            validator: function (coords) {
              return (
                Array.isArray(coords) &&
                coords.length === 2 &&
                coords[0] >= -180 &&
                coords[0] <= 180 && // longitude
                coords[1] >= -90 &&
                coords[1] <= 90 // latitude
              );
            },
            message: "مختصات جغرافیایی نامعتبر است",
          },
        },
      },
    },
    role: {
      type: String,
      enum: ROLES,
      default: "user",
    },
    /**
     * Whether the account is currently blocked. Blocked users are rejected on
     * every protected request (requireRole queries the DB, never trusts a JWT).
     */
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    /**
     * Monotonic counter stamped into every access JWT (`ver` claim).
     * Incremented by `revokeAllTokens` (logout-all, role change, block) so a
     * previously issued stateless access token is rejected by requireAuth on
     * the very next request instead of living until its natural expiry.
     */
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Optional note explaining why an admin blocked/unblocked the account.
     */
    moderatorNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "یادداشت نباید بیش از ۵۰۰ کاراکتر باشد"],
    },
    /**
     * Granular permissions array. Only meaningful for role === "admin".
     * `user`, `tour_leader` and `super_admin` must always keep it empty.
     */
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function (value) {
          return value.every((p) => ALLOWED_PERMISSIONS.includes(p));
        },
        message: "دسترسی نامعتبر است",
      },
    },
    creatorType: {
      type: String,
      enum: ["artisan", "tour_leader"],
      default: "artisan",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    crafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
    favoriteCrafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// PRODUCTION INDEXES
// ============================================================================

// Unique index on phone for authentication (enforced at DB level)
userSchema.index({ phone: 1 }, { unique: true });

// Index on handle for profile lookups (sparse allows null, unique for non-null)
userSchema.index({ handle: 1 }, { unique: true, sparse: true });

// Index on createdAt for sorting users by join date
userSchema.index({ createdAt: -1 });

// Geospatial index for location-based searches (sparse since not all users have locations)
userSchema.index({ "location.geometry": "2dsphere" }, { sparse: true });

// Compound index for role-based queries
userSchema.index({ role: 1, isVerified: 1 });

// ============================================================================
// SINGLETON SUPER ADMIN INVARIANT
// ============================================================================
// Database-level enforcement: only one document may ever carry the
// "super_admin" role. The partial index guarantees uniqueness even when two
// concurrent OTP logins try to assign the role at the same time.
userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "super_admin" },
    name: "unique_super_admin_count",
  },
);

// ============================================================================
// PRE-VALIDATION GUARDS
// ============================================================================
// 1. Permission semantics: only `admin` may hold granular permissions. Any
//    other role silently resets the array to [] (never stored).
// 2. Singleton check: a second super_admin must be rejected before the unique
//    index throws, from any code path that tries to assign the role.
userSchema.pre("validate", function (next) {
  if (this.role !== "admin") {
    this.permissions = [];
  }
  next();
});

userSchema.pre("validate", async function (next) {
  const isBecomingSuperAdmin =
    this.role === "super_admin" &&
    (this.isNew || this.isModified("role"));

  if (!isBecomingSuperAdmin) {
    return next();
  }

  try {
    const Model = this.constructor;
    const existing = await Model.countDocuments({
      role: "super_admin",
      _id: { $ne: this._id },
    });

    // If another document already holds the super_admin role, this document
    // must never be assigned it (singleton invariant).
    if (existing > 0) {
      const err = new Error("از قبل یک سوپر ادمین وجود دارد");
      err.code = 409;
      return next(err);
    }
    return next();
  } catch (e) {
    return next(e);
  }
});

// Pre-save middleware to normalize legacy coordinates to GeoJSON
userSchema.pre("save", function (next) {
  try {
    // If location has coordinates array but no geometry, convert to GeoJSON
    if (
      this.location &&
      Array.isArray(this.location.coordinates) &&
      this.location.coordinates.length === 2 &&
      (!this.location.geometry ||
        !Array.isArray(this.location.geometry.coordinates))
    ) {
      this.location.geometry = {
        type: "Point",
        coordinates: this.location.coordinates,
      };
    }
  } catch (e) {
    // Allow validation to handle any issues
  }
  next();
});

// Transform JSON output for backward compatibility
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    // Expose coordinates at top level for API consumers
    if (
      ret.location &&
      ret.location.geometry &&
      Array.isArray(ret.location.geometry.coordinates)
    ) {
      ret.location.coordinates = ret.location.geometry.coordinates;
      // Remove geometry from output
      delete ret.location.geometry;
    }
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
module.exports.ALLOWED_PERMISSIONS = ALLOWED_PERMISSIONS;
module.exports.ROLES = ROLES;
