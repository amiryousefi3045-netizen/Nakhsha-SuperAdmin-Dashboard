const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    sellerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceCraftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Craft",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    images: [String],
    category: {
      type: String,
      enum: [
        "carpet",
        "pottery",
        "metalwork",
        "woodwork",
        "textile",
        "jewelry",
        "leather",
        "home_decor",
        "accessories",
        "tourism",
        "other",
      ],
      default: "other",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "IRR",
      maxlength: 10,
    },
    sku: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "pending_review", "active", "paused", "archived", "rejected"],
      default: "draft",
    },
    rejectionReason: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    stock: {
      onHand: { type: Number, default: 0, min: 0 },
      reserved: { type: Number, default: 0, min: 0 },
      incoming: { type: Number, default: 0, min: 0 },
    },
    stockPolicy: {
      type: String,
      enum: ["tracked", "untracked", "unlimited"],
      default: "tracked",
    },
    lowStockThreshold: {
      type: Number,
      default: 3,
      min: 0,
    },
    // Denormalized buyer rating aggregate (Phase 14). Maintained by
    // StorefrontReviewService.refreshProductRating after every review write so
    // the public catalog and cards can render stars without an aggregation.
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    variants: [],
    shipping: {
      weight: { type: Number, min: 0 },
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
      },
      method: String,
    },
    tags: [String],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================================
// INDEXES
// ============================================================================

// Primary seller-scoped compound indexes
ProductSchema.index({ sellerId: 1, createdAt: -1 });
ProductSchema.index({ sellerId: 1, status: 1 });
ProductSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
ProductSchema.index({ sellerId: 1, category: 1 });
ProductSchema.index({ sellerId: 1, updatedAt: -1 });
ProductSchema.index({ sellerUserId: 1, createdAt: -1 });

// Search index
ProductSchema.index({ title: "text", description: "text", tags: "text" }, {
  weights: { title: 10, description: 5, tags: 3 },
  name: "product_text_search",
});

// ============================================================================
// VIRTUALS
// ============================================================================

ProductSchema.virtual("availableStock").get(function () {
  const onHand = Number(this.stock?.onHand || 0);
  const reserved = Number(this.stock?.reserved || 0);
  const available = Math.max(0, onHand - reserved);
  return available;
});

ProductSchema.virtual("isLowStock").get(function () {
  if (this.stockPolicy !== "tracked") return false;
  return this.availableStock <= (this.lowStockThreshold || 0);
});

ProductSchema.virtual("isOutOfStock").get(function () {
  if (this.stockPolicy !== "tracked") return false;
  return this.availableStock <= 0;
});

ProductSchema.methods.adjustStock = function ({ delta, reservedDelta = 0 }) {
  this.stock.onHand = Math.max(0, Number(this.stock.onHand || 0) + (delta || 0));
  this.stock.reserved = Math.max(
    0,
    Number(this.stock.reserved || 0) + (reservedDelta || 0)
  );
  return this;
};

ProductSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    if (typeof ret.availableStock === "number" && ret.stock) {
      ret.stock.available = ret.availableStock;
      ret.isLowStock = ret.isLowStock;
      ret.isOutOfStock = ret.isOutOfStock;
      delete ret.availableStock;
    }
    return ret;
  },
});

// ============================================================================
// MONEY SAFETY NET: money is stored in minor integer units (Rial)
// ============================================================================
// Follows the project convention: `price` is stored as Number (integer
// Rial). All arithmetic must be integer-based; no floating-point naive math.

const Product = mongoose.model("Product", ProductSchema);
module.exports = Product;