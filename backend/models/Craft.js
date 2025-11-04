const mongoose = require("mongoose");

const CraftSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxLength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxLength: 5000,
    },
    artisanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artisan",
      required: true,
    },
    images: [
      {
        type: String,
        validate: {
          validator: function (v) {
            return /^(https?:\/\/|\/uploads\/)/.test(v);
          },
          message: "Image URL must be http(s) or /uploads/ path",
        },
      },
    ],
    craftType: {
      type: String,
      required: true,
      enum: [
        "قالی و گلیم",
        "سفال و سرامیک",
        "منبت و خاتم",
        "فلزکاری",
        "پارچه‌بافی",
        "مینیاتور و نقاشی",
        "چرم‌دوزی",
        "سایر",
      ],
    },
    price: {
      type: Number,
      min: 0,
    },
    forSale: {
      type: Boolean,
      default: true,
    },
    tags: [String],
    location: {
      city: {
        type: String,
        trim: true,
      },
      neighborhood: String,
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: "2dsphere",
        required: true,
        validate: {
          validator: function (v) {
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 && // longitude
              v[1] >= -90 &&
              v[1] <= 90
            ); // latitude
          },
          message: "Invalid coordinates",
        },
      },
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    dislikes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: { type: String, required: true, maxLength: 2000 },
        rating: { type: Number, min: 1, max: 5 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // تعاملات اجتماعی و تجاری
    sale: {
      available: Boolean,
      price: Number,
      currency: { type: String, default: "IRR" },
      negotiable: Boolean,
      shippingAvailable: Boolean,
    },
    barter: {
      available: Boolean,
      desiredItems: [String],
      proposals: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          itemsOffered: [String],
          message: String,
          status: {
            type: String,
            enum: ["pending", "approved", "declined", "canceled"],
            default: "pending",
          },
          createdAt: { type: Date, default: Date.now },
          updatedAt: Date,
        },
      ],
    },
    culturalStory: {
      type: String,
      trim: true,
      maxLength: 6000,
    },
  },
  {
    timestamps: true,
  }
);

// Text search on title, description, tags, and culturalStory
CraftSchema.index(
  {
    title: "text",
    description: "text",
    tags: "text",
    culturalStory: "text",
    "location.city": "text",
    "location.neighborhood": "text",
  },
  {
    weights: {
      title: 10,
      tags: 5,
      description: 3,
      culturalStory: 2,
      "location.city": 2,
      "location.neighborhood": 1,
    },
    name: "craft_text_search",
  }
);

// Compound index for common queries
CraftSchema.index({ craftType: 1, isPublished: 1, createdAt: -1 });
CraftSchema.index({ "location.city": 1, isPublished: 1, createdAt: -1 });
CraftSchema.index({ artisanId: 1, createdAt: -1 });

// Virtual for average rating
CraftSchema.virtual("averageRating").get(function () {
  const ratings = this.comments
    .filter((c) => typeof c.rating === "number")
    .map((c) => c.rating);
  if (!ratings.length) return null;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
});

// Virtuals for like/dislike counts
CraftSchema.virtual("totalLikes").get(function () {
  return this.likes?.length || 0;
});

CraftSchema.virtual("totalDislikes").get(function () {
  return this.dislikes?.length || 0;
});

// toJSON transform
CraftSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Craft = mongoose.model("Craft", CraftSchema);
module.exports = Craft;
