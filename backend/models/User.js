const mongoose = require("mongoose");
const logger = require("../utils/logger");

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
      unique: true,
      trim: true,
    },
    handle: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      sparse: true, // Allows null/undefined while maintaining uniqueness for non-null values
      index: true,
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
      enum: ["user", "tour_leader", "admin"],
      default: "user",
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

// Geospatial index for location searches (sparse since not all users have locations)
userSchema.index({ "location.geometry": "2dsphere" }, { sparse: true });

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
