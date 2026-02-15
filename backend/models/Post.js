const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      default: "post",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      min: 0,
    },
    location: {
      city: {
        type: String,
        trim: true,
      },
      neighborhood: {
        type: String,
        trim: true,
      },
      // GeoJSON Point for MongoDB geospatial queries
      geometry: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
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
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
    },
  },
  {
    timestamps: true,
  },
);

// Geospatial index for location searches
postSchema.index({ "location.geometry": "2dsphere" });

// ============================================================================
// PRODUCTION INDEXES
// ============================================================================

// Compound index: owner + createdAt for user's post feed
postSchema.index({ owner: 1, createdAt: -1 });

// Index on createdAt for global feed sorting (descending for latest first)
postSchema.index({ createdAt: -1 });

// Compound indexes for filtering
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ owner: 1, status: 1 });
postSchema.index({ category: 1, status: 1, createdAt: -1 });

// Pre-save middleware to normalize legacy coordinates to GeoJSON
postSchema.pre("save", function (next) {
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
postSchema.set("toJSON", {
  transform: function (doc, ret) {
    // Expose coordinates at top level for API consumers
    if (
      ret.location &&
      ret.location.geometry &&
      Array.isArray(ret.location.geometry.coordinates)
    ) {
      ret.location.coordinates = ret.location.geometry.coordinates;
      // Keep geometry for internal use but don't expose nested structure
      delete ret.location.geometry;
    }
    return ret;
  },
});

module.exports = mongoose.model("Post", postSchema);
