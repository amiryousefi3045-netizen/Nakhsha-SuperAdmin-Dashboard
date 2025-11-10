const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    images: [String],
    // Listing kind: artwork (physical), class (educational), service
    kind: {
      type: String,
      enum: ["artwork", "class", "service"],
      required: true,
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
      coordinates: {
        type: [Number], // Legacy field for backward compatibility
        deprecated: true,
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
  { timestamps: true }
);

// Geospatial index on GeoJSON Point field
listingSchema.index({ "location.geometry": "2dsphere" });

// Full text search on common fields with weights
listingSchema.index(
  { title: "text", description: "text", tags: "text" },
  {
    weights: {
      title: 10,
      description: 5,
      tags: 3,
    },
    name: "listing_text_search",
  }
);

// Indexes for fast lookups
listingSchema.index({ "likes.user": 1 });
listingSchema.index({ "dislikes.user": 1 });

// Virtuals
listingSchema.virtual("averageRating").get(function () {
  if (!Array.isArray(this.comments) || this.comments.length === 0) return 0;
  const rated = this.comments.filter((c) => c.rating);
  if (!rated.length) return 0;
  const sum = rated.reduce((a, b) => a + (b.rating || 0), 0);
  return (sum / rated.length).toFixed(1);
});

listingSchema.virtual("totalLikes").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});

listingSchema.virtual("totalDislikes").get(function () {
  return Array.isArray(this.dislikes) ? this.dislikes.length : 0;
});

// Pre-save middleware for location data migration
listingSchema.pre("save", function (next) {
  // If old format coordinates exist but no geometry
  if (
    Array.isArray(this.location?.coordinates) &&
    !this.location?.geometry?.coordinates
  ) {
    // Move coordinates to GeoJSON format
    this.location = {
      ...this.location,
      geometry: {
        type: "Point",
        coordinates: this.location.coordinates,
      },
    };
  }
  next();
});

// Ensure consistent format for JSON responses
listingSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // If new GeoJSON format exists, ensure coordinates are accessible
    // at the expected path for backward compatibility
    if (ret.location?.geometry?.coordinates) {
      ret.location = {
        ...ret.location,
        coordinates: ret.location.geometry.coordinates,
      };
      // Don't expose internal GeoJSON structure in API
      delete ret.location.geometry;
    }
    return ret;
  },
});

listingSchema.set("toObject", { virtuals: true });

// Helper method for bulk migration of old documents
listingSchema.statics.migrateLocations = async function () {
  const docs = await this.find({
    "location.coordinates": { $exists: true },
    "location.geometry": { $exists: false },
  });

  console.log(`Found ${docs.length} documents to migrate`);

  for (const doc of docs) {
    if (Array.isArray(doc.location?.coordinates)) {
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

  console.log("Location migration complete");
};

// Create an initialization function to ensure indexes
listingSchema.statics.ensureIndexes = async function () {
  try {
    const indexes = await this.collection.getIndexes();
    const hasGeo = indexes["location.geometry_2dsphere"];
    const hasText = indexes["listing_text_search"];

    if (!hasGeo || !hasText) {
      console.log("Creating missing listing indexes...");
      if (!hasGeo) {
        await this.collection.createIndex(
          { "location.geometry": "2dsphere" },
          { background: true }
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
            name: "listing_text_search",
            background: true,
          }
        );
      }
      console.log("Listing indexes created successfully");
    }
  } catch (err) {
    console.error("Error ensuring listing indexes:", err);
  }
};

// Deprecated shim: re-export the canonical Craft model to maintain compatibility
// with any remaining imports that reference ../models/Recipe
try {
  module.exports = require("./Craft");
} catch (e) {
  // Fallback: export Listing model if Craft is not available (unlikely)
  const Listing = mongoose.model("Listing", listingSchema);
  module.exports = Object.assign(Listing, {
    ensureIndexes: () => Listing.ensureIndexes(),
    migrateLocations: () => Listing.migrateLocations(),
  });
}
