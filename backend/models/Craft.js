const mongoose = require("mongoose");

const craftSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    images: [String],
    // Craft kind: artwork (physical), class (educational), service
    kind: {
      type: String,
      enum: ["artwork", "class", "service"],
      required: true,
    },
    // Craft type/category (for filtering and display)
    craftType: {
      type: String,
      enum: [
        "carpet",
        "pottery",
        "metalwork",
        "woodwork",
        "textile",
        "jewelry",
        "leather",
        "other",
      ],
      default: "other",
    },
    // Commerce fields
    price: { type: Number, min: 0 },
    currency: { type: String, default: "IRR", maxlength: 10 },
    forSale: { type: Boolean, default: false },
    tags: [String],
    // Schedule for classes
    schedule: {
      date: Date,
      durationMinutes: Number,
      seats: Number,
      locationNote: String,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Alias for backward compatibility with routes that use artisanId
    artisanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artisan",
    },
    location: {
      city: String,
      neighborhood: String,
      // GeoJSON Point type for MongoDB geospatial queries
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
        text: { type: String },
        rating: { type: Number, min: 1, max: 5 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    extra: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

// ============================================================================
// PRODUCTION INDEXES
// ============================================================================

// Geospatial index for location-based searches (CRITICAL for nearby queries)
craftSchema.index({ "location.geometry": "2dsphere" });

// Compound index: author + createdAt for user's craft feed (descending for latest first)
craftSchema.index({ author: 1, createdAt: -1 });

// Index on createdAt for global feed sorting (descending for latest first)
craftSchema.index({ createdAt: -1 });

// Compound index for published crafts filtering
craftSchema.index({ isPublished: 1, createdAt: -1 });

// Compound index for kind-based filtering
craftSchema.index({ kind: 1, isPublished: 1, createdAt: -1 });

// Compound index for craftType filtering
craftSchema.index({ craftType: 1, isPublished: 1 });

// Full text search on common fields with weights
craftSchema.index(
  { title: "text", description: "text", tags: "text" },
  {
    weights: {
      title: 10,
      description: 5,
      tags: 3,
    },
    name: "craft_text_search",
  },
);

// Indexes for user interaction lookups
craftSchema.index({ "likes.user": 1 });
craftSchema.index({ "dislikes.user": 1 });

// Virtuals
craftSchema.virtual("averageRating").get(function () {
  if (!Array.isArray(this.comments) || this.comments.length === 0) return 0;
  const rated = this.comments.filter((c) => c.rating);
  if (!rated.length) return 0;
  const sum = rated.reduce((a, b) => a + (b.rating || 0), 0);
  return (sum / rated.length).toFixed(1);
});

craftSchema.virtual("totalLikes").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});

craftSchema.virtual("totalDislikes").get(function () {
  return Array.isArray(this.dislikes) ? this.dislikes.length : 0;
});

craftSchema.set("toJSON", { virtuals: true });
craftSchema.set("toObject", { virtuals: true });

// Pre-save middleware to accept legacy `location.coordinates` and normalize to GeoJSON
craftSchema.pre("save", function (next) {
  try {
    if (
      this.location &&
      Array.isArray(this.location.coordinates) &&
      (!this.location.geometry ||
        !Array.isArray(this.location.geometry.coordinates))
    ) {
      this.location = Object.assign({}, this.location, {
        geometry: {
          type: "Point",
          coordinates: this.location.coordinates,
        },
      });
      // keep legacy coordinates on the object for compatibility when requested
    }
  } catch (e) {
    // ignore and allow validation to handle issues
  }
  next();
});

// Transform JSON output to keep backward-compatible `location.coordinates` field
craftSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    if (
      ret.location &&
      ret.location.geometry &&
      Array.isArray(ret.location.geometry.coordinates)
    ) {
      ret.location = Object.assign({}, ret.location, {
        coordinates: ret.location.geometry.coordinates,
      });
      // don't expose nested geometry to API consumers
      delete ret.location.geometry;
    }
    return ret;
  },
});

// Helper method for bulk migration of old documents
craftSchema.statics.migrateLocations = async function () {
  const docs = await this.find({
    "location.coordinates": { $exists: true },
    "location.geometry": { $exists: false },
  });

  console.log(`Found ${docs.length} craft documents to migrate`);

  for (const doc of docs) {
    if (
      Array.isArray(doc.location?.coordinates) &&
      doc.location.coordinates.length === 2
    ) {
      doc.location = {
        ...doc.location,
        geometry: {
          type: "Point",
          coordinates: doc.location.coordinates,
        },
      };
      await doc.save();
    }
  }

  console.log("Craft location migration complete");
};

// Create an initialization function to ensure indexes
craftSchema.statics.ensureIndexes = async function () {
  try {
    const indexes = await this.collection.getIndexes();
    const hasGeo = indexes["location.geometry_2dsphere"];
    const hasText = indexes["craft_text_search"];

    if (!hasGeo || !hasText) {
      console.log("Creating missing craft indexes...");
      if (!hasGeo) {
        await this.collection.createIndex(
          { "location.geometry": "2dsphere" },
          { background: true },
        );
      }
      if (!hasText) {
        await this.collection.createIndex(
          { title: "text", description: "text", tags: "text" },
          {
            weights: {
              title: 10,
              description: 5,
              tags: 3,
            },
            name: "craft_text_search",
            background: true,
          },
        );
      }
      console.log("Craft indexes created successfully");
    }
  } catch (err) {
    console.error("Error ensuring craft indexes:", err);
  }
};

// Create model but keep collection name `listings` for backwards compatibility
const Craft = mongoose.model("Craft", craftSchema, "listings");

// Export the model directly (statics are available on the model)
module.exports = Craft;
