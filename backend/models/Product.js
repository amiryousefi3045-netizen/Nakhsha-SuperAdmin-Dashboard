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
      /**
       * Per-location breakdown (phase 38), summed at write time so that
       * `stock.onHand === Σ locations.onHand` and likewise for `reserved`.
       *
       * These live on THIS document, not in a second collection, because the
       * deployment runs a standalone MongoDB where multi-document
       * transactions do not exist. Splitting them out would mean an order
       * could move a unit between the two collections in two steps and land
       * somewhere in between; keeping them here makes every stock movement a
       * single atomic write.
       *
       * An empty array means "not yet broken down" rather than "no stock":
       * InventoryService materializes it from the aggregate on first use.
       */
      locations: {
        type: [
          new mongoose.Schema(
            {
              locationId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "InventoryLocation",
                required: true,
              },
              onHand: { type: Number, default: 0, min: 0 },
              reserved: { type: Number, default: 0, min: 0 },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
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

/**
 * How many units a buyer can actually take right now.
 *
 * `onHand` IS the free balance, so this is simply `onHand`. It is not
 * `onHand - reserved`: `OrderService.reserveStock` moves a unit from `onHand`
 * to `reserved` in one update, which already removed it from the free balance.
 * Subtracting `reserved` here as well would count the same commitment twice
 * and advertise a product as out of stock while units were still free —
 * for example 6 units with 3 in flight leaves 3 sellable, not 0.
 *
 * Physical total on the seller's shelves = onHand + reserved; the rest of the
 * system (reserve guard, CSV `onHand`, payout reconciliation) is written
 * against that convention.
 */
ProductSchema.virtual("availableStock").get(function () {
  return Math.max(0, Number(this.stock?.onHand || 0));
});

/**
 * Low stock means "running out", which is only useful while there is still
 * something to run out of. An empty shelf is reported by `isOutOfStock`;
 * labelling it low as well makes a dashboard show the same product twice in
 * two different colours. StorefrontService has always used this stricter
 * reading — this brings the model in line with it instead of the other way.
 */
ProductSchema.virtual("isLowStock").get(function () {
  if (this.stockPolicy !== "tracked") return false;
  const available = this.availableStock;
  return available > 0 && available <= (this.lowStockThreshold || 0);
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