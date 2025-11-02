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
      coordinates: { type: [Number] }, // [lng, lat]
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

// Geospatial index (if coordinates used)
listingSchema.index({ "location.coordinates": "2dsphere" });

// Full text search on common fields
listingSchema.index({ title: "text", description: "text", tags: "text" });

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

listingSchema.set("toJSON", { virtuals: true });
listingSchema.set("toObject", { virtuals: true });

// Export as 'Recipe' to keep existing routes working while repurposing the schema
// Export as 'Listing' so documents are stored in a `listings` collection.
// Existing route files `backend/routes/recipes.js` require this file and
// will continue to work because they import the model from this path.
module.exports = mongoose.model("Listing", listingSchema);
