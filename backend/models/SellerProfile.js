const mongoose = require("mongoose");

const SellerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    logo: {
      type: String,
      default: "",
    },
    cover: {
      type: String,
      default: "",
    },
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      telegram: { type: String, trim: true },
      instagram: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
    },
    location: {
      city: { type: String, trim: true },
      neighborhood: { type: String, trim: true },
      address: { type: String, trim: true },
      geometry: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number],
          validate: {
            validator: function (coords) {
              if (!Array.isArray(coords) || coords.length === 0) return true;
              return (
                coords.length === 2 &&
                coords[0] >= -180 &&
                coords[0] <= 180 &&
                coords[1] >= -90 &&
                coords[1] <= 90
              );
            },
            message: "مختصات جغرافیایی نامعتبر است",
          },
        },
      },
    },
    verification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected", "suspended"],
        default: "pending",
      },
      verifiedAt: Date,
      rejectedReason: String,
      documents: [
        {
          type: {
            type: String,
            enum: ["business_license", "national_id", "craft_certification", "other"],
          },
          image: String,
          note: String,
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
    },
    policies: {
      shipping: {
        description: { type: String, maxlength: 1000 },
        nationwide: { type: Boolean, default: false },
        cities: [String],
        freeShippingMinOrder: { type: Number, min: 0 },
        estimatedDays: { type: Number, min: 1 },
      },
      returns: {
        description: { type: String, maxlength: 1000 },
        acceptsReturns: { type: Boolean, default: false },
        returnWindowDays: { type: Number, min: 1, max: 30 },
      },
    },
    status: {
      type: String,
      enum: ["active", "suspended", "deactivated"],
      default: "active",
    },
    // Settlement terms. Set by the platform (admin); read-only from the seller
    // dashboard. Defaults keep cash-flow honest: no commission, no minimum.
    finance: {
      commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
      payoutMinimum: { type: Number, default: 0, min: 0 },
      holdDays: { type: Number, default: 0, min: 0, max: 365 },
    },
    // Seller-operated store settings (owner-only writes). `defaultPayoutMethod`
    // is honored by FinanceService when a payout request omits the method;
    // the notification toggles and storefront flag are stored preferences
    // consumed by their respective surfaces.
    settings: {
      storefrontPublished: { type: Boolean, default: false },
      notificationEmail: { type: Boolean, default: true },
      notificationSms: { type: Boolean, default: false },
      defaultPayoutMethod: {
        type: String,
        enum: ["bank_transfer", "card", "wallet", "other"],
        default: "bank_transfer",
      },
    },
    stats: {
      totalProducts: { type: Number, default: 0 },
      totalOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SellerProfileSchema.index({ userId: 1 }, { unique: true });
SellerProfileSchema.index({ slug: 1 }, { unique: true, sparse: true });
SellerProfileSchema.index({ "location.geometry": "2dsphere" }, { sparse: true });
SellerProfileSchema.index({ status: 1, createdAt: -1 });
SellerProfileSchema.index({ "verification.status": 1 });

// Pre-save: generate slug from storeName
SellerProfileSchema.pre("save", async function (next) {
  if (this.isModified("storeName") && !this.slug) {
    const baseSlug = this.storeName
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-|-$/g, "");
    let slug = baseSlug;
    let counter = 1;
    while (
      await mongoose.models.SellerProfile.findOne({
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    this.slug = slug;
  }
  next();
});

// Pre-save: normalize coordinates
SellerProfileSchema.pre("save", function (next) {
  try {
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

// toJSON transform
SellerProfileSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    if (
      ret.location &&
      ret.location.geometry &&
      Array.isArray(ret.location.geometry.coordinates)
    ) {
      ret.location.coordinates = ret.location.geometry.coordinates;
      delete ret.location.geometry;
    }
    // Remove sensitive verification documents from public output
    if (ret.verification && ret.verification.documents) {
      ret.verification.documents = ret.verification.documents.map((d) => ({
        type: d.type,
        uploadedAt: d.uploadedAt,
      }));
    }
    return ret;
  },
});

const SellerProfile = mongoose.model("SellerProfile", SellerProfileSchema);
module.exports = SellerProfile;
