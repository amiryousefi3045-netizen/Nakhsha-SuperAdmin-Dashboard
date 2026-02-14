const mongoose = require("mongoose");

const ArtisanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    bio: {
      type: String,
      trim: true,
      maxLength: 2000,
    },
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
    otherCraftTypes: {
      type: [String],
      validate: {
        validator: function (v) {
          return (
            Array.isArray(v) &&
            v.length > 0 &&
            v.every((type) =>
              [
                "قالی و گلیم",
                "سفال و سرامیک",
                "منبت و خاتم",
                "فلزکاری",
                "پارچه‌بافی",
                "مینیاتور و نقاشی",
                "چرم‌دوزی",
                "سایر",
              ].includes(type),
            )
          );
        },
        message: "حداقل یک نوع صنایع دستی معتبر باید انتخاب شود",
      },
    },
    images: [String], // گالری تصاویر کارگاه یا نمونه کارها
    location: {
      city: {
        type: String,
        required: true,
        trim: true,
      },
      neighborhood: String,
      address: {
        type: String,
        trim: true,
      },
      // GeoJSON Point for MongoDB geospatial queries
      geometry: {
        type: {
          type: String,
          enum: ["Point"],
          required: true,
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          required: true,
          validate: {
            validator: function (coords) {
              return (
                Array.isArray(coords) &&
                coords.length === 2 &&
                coords[0] >= -180 &&
                coords[0] <= 180 && // longitude
                coords[1] >= -90 &&
                coords[1] <= 90
              ); // latitude
            },
            message: "مختصات جغرافیایی نامعتبر است",
          },
        },
      },
    },
    contactInfo: {
      phone: String,
      telegram: String,
      instagram: String,
    },
    // گواهی‌نامه‌ها و مجوزها
    certifications: [
      {
        title: String,
        issuer: String,
        year: Number,
        image: String,
      },
    ],
    // وضعیت تأیید حساب
    verified: {
      type: Boolean,
      default: false,
    },
    verificationDocuments: [
      {
        type: {
          type: String,
          enum: ["ID", "permit", "certification", "other"],
        },
        image: String,
        note: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    // امتیازها و نظرات
    rating: {
      average: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    reviews: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rating: { type: Number, required: true, min: 1, max: 5 },
        text: { type: String, maxLength: 1000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // تنظیمات و ترجیحات
    preferences: {
      shipping: {
        available: { type: Boolean, default: false },
        nationwide: { type: Boolean, default: false },
        cities: [String],
        methods: [String],
      },
      payment: {
        acceptsCash: { type: Boolean, default: true },
        acceptsOnline: { type: Boolean, default: false },
        acceptsBarter: { type: Boolean, default: false },
      },
      workshop: {
        hasPhysicalShop: { type: Boolean, default: false },
        acceptsVisitors: { type: Boolean, default: false },
        visitorNote: String,
      },
    },
  },
  {
    timestamps: true,
  },
);

// Geospatial index for location searches
ArtisanSchema.index({ "location.geometry": "2dsphere" });

// Text search on name, bio, craftTypes
ArtisanSchema.index(
  {
    displayName: "text",
    bio: "text",
    craftTypes: "text",
    "location.city": "text",
    "location.neighborhood": "text",
  },
  {
    weights: {
      displayName: 10,
      craftTypes: 5,
      bio: 3,
      "location.city": 2,
      "location.neighborhood": 1,
    },
    name: "artisan_text_search",
  },
);

// Compound indexes for common queries
ArtisanSchema.index({ verified: 1, craftTypes: 1, "rating.average": -1 });
ArtisanSchema.index({ "location.city": 1, verified: 1, "rating.average": -1 });

// Pre-save middleware to normalize legacy coordinates to GeoJSON
ArtisanSchema.pre("save", function (next) {
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

// Methods to manage reviews and ratings
ArtisanSchema.methods.addReview = async function (userId, rating, text) {
  const existingIdx = this.reviews.findIndex(
    (r) => String(r.userId) === String(userId),
  );

  if (existingIdx !== -1) {
    // Update existing review
    const oldRating = this.reviews[existingIdx].rating;
    this.reviews[existingIdx] = { userId, rating, text, createdAt: new Date() };

    // Adjust rating stats
    const totalPoints = this.rating.total - oldRating + rating;
    this.rating = {
      total: totalPoints,
      count: this.reviews.length,
      average: totalPoints / this.reviews.length,
    };
  } else {
    // Add new review
    this.reviews.push({ userId, rating, text });

    // Update rating stats
    const totalPoints = (this.rating.total || 0) + rating;
    this.rating = {
      total: totalPoints,
      count: this.reviews.length,
      average: totalPoints / this.reviews.length,
    };
  }

  return this.save();
};

ArtisanSchema.methods.removeReview = async function (userId) {
  const idx = this.reviews.findIndex(
    (r) => String(r.userId) === String(userId),
  );
  if (idx === -1) return;

  const oldRating = this.reviews[idx].rating;
  this.reviews.splice(idx, 1);

  // Recalculate rating stats
  if (this.reviews.length === 0) {
    this.rating = { total: 0, count: 0, average: 0 };
  } else {
    const totalPoints = this.rating.total - oldRating;
    this.rating = {
      total: totalPoints,
      count: this.reviews.length,
      average: totalPoints / this.reviews.length,
    };
  }

  return this.save();
};

// toJSON transform
ArtisanSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;

    // Expose coordinates at top level for backward compatibility
    if (
      ret.location &&
      ret.location.geometry &&
      Array.isArray(ret.location.geometry.coordinates)
    ) {
      ret.location.coordinates = ret.location.geometry.coordinates;
      // Don't expose nested geometry structure to API consumers
      delete ret.location.geometry;
    }

    // حذف اطلاعات حساس
    if (ret.verificationDocuments) {
      ret.verificationDocuments = ret.verificationDocuments.map((d) => ({
        type: d.type,
        uploadedAt: d.uploadedAt,
      }));
    }
    if (ret.contactInfo) {
      delete ret.contactInfo.phone;
    }
    return ret;
  },
});

const Artisan = mongoose.model("Artisan", ArtisanSchema);
module.exports = Artisan;
