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
      coordinates: {
        lat: Number,
        lng: Number,
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
  }
);

// Index for geospatial queries if coordinates are provided
// TODO: Implement proper GeoJSON + 2dsphere index later if needed
// postSchema.index({ "location.coordinates.lat": 1, "location.coordinates.lng": 1 });

// Index for filtering
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ owner: 1, status: 1 });
postSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model("Post", postSchema);
